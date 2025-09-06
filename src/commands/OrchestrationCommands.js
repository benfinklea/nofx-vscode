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
exports.OrchestrationCommands = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const interfaces_1 = require("../services/interfaces");
const EnhancedConductorPanel_1 = require("../panels/EnhancedConductorPanel");
const AgentPersistence_1 = require("../persistence/AgentPersistence");
class OrchestrationCommands {
    constructor(container) {
        this.container = container;
        this.agentManager = container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve(interfaces_1.SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService);
        this.context = container.resolve(interfaces_1.SERVICE_TOKENS.ExtensionContext);
        this.messagePersistence = container.resolve(interfaces_1.SERVICE_TOKENS.MessagePersistenceService);
        this.orchestrationServer = container.resolveOptional(interfaces_1.SERVICE_TOKENS.OrchestrationServer);
        this.messageFlowDashboard = container.resolveOptional(interfaces_1.SERVICE_TOKENS.MessageFlowDashboard);
    }
    setOrchestrationServer(server) {
        this.orchestrationServer = server;
    }
    register() {
        this.commandService.register('nofx.showOrchestrator', this.showOrchestrator.bind(this));
        this.commandService.register('nofx.openMessageFlow', this.openMessageFlow.bind(this));
        this.commandService.register('nofx.resetNofX', this.resetNofX.bind(this));
    }
    async showOrchestrator() {
        if (this.conductorPanel) {
            this.conductorPanel.reveal();
        }
        else {
            const viewModel = this.container.resolve(interfaces_1.SERVICE_TOKENS.ConductorViewModel);
            const loggingService = this.container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService);
            this.conductorPanel = EnhancedConductorPanel_1.EnhancedConductorPanel.create(this.context, viewModel, loggingService);
        }
    }
    async openMessageFlow() {
        if (!this.orchestrationServer) {
            await this.notificationService.showError('Orchestration server not running');
            return;
        }
        if (!this.messageFlowDashboard) {
            this.messageFlowDashboard = this.container.resolve(interfaces_1.SERVICE_TOKENS.MessageFlowDashboard);
        }
        await this.messageFlowDashboard.show();
    }
    async resetNofX() {
        const confirmed = await this.notificationService.confirmDestructive('Reset NofX? This will stop all agents, clear all data, and restart the orchestration server.', 'Reset Everything');
        if (!confirmed) {
            return;
        }
        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Resetting NofX...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Stopping orchestration server...', increment: 20 });
                if (this.orchestrationServer) {
                    await this.orchestrationServer.stop();
                }
                progress.report({ message: 'Removing all agents...', increment: 20 });
                const agents = this.agentManager.getActiveAgents();
                for (const agent of agents) {
                    await this.agentManager.removeAgent(agent.id);
                }
                progress.report({ message: 'Clearing task queue...', increment: 20 });
                this.taskQueue.clearAllTasks();
                progress.report({ message: 'Clearing saved data...', increment: 15 });
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const persistence = new AgentPersistence_1.AgentPersistence(workspaceFolder.uri.fsPath);
                    await persistence.clearAll();
                    const nofxDir = path.join(workspaceFolder.uri.fsPath, '.nofx');
                    try {
                        await fs_1.promises.access(nofxDir);
                        await this.removeDirectory(nofxDir);
                    }
                    catch (error) {
                    }
                }
                progress.report({ message: 'Clearing orchestration history...', increment: 5 });
                try {
                    await this.messagePersistence.clear();
                }
                catch (error) {
                    this.loggingService?.warn('Failed to clear orchestration history:', error);
                }
                progress.report({ message: 'Restarting orchestration server...', increment: 20 });
                if (this.orchestrationServer) {
                    await this.orchestrationServer.start();
                }
                this.messageFlowDashboard = undefined;
                this.conductorPanel?.dispose();
                this.conductorPanel = undefined;
                await this.notificationService.showInformation('🎸 NofX has been completely reset. You can now start fresh!');
            }
            catch (error) {
                this.loggingService?.error('Error resetting NofX:', error);
                await this.notificationService.showError(`Failed to reset NofX: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    async removeDirectory(dirPath) {
        if (dirPath.endsWith('.nofx')) {
            const templatesPath = path.join(dirPath, 'templates');
            const hasTemplates = await fs_1.promises.access(templatesPath).then(() => true).catch(() => false);
            if (hasTemplates) {
                const items = await fs_1.promises.readdir(dirPath);
                for (const item of items) {
                    if (item !== 'templates') {
                        const itemPath = path.join(dirPath, item);
                        await fs_1.promises.rm(itemPath, { recursive: true, force: true });
                    }
                }
                return;
            }
        }
        await fs_1.promises.rm(dirPath, { recursive: true, force: true });
    }
    dispose() {
        this.messageFlowDashboard = undefined;
        this.conductorPanel?.dispose();
        this.conductorPanel = undefined;
    }
}
exports.OrchestrationCommands = OrchestrationCommands;
//# sourceMappingURL=OrchestrationCommands.js.map