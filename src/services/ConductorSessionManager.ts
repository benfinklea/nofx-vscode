import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ILogger, INotificationService } from './interfaces';

export interface ConductorSession {
    id: string;
    projectPath: string;
    gitRepositoryHash: string;
    sessionStartTime: number;
    terminalId?: string;
    terminalName: string;
    isActive: boolean;
    lastActiveTime: number;
    projectContext?: {
        workspaceName?: string;
        branchName?: string;
        lastCommit?: string;
    };
}

export class ConductorSessionManager {
    private readonly sessionsPath: string;
    private currentSession?: ConductorSession;
    private sessionCheckInterval?: NodeJS.Timeout;

    constructor(
        private context: vscode.ExtensionContext,
        private loggingService: ILogger,
        private notificationService: INotificationService
    ) {
        this.sessionsPath = path.join(context.globalStorageUri?.fsPath || context.extensionPath, '.nofx', 'conductor-sessions');
        this.ensureSessionsDirectory();
        this.startSessionMonitoring();
    }

    private ensureSessionsDirectory(): void {
        try {
            if (!fs.existsSync(this.sessionsPath)) {
                fs.mkdirSync(this.sessionsPath, { recursive: true });
                this.loggingService.info('Created conductor sessions directory:', this.sessionsPath);
            }
        } catch (error) {
            this.loggingService.error('Failed to create sessions directory:', error);
        }
    }

    private startSessionMonitoring(): void {
        // Check session health every 30 seconds
        this.sessionCheckInterval = setInterval(() => {
            this.checkSessionHealth();
        }, 30000);
    }

    private async checkSessionHealth(): Promise<void> {
        if (!this.currentSession || !this.currentSession.isActive) {
            return;
        }

        try {
            // Check if terminal still exists
            const terminals = vscode.window.terminals;
            const conductorTerminal = terminals.find(t => 
                t.name === this.currentSession!.terminalName && 
                !t.exitStatus
            );

            if (!conductorTerminal) {
                this.loggingService.warn('Conductor terminal no longer exists, marking session as inactive');
                this.currentSession.isActive = false;
                await this.saveCurrentSession();
            } else {
                // Update last active time
                this.currentSession.lastActiveTime = Date.now();
                await this.saveCurrentSession();
            }
        } catch (error) {
            this.loggingService.error('Error during session health check:', error);
        }
    }

    async getOrCreateSession(workspaceFolder: vscode.WorkspaceFolder): Promise<ConductorSession> {
        try {
            const projectPath = workspaceFolder.uri.fsPath;
            const gitHash = await this.getGitRepositoryHash(projectPath);
            
            // Try to find existing session for this project
            const existingSession = await this.findExistingSession(gitHash);
            
            if (existingSession && this.isSessionRecent(existingSession)) {
                this.loggingService.info('Found existing conductor session for project');
                this.currentSession = existingSession;
                return existingSession;
            }

            // Create new session
            this.loggingService.info('Creating new conductor session for project');
            const newSession = await this.createNewSession(projectPath, gitHash);
            this.currentSession = newSession;
            return newSession;
        } catch (error) {
            this.loggingService.error('Failed to get or create conductor session:', error);
            throw error;
        }
    }

    async createNewSession(projectPath: string, gitHash: string): Promise<ConductorSession> {
        const projectContext = await this.getProjectContext(projectPath);
        
        const session: ConductorSession = {
            id: this.generateSessionId(),
            projectPath,
            gitRepositoryHash: gitHash,
            sessionStartTime: Date.now(),
            terminalName: '🎵 NofX Conductor',
            isActive: false,
            lastActiveTime: Date.now(),
            projectContext
        };

        await this.saveSession(session);
        return session;
    }

    async activateSession(session: ConductorSession, terminalId?: string): Promise<void> {
        session.isActive = true;
        session.terminalId = terminalId;
        session.lastActiveTime = Date.now();
        
        this.currentSession = session;
        await this.saveCurrentSession();
        
        this.loggingService.info('Activated conductor session:', session.id);
    }

