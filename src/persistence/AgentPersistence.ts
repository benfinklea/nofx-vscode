import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { Agent } from '../agents/types';

/**
 * Handles persistence of agents and their context across sessions
 */
export class AgentPersistence {
    private persistenceDir: string;
    private agentSessionsDir: string;
    private stateFile: string;
    private nofxDir: string;
    private sessionsDir: string;
    
    constructor(workspaceRoot: string) {
        // Create .nofx directory in workspace for persistence
        this.persistenceDir = path.join(workspaceRoot, '.nofx');
        this.nofxDir = this.persistenceDir; // Alias for compatibility
        this.agentSessionsDir = path.join(this.persistenceDir, 'sessions');
        this.sessionsDir = this.agentSessionsDir; // Alias for compatibility
        this.stateFile = path.join(this.persistenceDir, 'agents.json');
        
        this.ensureDirectories();
    }
    
    /**
     * Ensure persistence directories exist
     */
    private ensureDirectories() {
        if (!fs.existsSync(this.persistenceDir)) {
            fs.mkdirSync(this.persistenceDir, { recursive: true });
            console.log(`[NofX Persistence] Created persistence directory: ${this.persistenceDir}`);
        }
        if (!fs.existsSync(this.agentSessionsDir)) {
            fs.mkdirSync(this.agentSessionsDir, { recursive: true });
            console.log(`[NofX Persistence] Created sessions directory: ${this.agentSessionsDir}`);
        }
    }
    
