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
exports.WorktreeCommands = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("../services/interfaces");
class WorktreeCommands {
    constructor(container) {
        this.agentManager = container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.worktreeService = container.resolve(interfaces_1.SERVICE_TOKENS.WorktreeService);
    }
    register() {
        this.commandService.register('nofx.toggleWorktrees', this.toggleWorktrees.bind(this));
        this.commandService.register('nofx.mergeAgentWork', this.mergeAgentWork.bind(this));
    }
    async toggleWorktrees() {
        const currentValue = this.configService.isUseWorktrees();
        const newValue = !currentValue;
        await this.configService.update(interfaces_1.CONFIG_KEYS.USE_WORKTREES, newValue);
        const status = newValue ? 'enabled' : 'disabled';
        await this.notificationService.showInformation(`Git worktrees ${status}. New agents will ${newValue ? 'use' : 'not use'} worktrees.`);
        if (newValue) {
            const learnMore = await this.notificationService.showInformation('Worktrees allow agents to work in parallel without conflicts.', 'Learn More');
            if (learnMore === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/docs/git-worktree'));
            }
        }
    }
    async mergeAgentWork() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        if (!this.worktreeService.isAvailable()) {
            await this.notificationService.showError('Git worktrees are not available in this workspace');
            return;
        }
        const activeAgents = this.agentManager.getActiveAgents();
        if (activeAgents.length === 0) {
            await this.notificationService.showInformation('No active agents found');
            return;
        }
        const items = activeAgents.map(agent => ({
            label: agent.name,
            description: `Agent ID: ${agent.id}`,
            detail: `Worktree path: ${this.worktreeService.getWorktreePath(agent.id) || 'Not available'}`,
            value: { agentId: agent.id, agentName: agent.name }
        }));
        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select agent work to merge'
        });
        if (!selected) {
            return;
        }
        const worktree = selected.value;
        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Merging work from ${worktree.agentName}...`,
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Merging agent work...', increment: 50 });
                const success = await this.worktreeService.mergeForAgent(worktree.agentId);
                if (!success) {
                    await this.notificationService.showError('Failed to merge agent work');
                    return;
                }
                progress.report({ message: 'Cleaning up worktree...', increment: 25 });
                const cleanup = await this.notificationService.confirm('Successfully merged! Remove the agent worktree?', 'Remove');
                if (cleanup) {
                    await this.worktreeService.removeForAgent(worktree.agentId);
                    const agent = this.agentManager.getAgent(worktree.agentId);
                    if (agent) {
                        await this.agentManager.removeAgent(agent.id);
                    }
                }
                await this.notificationService.showInformation('Agent work successfully merged!');
            }
            catch (error) {
                await this.notificationService.showError(`Failed to merge: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    dispose() {
    }
}
exports.WorktreeCommands = WorktreeCommands;
//# sourceMappingURL=WorktreeCommands.js.map