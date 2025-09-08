import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    AgentSession,
    ConversationMessage,
    SessionTask,
    SessionSummary,
    SessionArchive,
    SessionRestoreOptions
} from '../types/session';
import { Agent } from '../agents/types';
import { ILoggingService, IEventBus } from './interfaces';
import { DOMAIN_EVENTS } from './EventConstants';

export class SessionPersistenceService {
    private readonly sessionStorePath: string;
    private readonly archiveStorePath: string;
    private activeSessions: Map<string, AgentSession> = new Map();
    private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private loggingService?: ILoggingService,
        private eventBus?: IEventBus
    ) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.sessionStorePath = path.join(workspaceRoot, '.nofx', 'sessions');
        this.archiveStorePath = path.join(workspaceRoot, '.nofx', 'archives');

        // Ensure directories exist
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        [this.sessionStorePath, this.archiveStorePath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Create a new session for an agent
     */
    async createSession(agent: Agent, workingDirectory?: string): Promise<AgentSession> {
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
            expiresAt: new Date(now.getTime() + 5 * 60 * 60 * 1000), // 5 hours from now

            status: 'active',
            isClaudeSessionActive: true,

            conversationHistory: [],
            completedTasks: [],
            workingDirectory,
            gitBranch: await this.getCurrentGitBranch(),

            template: agent.template,
            capabilities: agent.capabilities || [],
            systemPrompt: agent.template?.systemPrompt || '',

            tasksCompleted: agent.tasksCompleted || 0,
            totalOutputLines: 0
        };

        // Store in memory
        this.activeSessions.set(sessionId, session);

        // Set up timeout monitoring
        this.setupSessionTimeout(session);

        // Persist to disk
        await this.saveSession(session);

        // Publish event
        this.eventBus?.publish(DOMAIN_EVENTS.SESSION_CREATED, {
            sessionId: session.id,
            agentId: agent.id,
            agentName: agent.name
        });

        this.loggingService?.info(`Created session ${sessionId} for agent ${agent.name}`);
        return session;
    }

    /**
     * Add a message to the session conversation history
     */
    async addMessage(sessionId: string, message: Omit<ConversationMessage, 'id' | 'timestamp'>): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            this.loggingService?.warn(`Session ${sessionId} not found for message`);
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

        // Keep only last 1000 messages to prevent excessive memory usage
        if (session.conversationHistory.length > 1000) {
            session.conversationHistory = session.conversationHistory.slice(-1000);
        }

        await this.saveSession(session);
    }

    /**
     * Start a task in the session
     */
    async startTask(sessionId: string, task: Omit<SessionTask, 'id' | 'assignedAt' | 'status'>): Promise<string> {
        const session = this.activeSessions.get(sessionId);
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

        await this.saveSession(session);

        this.eventBus?.publish(DOMAIN_EVENTS.SESSION_TASK_STARTED, {
            sessionId,
            taskId,
            taskTitle: task.title
        });

        return taskId;
    }

    /**
     * Complete a task in the session
     */
    async completeTask(sessionId: string, taskId: string, success: boolean = true): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.currentTask || session.currentTask.id !== taskId) {
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

        await this.saveSession(session);

        this.eventBus?.publish(DOMAIN_EVENTS.SESSION_TASK_COMPLETED, {
            sessionId,
            taskId,
            success,
            duration: task.duration
        });
    }

    /**
     * Get all session summaries for UI display
     */
    async getSessionSummaries(): Promise<SessionSummary[]> {
        const summaries: SessionSummary[] = [];

        // Get active sessions
        for (const session of this.activeSessions.values()) {
            summaries.push(this.createSessionSummary(session));
        }

        // Get archived sessions
        try {
            const archiveFiles = fs.readdirSync(this.archiveStorePath).filter(f => f.endsWith('.json'));
            for (const file of archiveFiles) {
                const archivePath = path.join(this.archiveStorePath, file);
                const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));

                for (const session of archiveData.sessions || []) {
                    summaries.push(this.createSessionSummary(session));
                }
            }
        } catch (error) {
            this.loggingService?.error('Error reading archived sessions', error as Error);
        }

        return summaries.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
    }

    /**
     * Archive a session (move from active to archived storage)
     */
    async archiveSession(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return;
        }

        session.status = 'archived';
        session.isClaudeSessionActive = false;

        // Remove from active sessions
        this.activeSessions.delete(sessionId);

        // Clear timeout
        const timeout = this.sessionTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.sessionTimeouts.delete(sessionId);
        }

        // Save to archive
        await this.saveToArchive(session);

        // Remove from active storage
        const sessionFile = path.join(this.sessionStorePath, `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
        }

        this.eventBus?.publish(DOMAIN_EVENTS.SESSION_ARCHIVED, {
            sessionId,
            agentName: session.agentName
        });

        this.loggingService?.info(`Archived session ${sessionId} for ${session.agentName}`);
    }

    /**
     * Restore a session (create new agent with previous context)
     */
    async restoreSession(sessionId: string, options: SessionRestoreOptions): Promise<AgentSession | null> {
        // Try to find session in active or archived storage
        let session = this.activeSessions.get(sessionId);

        if (!session) {
            session = (await this.loadArchivedSession(sessionId)) ?? undefined;
        }

        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Create a new session based on the old one
        const newSessionId = `restored-${sessionId}-${Date.now()}`;
        const now = new Date();

        const restoredSession: AgentSession = {
            ...session,
            id: newSessionId,
            name: `Restored: ${session.name}`,
            createdAt: now,
            lastActiveAt: now,
            sessionDuration: 0,
            expiresAt: new Date(now.getTime() + 5 * 60 * 60 * 1000),
            status: 'active',
            isClaudeSessionActive: true,

            // Apply restoration options
            conversationHistory: options.restoreConversationHistory
                ? options.summarizeHistory
                    ? await this.summarizeHistory(session.conversationHistory)
                    : session.conversationHistory
                : [],
            currentTask: options.restoreCurrentTask ? session.currentTask : undefined
        };

        // Store new session
        this.activeSessions.set(newSessionId, restoredSession);
        this.setupSessionTimeout(restoredSession);
        await this.saveSession(restoredSession);

        this.eventBus?.publish(DOMAIN_EVENTS.SESSION_RESTORED, {
            originalSessionId: sessionId,
            newSessionId: newSessionId,
            agentName: session.agentName
        });

        return restoredSession;
    }

    /**
     * Handle Claude session timeout (after 5 hours)
     */
    private setupSessionTimeout(session: AgentSession): void {
        if (!session.expiresAt) return;

        const timeUntilExpiry = session.expiresAt.getTime() - Date.now();

        if (timeUntilExpiry <= 0) {
            // Already expired
            this.handleSessionExpiry(session.id);
            return;
        }

        // Set up timeout
        const timeout = setTimeout(() => {
            this.handleSessionExpiry(session.id);
        }, timeUntilExpiry);

        this.sessionTimeouts.set(session.id, timeout);

        // Set up warning 30 minutes before expiry
        const warningTime = Math.max(0, timeUntilExpiry - 30 * 60 * 1000);
        setTimeout(() => {
            this.eventBus?.publish(DOMAIN_EVENTS.SESSION_EXPIRY_WARNING, {
                sessionId: session.id,
                agentName: session.agentName,
                expiresAt: session.expiresAt
            });
        }, warningTime);
    }

    private async handleSessionExpiry(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        session.status = 'expired';
        session.isClaudeSessionActive = false;

        await this.saveSession(session);

        this.eventBus?.publish(DOMAIN_EVENTS.SESSION_EXPIRED, {
            sessionId,
            agentName: session.agentName
        });

        vscode.window
            .showWarningMessage(
                `Claude session for ${session.agentName} has expired after 5 hours. You can restore the session with previous context.`,
                'Restore Session',
                'Archive Session'
            )
            .then(selection => {
                if (selection === 'Restore Session') {
                    vscode.commands.executeCommand('nofx.restoreSession', sessionId);
                } else if (selection === 'Archive Session') {
                    this.archiveSession(sessionId);
                }
            });
    }

    private createSessionSummary(session: AgentSession): SessionSummary {
        const duration = this.formatDuration(session.lastActiveAt.getTime() - session.createdAt.getTime());
        const expiresIn = session.expiresAt ? this.formatTimeRemaining(session.expiresAt) : undefined;

        return {
            sessionId: session.id,
            name: session.name,
            agentName: session.agentName,
            agentType: session.agentType,
            status: session.status === 'paused' ? 'active' : session.status,
            createdAt: session.createdAt,
            lastActiveAt: session.lastActiveAt,
            duration,
            tasksCompleted: session.tasksCompleted,
            isRestorable: session.status === 'expired' || session.status === 'archived',
            expiresIn
        };
    }

    private async getCurrentGitBranch(): Promise<string | undefined> {
        try {
            const { execSync } = require('child_process');
            return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
        } catch {
            return undefined;
        }
    }

    private async summarizeHistory(history: ConversationMessage[]): Promise<ConversationMessage[]> {
        // For now, just keep the last 50 messages + system messages
        const systemMessages = history.filter(m => m.type === 'system');
        const recentMessages = history.slice(-50);

        // Create a summary message
        const summaryMessage: ConversationMessage = {
            id: `summary-${Date.now()}`,
            timestamp: new Date(),
            type: 'system',
            content: `[Session Context Summary: Previous session had ${history.length} messages and completed ${this.countTasksInHistory(history)} tasks. Key topics: ${this.extractTopics(history).join(', ')}]`
        };

        return [summaryMessage, ...systemMessages, ...recentMessages];
    }

    private countTasksInHistory(history: ConversationMessage[]): number {
        return history.filter(m => m.metadata?.taskId).length;
    }

    private extractTopics(history: ConversationMessage[]): string[] {
        // Simple topic extraction - look for common programming terms
        const topics = new Set<string>();
        const topicKeywords = ['react', 'typescript', 'python', 'api', 'database', 'test', 'component', 'function'];

        for (const message of history) {
            const content = message.content.toLowerCase();
            for (const keyword of topicKeywords) {
                if (content.includes(keyword)) {
                    topics.add(keyword);
                }
            }
        }

        return Array.from(topics).slice(0, 5);
    }

    private formatDuration(ms: number): string {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    private formatTimeRemaining(expiresAt: Date): string {
        const remaining = expiresAt.getTime() - Date.now();
        if (remaining <= 0) return 'Expired';

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        return `${hours}h ${minutes}m`;
    }

    private async saveSession(session: AgentSession): Promise<void> {
        const sessionFile = path.join(this.sessionStorePath, `${session.id}.json`);
        await fs.promises.writeFile(sessionFile, JSON.stringify(session, null, 2));
    }

    private async saveToArchive(session: AgentSession): Promise<void> {
        const archiveFile = path.join(this.archiveStorePath, `${session.id}.json`);
        const archive: SessionArchive = {
            sessions: [session],
            exportedAt: new Date(),
            totalSessions: 1,
            formatVersion: '1.0'
        };
        await fs.promises.writeFile(archiveFile, JSON.stringify(archive, null, 2));
    }

    private async loadArchivedSession(sessionId: string): Promise<AgentSession | null> {
        try {
            const archiveFile = path.join(this.archiveStorePath, `${sessionId}.json`);
            if (fs.existsSync(archiveFile)) {
                const archive = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
                return archive.sessions?.[0] || null;
            }
        } catch (error) {
            this.loggingService?.error(`Error loading archived session ${sessionId}`, error as Error);
        }
        return null;
    }

    /**
     * Load active sessions on startup
     */
    async loadActiveSessions(): Promise<void> {
        try {
            const sessionFiles = fs.readdirSync(this.sessionStorePath).filter(f => f.endsWith('.json'));

            for (const file of sessionFiles) {
                try {
                    const sessionPath = path.join(this.sessionStorePath, file);
                    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

                    // Parse dates
                    sessionData.createdAt = new Date(sessionData.createdAt);
                    sessionData.lastActiveAt = new Date(sessionData.lastActiveAt);
                    if (sessionData.expiresAt) {
                        sessionData.expiresAt = new Date(sessionData.expiresAt);
                    }

                    // Check if expired
                    if (sessionData.expiresAt && sessionData.expiresAt <= new Date()) {
                        sessionData.status = 'expired';
                        sessionData.isClaudeSessionActive = false;
                    }

                    this.activeSessions.set(sessionData.id, sessionData);

                    if (sessionData.status === 'active') {
                        this.setupSessionTimeout(sessionData);
                    }
                } catch (error) {
                    this.loggingService?.error(`Error loading session from ${file}`, error as Error);
                }
            }

            this.loggingService?.info(`Loaded ${this.activeSessions.size} sessions`);
        } catch (error) {
            this.loggingService?.error('Error loading active sessions', error as Error);
        }
    }

    /**
     * Cleanup and dispose
     */
    dispose(): void {
        // Clear all timeouts
        for (const timeout of this.sessionTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.sessionTimeouts.clear();

        // Save all active sessions
        for (const session of this.activeSessions.values()) {
            this.saveSession(session).catch(err => this.loggingService?.error('Error saving session on dispose', err));
        }
    }
}
