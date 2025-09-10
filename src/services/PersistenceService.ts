import * as vscode from 'vscode';
import { Agent } from '../agents/types';
import { ILogger, IEventEmitter, IEventSubscriber, IPersistenceService } from './interfaces';
import { EVENTS } from './EventConstants';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
/**
 * Unified persistence service using VS Code's reliable storage APIs
 * Replaces PersistenceService, PersistenceService, and MessagePersistenceService
 */
export class PersistenceService implements IPersistenceService, vscode.Disposable {
    private static readonly STORAGE_VERSION = '2.0.0';
    private static readonly STORAGE_KEYS = {
        VERSION: 'nofx.storage.version',
        AGENTS: 'nofx.agents',
        SESSIONS: 'nofx.sessions',
        ACTIVE_SESSION_CACHE: 'nofx.sessions.active',
        TEMPLATES_CACHE: 'nofx.templates.cache',
        MIGRATION_STATUS: 'nofx.migration.status'
    } as const;

    private disposables: vscode.Disposable[] = [];
    private sessionCache = new Map<string, AgentSession>();

    constructor(
        private context: vscode.ExtensionContext,
        private loggingService: ILogger,
        private eventBus: IEventEmitter & IEventSubscriber
    ) {
        this.initializeStorage();
    }

    // Helper to publish events
    private publishEvent(event: string, data?: any): void {
        if (this.eventBus && 'publish' in this.eventBus) {
            (this.eventBus as any).publish(event, data);
        } else if (this.eventBus && 'emit' in this.eventBus) {
            this.eventBus.emit(event, data);
        }
    }

    // Adapter methods for backward compatibility
    async saveAgentState(agents: any[]): Promise<void> {
        // Save each agent
        for (const agent of agents) {
            await this.saveAgent(agent);
        }
    }

    async loadAgentState(): Promise<any[]> {
        return this.loadAgents();
    }

    async saveAgentSession(agentId: string, message: string): Promise<void> {
        // Create a simple session entry
        const session = {
            agentId,
            timestamp: new Date(),
            message
        };
        // TODO: appendToSession not implemented - using saveSession instead
        // await this.appendToSession(agentId, JSON.stringify(session));
    }

    async getAgentContextSummary(agentId: string): Promise<string | undefined> {
        // Return a simple summary - could be enhanced
        const sessions = await this.getActiveSessions();
        const agentSession = sessions.find(s => s.id === agentId);
        return agentSession ? `Session ${agentSession.id} started at ${agentSession.createdAt}` : undefined;
    }

