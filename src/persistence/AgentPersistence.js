"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentPersistence = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
class AgentPersistence {
    constructor(workspaceRoot, loggingService) {
        this.loggingService = loggingService;
        this.persistenceDir = path.join(workspaceRoot, '.nofx');
        this.nofxDir = this.persistenceDir;
        this.agentSessionsDir = path.join(this.persistenceDir, 'sessions');
        this.sessionsDir = this.agentSessionsDir;
        this.stateFile = path.join(this.persistenceDir, 'agents.json');
        this.ensureDirectories();
    }
    ensureDirectories() {
        if (!fs.existsSync(this.persistenceDir)) {
            fs.mkdirSync(this.persistenceDir, { recursive: true });
            this.loggingService?.debug(`Created persistence directory: ${this.persistenceDir}`);
        }
        if (!fs.existsSync(this.agentSessionsDir)) {
            fs.mkdirSync(this.agentSessionsDir, { recursive: true });
            this.loggingService?.debug(`Created sessions directory: ${this.agentSessionsDir}`);
        }
    }
    async saveAgentState(agents) {
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
        this.loggingService?.debug(`Saved state for ${agents.length} agents`);
    }
    async loadAgentState() {
        this.loggingService?.debug(`Looking for state file: ${this.stateFile}`);
        if (!fs.existsSync(this.stateFile)) {
            this.loggingService?.debug('No state file found');
            return [];
        }
        try {
            const content = fs.readFileSync(this.stateFile, 'utf-8');
            const state = JSON.parse(content);
            this.loggingService?.debug(`Loaded state for ${state.agents.length} agents from ${this.stateFile}`);
            return state.agents;
        }
        catch (error) {
            this.loggingService?.error('Error loading state:', error);
            return [];
        }
    }
    async saveAgentSession(agentId, content, append = true) {
        const sessionFile = path.join(this.agentSessionsDir, this.getSessionFileName(agentId));
        if (append && fs.existsSync(sessionFile)) {
            const timestamp = new Date().toISOString();
            const entry = `\n\n--- ${timestamp} ---\n${content}`;
            fs.appendFileSync(sessionFile, entry);
        }
        else {
            const header = `# Agent Session: ${agentId}\n# Started: ${new Date().toISOString()}\n\n`;
            fs.writeFileSync(sessionFile, header + content);
        }
        this.loggingService?.debug(`Saved session for agent ${agentId}`);
    }
    async loadAgentSession(agentId) {
        const sessionFile = path.join(this.agentSessionsDir, this.getSessionFileName(agentId));
        if (!fs.existsSync(sessionFile)) {
            return null;
        }
        try {
            const content = fs.readFileSync(sessionFile, 'utf-8');
            this.loggingService?.debug(`Loaded session for agent ${agentId}`);
            return content;
        }
        catch (error) {
            this.loggingService?.error(`Error loading session for ${agentId}:`, error);
            return null;
        }
    }
    async saveConversationCheckpoint(agentId, userMessage, agentResponse) {
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
            }
            catch (error) {
                this.loggingService?.error('Error loading checkpoints:', error);
            }
        }
        checkpoints.push(checkpoint);
        if (checkpoints.length > 100) {
            checkpoints = checkpoints.slice(-100);
        }
        fs.writeFileSync(checkpointFile, JSON.stringify(checkpoints, null, 2));
    }
    async getAgentContextSummary(agentId) {
        const sessionContent = await this.loadAgentSession(agentId);
        if (!sessionContent) {
            return '';
        }
        const lines = sessionContent.split('\n');
        const recentLines = lines.slice(-50);
        return `Previous session context:\n${recentLines.join('\n')}`;
    }
    async archiveOldSessions(daysOld = 7) {
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
                this.loggingService?.debug(`Archived old session: ${file}`);
            }
        }
    }
    async cleanup() {
        if (fs.existsSync(this.stateFile)) {
            fs.unlinkSync(this.stateFile);
        }
        const files = fs.readdirSync(this.agentSessionsDir);
        for (const file of files) {
            fs.unlinkSync(path.join(this.agentSessionsDir, file));
        }
        this.loggingService?.info('Cleaned up all persistence data');
    }
    async exportSessionsAsMarkdown() {
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
    getSessionFileName(agentId) {
        return `${agentId}_session.md`;
    }
    async clearAll() {
        try {
            const agentStatePath = path.join(this.nofxDir, 'agents.json');
            if (fs.existsSync(agentStatePath)) {
                await fs_1.promises.unlink(agentStatePath);
            }
            const sessionFiles = await fs_1.promises.readdir(this.sessionsDir).catch(() => []);
            for (const file of sessionFiles) {
                await fs_1.promises.unlink(path.join(this.sessionsDir, file));
            }
            this.loggingService?.info('Cleared all persistence data');
        }
        catch (error) {
            this.loggingService?.error('Error clearing persistence data:', error);
            throw error;
        }
    }
    async archiveSessions(archiveName) {
        const archiveDir = path.join(this.nofxDir, 'archives');
        await this.ensureDirectories();
        if (!fs.existsSync(archiveDir)) {
            await fs_1.promises.mkdir(archiveDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archiveDir, `${archiveName}_${timestamp}`);
        if (!fs.existsSync(archivePath)) {
            await fs_1.promises.mkdir(archivePath, { recursive: true });
        }
        const sessionFiles = await fs_1.promises.readdir(this.sessionsDir).catch(() => []);
        for (const file of sessionFiles) {
            const sourcePath = path.join(this.sessionsDir, file);
            const destPath = path.join(archivePath, file);
            await fs_1.promises.copyFile(sourcePath, destPath);
        }
        const agentStatePath = path.join(this.nofxDir, 'agents.json');
        if (fs.existsSync(agentStatePath)) {
            await fs_1.promises.copyFile(agentStatePath, path.join(archivePath, 'agents.json'));
        }
        this.loggingService?.info(`Archived sessions to ${archivePath}`);
        return archivePath;
    }
}
exports.AgentPersistence = AgentPersistence;
//# sourceMappingURL=AgentPersistence.js.map