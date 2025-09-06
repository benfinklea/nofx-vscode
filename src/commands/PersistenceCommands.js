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
exports.PersistenceCommands = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const interfaces_1 = require("../services/interfaces");
const AgentPersistence_1 = require("../persistence/AgentPersistence");
class PersistenceCommands {
    constructor(container) {
        this.agentManager = container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
    }
    register() {
        this.commandService.register('nofx.exportSessions', this.exportSessions.bind(this));
        this.commandService.register('nofx.archiveSessions', this.archiveSessions.bind(this));
        this.commandService.register('nofx.clearPersistence', this.clearPersistence.bind(this));
    }
    async exportSessions() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace open. Cannot export sessions.');
            return;
        }
        const persistence = new AgentPersistence_1.AgentPersistence(workspaceFolder.uri.fsPath);
        const exportPath = await persistence.exportSessionsAsMarkdown();
        const selection = await this.notificationService.showInformation(`Sessions exported to: ${exportPath}`, 'Open File');
        if (selection === 'Open File') {
            const uri = vscode.Uri.file(exportPath);
            await vscode.window.showTextDocument(uri);
        }
    }
    async archiveSessions() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace open. Cannot archive sessions.');
            return;
        }
        const archiveName = await this.notificationService.showInputBox({
            prompt: 'Enter archive name',
            value: `archive-${new Date().toISOString().split('T')[0]}`,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Archive name is required';
                }
                if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
                    return 'Archive name can only contain letters, numbers, hyphens, and underscores';
                }
                return undefined;
            }
        });
        if (!archiveName) {
            return;
        }
        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Archiving sessions...',
            cancellable: false
        }, async (progress) => {
            try {
                const persistence = new AgentPersistence_1.AgentPersistence(workspaceFolder.uri.fsPath);
                const archivePath = await persistence.archiveSessions(archiveName);
                progress.report({ increment: 100 });
                const selection = await this.notificationService.showInformation(`Sessions archived to: ${archivePath}`, 'Show in Explorer');
                if (selection === 'Show in Explorer') {
                    const uri = vscode.Uri.file(path.dirname(archivePath));
                    await vscode.commands.executeCommand('revealInExplorer', uri);
                }
            }
            catch (error) {
                await this.notificationService.showError(`Failed to archive sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    async clearPersistence() {
        const confirmed = await this.notificationService.confirmDestructive('Clear all saved agent data and sessions? This cannot be undone.', 'Clear All');
        if (!confirmed) {
            return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace open');
            return;
        }
        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Clearing persistence data...',
            cancellable: false
        }, async (progress) => {
            try {
                const persistence = new AgentPersistence_1.AgentPersistence(workspaceFolder.uri.fsPath);
                progress.report({ message: 'Clearing agent data...', increment: 33 });
                await persistence.clearAll();
                progress.report({ message: 'Clearing .nofx directory...', increment: 33 });
                const nofxDir = path.join(workspaceFolder.uri.fsPath, '.nofx');
                try {
                    await fs_1.promises.access(nofxDir);
                    await this.clearDirectory(nofxDir);
                }
                catch (error) {
                }
                progress.report({ message: 'Clearing active agents...', increment: 34 });
                const agents = this.agentManager.getActiveAgents();
                for (const agent of agents) {
                    await this.agentManager.removeAgent(agent.id);
                }
                await this.notificationService.showInformation('All persistence data cleared');
            }
            catch (error) {
                await this.notificationService.showError(`Failed to clear persistence: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    async clearDirectory(dirPath) {
        const files = await fs_1.promises.readdir(dirPath);
        for (const file of files) {
            if (file === 'templates') {
                continue;
            }
            const filePath = path.join(dirPath, file);
            const stat = await fs_1.promises.stat(filePath);
            if (stat.isDirectory()) {
                await this.removeDirectory(filePath);
            }
            else {
                await fs_1.promises.unlink(filePath);
            }
        }
    }
    async removeDirectory(dirPath) {
        await fs_1.promises.rm(dirPath, { recursive: true, force: true });
    }
    dispose() {
    }
}
exports.PersistenceCommands = PersistenceCommands;
//# sourceMappingURL=PersistenceCommands.js.map