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
exports.WorktreeService = void 0;
const vscode = __importStar(require("vscode"));
const WorktreeManager_1 = require("../worktrees/WorktreeManager");
class WorktreeService {
    constructor(configService, notificationService, worktreeManager, loggingService, errorHandler) {
        this.configService = configService;
        this.notificationService = notificationService;
        this.useWorktrees = false;
        this.disposables = [];
        this.loggingService = loggingService;
        this.errorHandler = errorHandler;
        this.worktreeManager = worktreeManager;
        this.initializeWorktrees();
        this.disposables.push(this.configService.onDidChange((e) => {
            if (e.affectsConfiguration('nofx.useWorktrees')) {
                this.initializeWorktrees();
            }
        }));
    }
    initializeWorktrees() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder)
            return;
        this.useWorktrees = this.configService.isUseWorktrees();
        if (!this.useWorktrees) {
            return;
        }
        if (!this.worktreeManager) {
            this.loggingService?.debug('WorktreeManager not available, skipping worktree initialization');
            return;
        }
        if (WorktreeManager_1.WorktreeManager.isWorktreeAvailable(workspaceFolder.uri.fsPath)) {
            this.loggingService?.info('Git worktrees enabled and available');
            this.worktreeManager.cleanupOrphanedWorktrees();
        }
        else {
            this.loggingService?.warn('Git worktrees requested but not available in this repository');
            this.notificationService.showWarning('Git worktrees are enabled but this is not a Git repository. Agents will use the main workspace.');
        }
    }
    async createForAgent(agent) {
        if (!this.worktreeManager || !this.useWorktrees) {
            return undefined;
        }
        return await this.errorHandler?.handleAsync(async () => {
            const worktreePath = await this.worktreeManager.createWorktreeForAgent(agent);
            this.loggingService?.debug(`Worktree created for agent ${agent.name}: ${worktreePath}`);
            return worktreePath;
        }, `Failed to create worktree for ${agent.name}`) || undefined;
    }
    async removeForAgent(agentId) {
        if (!this.worktreeManager || !this.useWorktrees) {
            return true;
        }
        return await this.errorHandler?.handleAsync(async () => {
            const worktreePath = this.worktreeManager.getWorktreePath(agentId);
            if (!worktreePath) {
                return true;
            }
            const action = await this.notificationService.showInformation(`Agent has a worktree. Merge changes before removing?`, 'Merge & Remove', 'Remove Without Merging', 'Cancel');
            if (action === 'Cancel') {
                return false;
            }
            if (action === 'Merge & Remove') {
                await this.worktreeManager.mergeAgentWork(agentId);
                this.loggingService?.debug(`Worktree merged for agent ${agentId}`);
            }
            await this.worktreeManager.removeWorktreeForAgent(agentId);
            this.loggingService?.debug(`Worktree removed for agent ${agentId}`);
            return true;
        }, `Error removing worktree for agent ${agentId}`) || false;
    }
    async mergeForAgent(agentId) {
        if (!this.worktreeManager || !this.useWorktrees) {
            return true;
        }
        return await this.errorHandler?.handleAsync(async () => {
            await this.worktreeManager.mergeAgentWork(agentId);
            this.loggingService?.debug(`Worktree merged for agent ${agentId}`);
            return true;
        }, 'Error merging agent work') || false;
    }
    getWorktreePath(agentId) {
        if (!this.worktreeManager) {
            return undefined;
        }
        return this.worktreeManager.getWorktreePath(agentId);
    }
    isAvailable() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder)
            return false;
        return this.useWorktrees && WorktreeManager_1.WorktreeManager.isWorktreeAvailable(workspaceFolder.uri.fsPath);
    }
    async cleanupOrphaned() {
        if (!this.worktreeManager) {
            return;
        }
        await this.errorHandler?.handleAsync(async () => {
            await this.worktreeManager.cleanupOrphanedWorktrees();
            this.loggingService?.debug('Orphaned worktrees cleaned up');
        }, 'Error cleaning up orphaned worktrees');
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.worktreeManager = undefined;
    }
}
exports.WorktreeService = WorktreeService;
//# sourceMappingURL=WorktreeService.js.map