    async deactivateCurrentSession(): Promise<void> {
        if (this.currentSession) {
            this.currentSession.isActive = false;
            this.currentSession.lastActiveTime = Date.now();
            await this.saveCurrentSession();
            
            this.loggingService.info('Deactivated conductor session:', this.currentSession.id);
        }
    }

    getCurrentSession(): ConductorSession | undefined {
        return this.currentSession;
    }

    private async findExistingSession(gitHash: string): Promise<ConductorSession | undefined> {
        try {
            const sessionFiles = fs.readdirSync(this.sessionsPath);
            const sessionFile = sessionFiles.find(file => file.includes(gitHash));
            
            if (sessionFile) {
                const sessionData = fs.readFileSync(path.join(this.sessionsPath, sessionFile), 'utf8');
                return JSON.parse(sessionData) as ConductorSession;
            }
        } catch (error) {
            this.loggingService.error('Error finding existing session:', error);
        }
        
        return undefined;
    }

    private isSessionRecent(session: ConductorSession): boolean {
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const age = Date.now() - session.lastActiveTime;
        return age < maxAge;
    }

    private async saveCurrentSession(): Promise<void> {
        if (this.currentSession) {
            await this.saveSession(this.currentSession);
        }
    }

    private async saveSession(session: ConductorSession): Promise<void> {
        try {
            const fileName = `${session.gitRepositoryHash}-${session.id}.json`;
            const filePath = path.join(this.sessionsPath, fileName);
            
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
            this.loggingService.debug('Saved conductor session:', fileName);
        } catch (error) {
            this.loggingService.error('Failed to save conductor session:', error);
        }
    }

    private async getGitRepositoryHash(projectPath: string): Promise<string> {
        try {
            // Try to get git repository info
            const gitDir = path.join(projectPath, '.git');
            if (fs.existsSync(gitDir)) {
                // Use git directory path as basis for hash
                return crypto.createHash('md5').update(gitDir).digest('hex').substring(0, 12);
            }
        } catch (error) {
            this.loggingService.debug('Could not get git info, using project path hash');
        }
        
        // Fallback to project path hash
        return crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 12);
    }

    private async getProjectContext(projectPath: string): Promise<any> {
        try {
            const workspaceName = path.basename(projectPath);
            
            // Try to get git info if available
            // Note: In a real implementation, you might use a git library
            return {
                workspaceName,
                branchName: 'main', // Could be detected via git
                lastCommit: undefined // Could be detected via git
            };
        } catch (error) {
            this.loggingService.debug('Could not get full project context:', error);
            return {
                workspaceName: path.basename(projectPath)
            };
        }
    }

    private generateSessionId(): string {
        return crypto.randomBytes(8).toString('hex');
    }

    async cleanupOldSessions(): Promise<void> {
        try {
            const sessionFiles = fs.readdirSync(this.sessionsPath);
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            const now = Date.now();
            
            let cleanedCount = 0;
            
            for (const file of sessionFiles) {
                try {
                    const filePath = path.join(this.sessionsPath, file);
                    const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ConductorSession;
                    
                    if (now - sessionData.lastActiveTime > maxAge) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                    }
                } catch (error) {
                    this.loggingService.debug('Error processing session file for cleanup:', error);
                }
            }
            
            if (cleanedCount > 0) {
                this.loggingService.info(`Cleaned up ${cleanedCount} old conductor sessions`);
            }
        } catch (error) {
            this.loggingService.error('Error during session cleanup:', error);
        }
    }

    dispose(): void {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = undefined;
        }
        
        // Deactivate current session on disposal
        if (this.currentSession?.isActive) {
            this.currentSession.isActive = false;
            this.currentSession.lastActiveTime = Date.now();
            this.saveCurrentSession().catch(error => {
                this.loggingService.error('Error saving session during disposal:', error);
            });
        }
    }
}