    /**
     * Save agent state and metadata
     */
    async saveAgentState(agents: Agent[]) {
        const state = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            agents: agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                type: agent.type,
                status: agent.status,
                template: agent.template,
                tasksCompleted: agent.tasksCompleted,
                currentTask: agent.currentTask,
                sessionFile: this.getSessionFileName(agent.id),
                createdAt: agent.startTime
            }))
        };
        
        fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        console.log(`[NofX Persistence] Saved state for ${agents.length} agents`);
    }
    
    /**
     * Load saved agent state
     */
    async loadAgentState(): Promise<any[]> {
        console.log(`[NofX Persistence] Looking for state file: ${this.stateFile}`);
        
        if (!fs.existsSync(this.stateFile)) {
            console.log('[NofX Persistence] No state file found');
            return [];
        }
        
        try {
            const content = fs.readFileSync(this.stateFile, 'utf-8');
            const state = JSON.parse(content);
            console.log(`[NofX Persistence] Loaded state for ${state.agents.length} agents from ${this.stateFile}`);
            return state.agents;
        } catch (error) {
            console.error('[NofX Persistence] Error loading state:', error);
            return [];
        }
    }
    
    /**
     * Save agent's Claude session/chat history
     */
    async saveAgentSession(agentId: string, content: string, append: boolean = true) {
        const sessionFile = path.join(this.agentSessionsDir, this.getSessionFileName(agentId));
        
        if (append && fs.existsSync(sessionFile)) {
            // Append to existing session
            const timestamp = new Date().toISOString();
            const entry = `\n\n--- ${timestamp} ---\n${content}`;
            fs.appendFileSync(sessionFile, entry);
        } else {
            // Create new session file
            const header = `# Agent Session: ${agentId}\n# Started: ${new Date().toISOString()}\n\n`;
            fs.writeFileSync(sessionFile, header + content);
        }
        
        console.log(`[NofX Persistence] Saved session for agent ${agentId}`);
    }
    
    /**
     * Load agent's previous session
     */
    async loadAgentSession(agentId: string): Promise<string | null> {
        const sessionFile = path.join(this.agentSessionsDir, this.getSessionFileName(agentId));
        
        if (!fs.existsSync(sessionFile)) {
            return null;
        }
        
        try {
            const content = fs.readFileSync(sessionFile, 'utf-8');
            console.log(`[NofX Persistence] Loaded session for agent ${agentId}`);
            return content;
        } catch (error) {
            console.error(`[NofX Persistence] Error loading session for ${agentId}:`, error);
            return null;
        }
    }
    
    /**
     * Save a checkpoint of current conversation
     */
    async saveConversationCheckpoint(agentId: string, userMessage: string, agentResponse: string) {
        const checkpoint = {
            timestamp: new Date().toISOString(),
            user: userMessage,
            agent: agentResponse
        };
        
        const checkpointFile = path.join(this.agentSessionsDir, `${agentId}_checkpoint.json`);
        
        let checkpoints = [];
        if (fs.existsSync(checkpointFile)) {
            try {
                const content = fs.readFileSync(checkpointFile, 'utf-8');
                checkpoints = JSON.parse(content);
            } catch (error) {
                console.error('[NofX Persistence] Error loading checkpoints:', error);
            }
        }
        
        checkpoints.push(checkpoint);
        
        // Keep only last 100 checkpoints
        if (checkpoints.length > 100) {
            checkpoints = checkpoints.slice(-100);
        }
        
        fs.writeFileSync(checkpointFile, JSON.stringify(checkpoints, null, 2));
    }
    
    /**
     * Get context summary for agent restoration
     */
    async getAgentContextSummary(agentId: string): Promise<string> {
        const sessionContent = await this.loadAgentSession(agentId);
        
        if (!sessionContent) {
            return '';
        }
        
        // Extract last N lines or last N characters for context
        const lines = sessionContent.split('\n');
        const recentLines = lines.slice(-50); // Last 50 lines
        
        return `Previous session context:\n${recentLines.join('\n')}`;
    }
    
    /**
     * Archive old sessions
     */
    async archiveOldSessions(daysOld: number = 7) {
        const archiveDir = path.join(this.persistenceDir, 'archive');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir);
        }
        
        const now = Date.now();
        const maxAge = daysOld * 24 * 60 * 60 * 1000;
        
        const files = fs.readdirSync(this.agentSessionsDir);
        for (const file of files) {
            const filePath = path.join(this.agentSessionsDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
                const archivePath = path.join(archiveDir, file);
                fs.renameSync(filePath, archivePath);
                console.log(`[NofX Persistence] Archived old session: ${file}`);
            }
        }
    }
    
    /**
     * Clean up persistence data
     */
    async cleanup() {
        // Remove state file
        if (fs.existsSync(this.stateFile)) {
            fs.unlinkSync(this.stateFile);
        }
        
        // Remove all session files
        const files = fs.readdirSync(this.agentSessionsDir);
        for (const file of files) {
            fs.unlinkSync(path.join(this.agentSessionsDir, file));
        }
        
        console.log('[NofX Persistence] Cleaned up all persistence data');
    }
    
    /**
     * Export all sessions as markdown
     */
    async exportSessionsAsMarkdown(): Promise<string> {
        const exportPath = path.join(this.persistenceDir, `export_${Date.now()}.md`);
        let content = '# NofX Agent Sessions Export\n\n';
        
        const state = await this.loadAgentState();
        
        for (const agent of state) {
            content += `## Agent: ${agent.name} (${agent.type})\n\n`;
            content += `- ID: ${agent.id}\n`;
            content += `- Status: ${agent.status}\n`;
            content += `- Tasks Completed: ${agent.tasksCompleted}\n\n`;
            
            const session = await this.loadAgentSession(agent.id);
            if (session) {
                content += '### Session History\n\n';
                content += '```\n' + session + '\n```\n\n';
            }
        }
        
        fs.writeFileSync(exportPath, content);
        return exportPath;
    }
    
    private getSessionFileName(agentId: string): string {
        return `${agentId}_session.md`;
    }

    async clearAll() {
        try {
            // Clear agents.json
            const agentStatePath = path.join(this.nofxDir, 'agents.json');
            if (fs.existsSync(agentStatePath)) {
                await fsPromises.unlink(agentStatePath);
            }

            // Clear all session files
            const sessionFiles = await fsPromises.readdir(this.sessionsDir).catch(() => []);
            for (const file of sessionFiles) {
                await fsPromises.unlink(path.join(this.sessionsDir, file));
            }

            console.log('[NofX] Cleared all persistence data');
        } catch (error) {
            console.error('[NofX] Error clearing persistence data:', error);
            throw error;
        }
    }

    async archiveSessions(archiveName: string): Promise<string> {
        const archiveDir = path.join(this.nofxDir, 'archives');
        await this.ensureDirectories();
        if (!fs.existsSync(archiveDir)) {
            await fsPromises.mkdir(archiveDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archiveDir, `${archiveName}_${timestamp}`);
        if (!fs.existsSync(archivePath)) {
            await fsPromises.mkdir(archivePath, { recursive: true });
        }

        // Copy current sessions to archive
        const sessionFiles = await fsPromises.readdir(this.sessionsDir).catch(() => []);
        for (const file of sessionFiles) {
            const sourcePath = path.join(this.sessionsDir, file);
            const destPath = path.join(archivePath, file);
            await fsPromises.copyFile(sourcePath, destPath);
        }

        // Copy agents.json if it exists
        const agentStatePath = path.join(this.nofxDir, 'agents.json');
        if (fs.existsSync(agentStatePath)) {
            await fsPromises.copyFile(agentStatePath, path.join(archivePath, 'agents.json'));
        }

        console.log(`[NofX] Archived sessions to ${archivePath}`);
        return archivePath;
    }
}