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
exports.WorktreeManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
class WorktreeManager {
    constructor(workspacePath, loggingService, notificationService) {
        this.worktrees = new Map();
        this.workspacePath = workspacePath;
        this.loggingService = loggingService;
        this.notificationService = notificationService;
        this.baseDir = path.join(path.dirname(workspacePath), '.nofx-worktrees');
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }
    async createWorktreeForAgent(agent) {
        try {
            if (this.worktrees.has(agent.id)) {
                return this.worktrees.get(agent.id);
            }
            const branchName = `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
            const worktreePath = path.join(this.baseDir, agent.id);
            const currentBranch = (0, child_process_1.execSync)('git branch --show-current', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            }).trim();
            const command = `git worktree add -b ${branchName} "${worktreePath}" ${currentBranch || 'HEAD'}`;
            this.loggingService?.debug(`Creating worktree for ${agent.name}: ${command}`);
            (0, child_process_1.execSync)(command, {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });
            this.worktrees.set(agent.id, worktreePath);
            const markerPath = path.join(worktreePath, '.nofx-agent');
            fs.writeFileSync(markerPath, JSON.stringify({
                agentId: agent.id,
                agentName: agent.name,
                agentType: agent.type,
                branchName: branchName,
                createdAt: new Date().toISOString()
            }, null, 2));
            const gitignorePath = path.join(worktreePath, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
                if (!gitignoreContent.includes('.nofx-agent')) {
                    fs.appendFileSync(gitignorePath, '\n# NofX agent worktree marker\n.nofx-agent\n');
                }
            }
            else {
                fs.writeFileSync(gitignorePath, '# NofX agent worktree marker\n.nofx-agent\n');
            }
            this.loggingService?.info(`Created worktree for ${agent.name} at ${worktreePath}`);
            return worktreePath;
        }
        catch (error) {
            this.loggingService?.error(`Error creating worktree for ${agent.name}:`, error);
            throw error;
        }
    }
    async removeWorktreeForAgent(agentId) {
        try {
            const worktreePath = this.worktrees.get(agentId);
            if (!worktreePath) {
                this.loggingService?.debug(`No worktree found for agent ${agentId}`);
                return;
            }
            const command = `git worktree remove "${worktreePath}" --force`;
            this.loggingService?.debug(`Removing worktree: ${command}`);
            (0, child_process_1.execSync)(command, {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });
            this.worktrees.delete(agentId);
            this.loggingService?.info(`Removed worktree for agent ${agentId}`);
        }
        catch (error) {
            this.loggingService?.error(`Error removing worktree for ${agentId}:`, error);
            const worktreePath = this.worktrees.get(agentId);
            if (worktreePath && fs.existsSync(worktreePath)) {
                try {
                    fs.rmSync(worktreePath, { recursive: true, force: true });
                    this.worktrees.delete(agentId);
                }
                catch (cleanupError) {
                    this.loggingService?.error(`Error cleaning up worktree directory:`, cleanupError);
                }
            }
        }
    }
    listWorktrees() {
        try {
            const output = (0, child_process_1.execSync)('git worktree list --porcelain', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });
            const worktrees = [];
            const lines = output.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('worktree ')) {
                    const path = lines[i].substring(9);
                    worktrees.push(path);
                }
            }
            return worktrees;
        }
        catch (error) {
            this.loggingService?.error('Error listing worktrees:', error);
            return [];
        }
    }
    async cleanupOrphanedWorktrees() {
        try {
            (0, child_process_1.execSync)('git worktree prune', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });
            const worktrees = this.listWorktrees();
            for (const worktreePath of worktrees) {
                const markerPath = path.join(worktreePath, '.nofx-agent');
                if (fs.existsSync(markerPath)) {
                    const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
                    if (!this.worktrees.has(markerData.agentId)) {
                        this.loggingService?.info(`Found orphaned worktree for agent ${markerData.agentName}, cleaning up...`);
                        try {
                            (0, child_process_1.execSync)(`git worktree remove "${worktreePath}" --force`, {
                                cwd: this.workspacePath,
                                encoding: 'utf-8'
                            });
                        }
                        catch (removeError) {
                            this.loggingService?.error(`Error removing orphaned worktree:`, removeError);
                        }
                    }
                }
            }
        }
        catch (error) {
            this.loggingService?.error('Error cleaning up orphaned worktrees:', error);
        }
    }
    getWorktreePath(agentId) {
        return this.worktrees.get(agentId);
    }
    static isWorktreeAvailable(workspacePath) {
        try {
            (0, child_process_1.execSync)('git rev-parse --git-dir', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });
            (0, child_process_1.execSync)('git worktree -h', {
                cwd: workspacePath,
                encoding: 'utf-8'
            });
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async listWorktreesInfo() {
        const worktrees = [];
        try {
            const result = (0, child_process_1.execSync)('git worktree list --porcelain', {
                cwd: this.workspacePath,
                encoding: 'utf8'
            });
            const lines = result.split('\n');
            let currentWorktree = null;
            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    const directory = line.substring(9);
                    if (currentWorktree) {
                        worktrees.push(currentWorktree);
                    }
                    currentWorktree = { directory, branch: '' };
                }
                else if (line.startsWith('branch ') && currentWorktree) {
                    currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
                    try {
                        const markerPath = path.join(currentWorktree.directory, '.nofx-agent');
                        if (fs.existsSync(markerPath)) {
                            const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
                            currentWorktree.agentId = markerData.agentId;
                        }
                    }
                    catch (e) {
                    }
                }
            }
            if (currentWorktree && currentWorktree.branch) {
                worktrees.push(currentWorktree);
            }
        }
        catch (error) {
            this.loggingService?.error('Error listing worktrees:', error);
        }
        return worktrees.filter(w => w.branch.startsWith('agent-'));
    }
    async mergeAgentWork(agentId) {
        try {
            const worktreePath = this.worktrees.get(agentId);
            if (!worktreePath) {
                throw new Error(`No worktree found for agent ${agentId}`);
            }
            const markerPath = path.join(worktreePath, '.nofx-agent');
            const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
            try {
                (0, child_process_1.execSync)('git add -A', { cwd: worktreePath });
                (0, child_process_1.execSync)(`git commit -m "Agent ${markerData.agentName} work - auto-commit before merge"`, {
                    cwd: worktreePath
                });
            }
            catch (commitError) {
                this.loggingService?.debug('No changes to commit in worktree');
            }
            const currentBranch = (0, child_process_1.execSync)('git branch --show-current', {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            }).trim();
            (0, child_process_1.execSync)(`git merge ${markerData.branchName} --no-ff -m "Merge agent ${markerData.agentName} work from ${markerData.branchName}"`, {
                cwd: this.workspacePath,
                encoding: 'utf-8'
            });
            this.loggingService?.info(`Merged agent ${markerData.agentName} work from ${markerData.branchName}`);
            this.notificationService?.showInformation(`✅ Merged ${markerData.agentName}'s work from branch ${markerData.branchName}`);
        }
        catch (error) {
            this.loggingService?.error(`Error merging agent work:`, error);
            throw error;
        }
    }
}
exports.WorktreeManager = WorktreeManager;
//# sourceMappingURL=WorktreeManager.js.map