    clearAll(): void {
        this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.AGENTS, undefined);
        this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.SESSIONS, undefined);
    }

    // ===============================
    // AGENT LIFECYCLE MANAGEMENT
    // ===============================

    async saveAgent(agent: Agent): Promise<void> {
        try {
            const agents = await this.getStoredAgents();
            const existingIndex = agents.findIndex(a => a.id === agent.id);

            const agentData: StoredAgent = {
                id: agent.id,
                name: agent.name,
                type: agent.type,
                status: agent.status,
                templateId: agent.template?.id,
                tasksCompleted: agent.tasksCompleted || 0,
                createdAt: agent.startTime || new Date(),
                lastActiveAt: new Date(),
                workingDirectory: agent.workingDirectory
            };

            if (existingIndex >= 0) {
                agents[existingIndex] = agentData;
            } else {
                agents.push(agentData);
            }

            await this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.AGENTS, agents);

            this.publishEvent(EVENTS.AGENT_SAVED, {
                agentId: agent.id,
                agentName: agent.name
            });

            this.loggingService.debug('Agent saved to persistent storage', { agentId: agent.id });
        } catch (error) {
            this.loggingService.error('Failed to save agent', error as Error);
            throw error;
        }
    }

    async loadAgents(): Promise<StoredAgent[]> {
        try {
            const agents = await this.getStoredAgents();
            this.loggingService.debug(`Loaded ${agents.length} agents from storage`);
            return agents;
        } catch (error) {
            this.loggingService.error('Failed to load agents', error as Error);
            return [];
        }
    }

    // Alias for loadAgents to match expected interface
    async getAgents(): Promise<StoredAgent[]> {
        return this.loadAgents();
    }

    async removeAgent(agentId: string): Promise<void> {
        try {
            const agents = await this.getStoredAgents();
            const filteredAgents = agents.filter(a => a.id !== agentId);

            await this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.AGENTS, filteredAgents);

            // Also remove associated session
            await this.removeSession(agentId);

            this.publishEvent(EVENTS.AGENT_REMOVED, { agentId });
            this.loggingService.debug('Agent removed from storage', { agentId });
        } catch (error) {
            this.loggingService.error('Failed to remove agent', error as Error);
            throw error;
        }
    }

    // ===============================
    // SESSION MANAGEMENT
    // ===============================

    async createSession(agent: Agent): Promise<AgentSession> {
        try {
            const sessionId = `session-${agent.id}-${Date.now()}`;
            const now = new Date();

            const session: AgentSession = {
                id: sessionId,
                name: `${agent.name} - ${now.toLocaleString()}`,
                agentId: agent.id,
                agentName: agent.name,
                agentType: agent.type,

                createdAt: now,
                lastActiveAt: now,
                sessionDuration: 0,
                expiresAt: new Date(now.getTime() + 5 * 60 * 60 * 1000), // 5 hours

                status: 'active',
                isClaudeSessionActive: true,

                conversationHistory: [],
                completedTasks: [],
                currentTask: undefined,

                workingDirectory: agent.workingDirectory,
                gitBranch: await this.getCurrentGitBranch(),

                // Store only template reference, not full data
                templateId: agent.template?.id,
                capabilities: agent.capabilities || [],
                systemPrompt: agent.template?.systemPrompt || '',

                tasksCompleted: 0,
                totalOutputLines: 0
            };

            // Cache in memory for active sessions
            this.sessionCache.set(sessionId, session);

            // Persist to VS Code storage
            await this.saveSession(session);

            this.publishEvent(EVENTS.SESSION_CREATED, {
                sessionId,
                agentId: agent.id,
                agentName: agent.name
            });

            this.loggingService.info(`Session created: ${sessionId} for ${agent.name}`);
            return session;
        } catch (error) {
            this.loggingService.error('Failed to create session', error as Error);
            throw error;
        }
    }

    async addMessage(sessionId: string, message: Omit<ConversationMessage, 'id' | 'timestamp'>): Promise<void> {
        try {
            const session = this.sessionCache.get(sessionId) || (await this.loadSession(sessionId));
            if (!session) {
                this.loggingService.warn(`Session ${sessionId} not found for message`);
                return;
            }

            const fullMessage: ConversationMessage = {
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date(),
                ...message
            };

            session.conversationHistory.push(fullMessage);
            session.lastActiveAt = new Date();
            session.totalOutputLines++;

            // Keep only last 500 messages to prevent excessive storage usage
            if (session.conversationHistory.length > 500) {
                session.conversationHistory = session.conversationHistory.slice(-500);
            }

            // Update cache and storage
            this.sessionCache.set(sessionId, session);
            await this.saveSession(session);
        } catch (error) {
            this.loggingService.error('Failed to add message to session', error as Error);
            throw error;
        }
    }

    async startTask(sessionId: string, task: Omit<SessionTask, 'id' | 'assignedAt' | 'status'>): Promise<string> {
        try {
            const session = this.sessionCache.get(sessionId) || (await this.loadSession(sessionId));
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const sessionTask: SessionTask = {
                ...task,
                id: taskId,
                assignedAt: new Date(),
                status: 'in_progress',
                filesModified: [],
                commandsExecuted: []
            };

            session.currentTask = sessionTask;
            session.lastActiveAt = new Date();

            this.sessionCache.set(sessionId, session);
            await this.saveSession(session);

            this.publishEvent(EVENTS.SESSION_TASK_STARTED, {
                sessionId,
                taskId,
                taskTitle: task.title
            });

            return taskId;
        } catch (error) {
            this.loggingService.error('Failed to start task', error as Error);
            throw error;
        }
    }

    async completeTask(sessionId: string, taskId: string, success: boolean = true): Promise<void> {
        try {
            const session = this.sessionCache.get(sessionId) || (await this.loadSession(sessionId));
            if (!session?.currentTask || session.currentTask.id !== taskId) {
                return;
            }

            const task = session.currentTask;
            task.status = success ? 'completed' : 'failed';
            task.completedAt = new Date();
            task.duration = task.completedAt.getTime() - task.assignedAt.getTime();

            session.completedTasks.push(task);
            session.currentTask = undefined;
            session.tasksCompleted = success ? session.tasksCompleted + 1 : session.tasksCompleted;
            session.lastActiveAt = new Date();

            this.sessionCache.set(sessionId, session);
            await this.saveSession(session);

            this.publishEvent(EVENTS.SESSION_TASK_COMPLETED, {
                sessionId,
                taskId,
                success,
                duration: task.duration
            });
        } catch (error) {
            this.loggingService.error('Failed to complete task', error as Error);
            throw error;
        }
    }

    async archiveSession(sessionId: string): Promise<void> {
        try {
            const session = this.sessionCache.get(sessionId) || (await this.loadSession(sessionId));
            if (!session) {
                return;
            }

            session.status = 'archived';
            session.isClaudeSessionActive = false;

            // Move from active to archived storage
            await this.moveSessionToArchive(session);

            // Remove from cache
            this.sessionCache.delete(sessionId);

            this.publishEvent(EVENTS.SESSION_ARCHIVED, {
                sessionId,
                agentName: session.agentName
            });
        } catch (error) {
            this.loggingService.error('Failed to archive session', error as Error);
            throw error;
        }
    }

    async getActiveSessions(): Promise<AgentSession[]> {
        try {
            const sessions = await this.getStoredSessions();
            return sessions.filter(s => s.status === 'active');
        } catch (error) {
            this.loggingService.error('Failed to get active sessions', error as Error);
            return [];
        }
    }

    // ===============================
    // DATA MIGRATION & VERSIONING
    // ===============================

    private async initializeStorage(): Promise<void> {
        try {
            const currentVersion = this.context.globalState.get<string>(PersistenceService.STORAGE_KEYS.VERSION);

            if (!currentVersion) {
                await this.performInitialMigration();
            } else if (currentVersion !== PersistenceService.STORAGE_VERSION) {
                await this.performVersionMigration(currentVersion);
            }

            await this.context.globalState.update(
                PersistenceService.STORAGE_KEYS.VERSION,
                PersistenceService.STORAGE_VERSION
            );
            this.loggingService.info('Persistence storage initialized', {
                version: PersistenceService.STORAGE_VERSION
            });
        } catch (error) {
            this.loggingService.error('Failed to initialize storage', error as Error);
            throw error;
        }
    }

    private async performInitialMigration(): Promise<void> {
        this.loggingService.info('Performing initial migration to unified persistence');

        try {
            // Migrate from file-based persistence if exists
            await this.migrateFromFilePersistence();

            await this.context.globalState.update(PersistenceService.STORAGE_KEYS.MIGRATION_STATUS, {
                initialMigration: true,
                completedAt: new Date().toISOString()
            });

            this.loggingService.info('Initial migration completed successfully');
        } catch (error) {
            this.loggingService.error('Initial migration failed', error as Error);
            throw error;
        }
    }

    private async performVersionMigration(fromVersion: string): Promise<void> {
        this.loggingService.info('Performing version migration', {
            from: fromVersion,
            to: PersistenceService.STORAGE_VERSION
        });

        // Future version migrations would go here
        switch (fromVersion) {
            case '1.0.0':
                await this.migrateFromV1ToV2();
                break;
            default:
                this.loggingService.warn('Unknown version for migration', { version: fromVersion });
        }
    }

    private async migrateFromFilePersistence(): Promise<void> {
        const fs = require('fs');
        const path = require('path');

        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return;
            }

            const nofxDir = path.join(workspaceRoot, '.nofx');
            if (!fs.existsSync(nofxDir)) {
                return;
            }

            // Migrate agents.json
            const agentsFile = path.join(nofxDir, 'agents.json');
            if (fs.existsSync(agentsFile)) {
                const agentsData = JSON.parse(fs.readFileSync(agentsFile, 'utf-8'));
                if (agentsData.agents && Array.isArray(agentsData.agents)) {
                    await this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.AGENTS, agentsData.agents);
                    this.loggingService.debug(`Migrated ${agentsData.agents.length} agents from file storage`);
                }
            }

            // Migrate session files
            const sessionsDir = path.join(nofxDir, 'sessions');
            if (fs.existsSync(sessionsDir)) {
                const sessionFiles = fs.readdirSync(sessionsDir).filter((f: string) => f.endsWith('.json'));
                const migratedSessions: AgentSession[] = [];

                for (const file of sessionFiles) {
                    try {
                        const sessionData = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf-8'));
                        // Convert file-based session to new format
                        const session = this.convertLegacySession(sessionData);
                        migratedSessions.push(session);
                    } catch (error) {
                        this.loggingService.warn('Failed to migrate session file', { file, error });
                    }
                }

                if (migratedSessions.length > 0) {
                    await this.context.workspaceState.update(
                        PersistenceService.STORAGE_KEYS.SESSIONS,
                        migratedSessions
                    );
                    this.loggingService.debug(`Migrated ${migratedSessions.length} sessions from file storage`);
                }
            }
        } catch (error) {
            this.loggingService.error('File persistence migration failed', error as Error);
            // Don't throw - continue with empty storage
        }
    }

    private convertLegacySession(legacySession: any): AgentSession {
        return {
            id: legacySession.id,
            name: legacySession.name,
            agentId: legacySession.agentId,
            agentName: legacySession.agentName,
            agentType: legacySession.agentType,

            createdAt: new Date(legacySession.createdAt),
            lastActiveAt: new Date(legacySession.lastActiveAt || legacySession.createdAt),
            sessionDuration: legacySession.sessionDuration || 0,
            expiresAt: legacySession.expiresAt ? new Date(legacySession.expiresAt) : undefined,

            status: legacySession.status || 'archived', // Assume old sessions are archived
            isClaudeSessionActive: false,

            conversationHistory: legacySession.conversationHistory || [],
            completedTasks: legacySession.completedTasks || [],
            currentTask: legacySession.currentTask,

            workingDirectory: legacySession.workingDirectory,
            gitBranch: legacySession.gitBranch,

            // Extract template ID instead of storing full template
            templateId: legacySession.template?.id,
            capabilities: legacySession.capabilities || [],
            systemPrompt: legacySession.systemPrompt || '',

            tasksCompleted: legacySession.tasksCompleted || 0,
            totalOutputLines: legacySession.totalOutputLines || 0
        };
    }

    private async migrateFromV1ToV2(): Promise<void> {
        // Future migration logic for version updates
        this.loggingService.info('No migration needed from v1 to v2');
    }

    // ===============================
    // UTILITY & CLEANUP METHODS
    // ===============================

    async clearAllData(): Promise<void> {
        try {
            await Promise.all([
                this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.AGENTS, undefined),
                this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.SESSIONS, undefined),
                this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.ACTIVE_SESSION_CACHE, undefined),
                this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.TEMPLATES_CACHE, undefined)
            ]);

            this.sessionCache.clear();
            this.loggingService.info('All persistence data cleared');
        } catch (error) {
            this.loggingService.error('Failed to clear all data', error as Error);
            throw error;
        }
    }

    async getStorageStats(): Promise<{ agents: number; sessions: number; storageVersion: string }> {
        try {
            const agents = await this.getStoredAgents();
            const sessions = await this.getStoredSessions();
            const version = this.context.globalState.get<string>(PersistenceService.STORAGE_KEYS.VERSION) || 'unknown';

            return {
                agents: agents.length,
                sessions: sessions.length,
                storageVersion: version
            };
        } catch (error) {
            this.loggingService.error('Failed to get storage stats', error as Error);
            return { agents: 0, sessions: 0, storageVersion: 'error' };
        }
    }

    // ===============================
    // PRIVATE HELPER METHODS
    // ===============================

    private async getStoredAgents(): Promise<StoredAgent[]> {
        return this.context.workspaceState.get<StoredAgent[]>(PersistenceService.STORAGE_KEYS.AGENTS) || [];
    }

    private async getStoredSessions(): Promise<AgentSession[]> {
        return this.context.workspaceState.get<AgentSession[]>(PersistenceService.STORAGE_KEYS.SESSIONS) || [];
    }

    private async saveSession(session: AgentSession): Promise<void> {
        const sessions = await this.getStoredSessions();
        const existingIndex = sessions.findIndex(s => s.id === session.id);

        if (existingIndex >= 0) {
            sessions[existingIndex] = session;
        } else {
            sessions.push(session);
        }

        await this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.SESSIONS, sessions);
    }

    private async loadSession(sessionId: string): Promise<AgentSession | null> {
        const sessions = await this.getStoredSessions();
        return sessions.find(s => s.id === sessionId) || null;
    }

    private async removeSession(sessionId: string): Promise<void> {
        const sessions = await this.getStoredSessions();
        const filteredSessions = sessions.filter(s => s.id !== sessionId);
        await this.context.workspaceState.update(PersistenceService.STORAGE_KEYS.SESSIONS, filteredSessions);
        this.sessionCache.delete(sessionId);
    }

    private async moveSessionToArchive(session: AgentSession): Promise<void> {
        // For now, archived sessions stay in the same storage but with archived status
        // In the future, we could move to separate archived storage for performance
        await this.saveSession(session);
    }

    private async getCurrentGitBranch(): Promise<string | undefined> {
        try {
            const { execSync } = require('child_process');
            return execSync('git branch --show-current', {
                encoding: 'utf8',
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            }).trim();
        } catch {
            return undefined;
        }
    }

    // Missing IPersistenceService methods - stub implementations
    async restoreSession(sessionId: string): Promise<boolean> {
        try {
            const session = await this.loadSession(sessionId);
            return !!session;
        } catch {
            return false;
        }
    }

    async getSessionSummaries(): Promise<any[]> {
        try {
            // Get sessions from cache
            const sessions = Array.from(this.sessionCache.values());
            return sessions.map(session => ({
                id: session.id,
                agentId: session.agentId,
                agentName: session.agentName,
                createdAt: session.createdAt,
                tasksCompleted: session.tasksCompleted,
                lastActiveAt: session.lastActiveAt
            }));
        } catch {
            return [];
        }
    }

    async getActiveSession(): Promise<string | undefined> {
        // Return the most recently active session
        const sessions = Array.from(this.sessionCache.values());
        if (sessions.length === 0) return undefined;

        return sessions.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())[0]?.id;
    }

    async updateSession(sessionId: string, updates: any): Promise<void> {
        try {
            const session = this.sessionCache.get(sessionId) || (await this.loadSession(sessionId));
            if (session) {
                Object.assign(session, updates);
                this.sessionCache.set(sessionId, session);
                await this.saveSession(session);
            }
        } catch (error) {
            this.loggingService.error('Failed to update session', error as Error);
        }
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.sessionCache.clear();
        this.loggingService.debug('PersistenceService disposed');
    }
}

// ===============================
// TYPE DEFINITIONS
// ===============================

export interface StoredAgent {
    id: string;
    name: string;
    type: string;
    status: string;
    templateId?: string;
    tasksCompleted: number;
    createdAt: Date;
    lastActiveAt: Date;
    workingDirectory?: string;
}

export interface AgentSession {
    // Basic session info
    id: string;
    name: string;
    agentId: string;
    agentName: string;
    agentType: string;

    // Session metadata
    createdAt: Date;
    lastActiveAt: Date;
    sessionDuration: number;
    expiresAt?: Date;

    // Session state
    status: 'active' | 'expired' | 'archived' | 'paused';
    isClaudeSessionActive: boolean;

    // Context data
    conversationHistory: ConversationMessage[];
    currentTask?: SessionTask;
    completedTasks: SessionTask[];
    workingDirectory?: string;
    gitBranch?: string;

    // Agent configuration (references only)
    templateId?: string; // Reference instead of full template
    capabilities: string[];
    systemPrompt: string;

    // Performance metrics
    tasksCompleted: number;
    totalOutputLines: number;
    averageResponseTime?: number;
}

export interface ConversationMessage {
    id: string;
    timestamp: Date;
    type: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    metadata?: {
        taskId?: string;
        fileContext?: string[];
        commandExecuted?: string;
        errorOccurred?: boolean;
    };
}

export interface SessionTask {
    id: string;
    title: string;
    description: string;
    assignedAt: Date;
    completedAt?: Date;
    duration?: number;
    status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    filesModified: string[];
    commandsExecuted: string[];
    notes?: string;
}
