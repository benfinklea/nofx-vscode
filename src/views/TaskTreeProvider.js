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
exports.TaskTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("../services/interfaces");
const ui_1 = require("../types/ui");
class TaskTreeProvider {
    constructor(uiStateManager, container) {
        this.uiStateManager = uiStateManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.disposables = [];
        if (container) {
            this.taskQueue = container.resolve(interfaces_1.SERVICE_TOKENS.TaskQueue);
        }
        this.disposables.push(this.uiStateManager.subscribe(() => {
            this._onDidChangeTreeData.fire();
        }));
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve(this.getTaskGroups());
        }
        else if (element.type === 'group') {
            return Promise.resolve(this.getTasksInGroup(element.groupType));
        }
        else if (element.type === 'task') {
            return Promise.resolve(this.getTaskDetails(element.task));
        }
        return Promise.resolve([]);
    }
    getTaskGroups() {
        const state = this.uiStateManager.getState();
        const groups = [];
        if (state.taskStats.validated > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'validated',
                title: `✓ Validated Tasks (${state.taskStats.validated})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }
        if (state.taskStats.ready > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'ready',
                title: `🟢 Ready Tasks (${state.taskStats.ready})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }
        if (state.taskStats.inProgress > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'in-progress',
                title: `🔄 In Progress (${state.taskStats.inProgress})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }
        if (state.taskStats.blocked > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'blocked',
                title: `🔴 Blocked (${state.taskStats.blocked})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }
        if (state.taskStats.assigned > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'assigned',
                title: `👤 Assigned (${state.taskStats.assigned})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }
        if (state.taskStats.queued > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'queued',
                title: `⏳ Queued (${state.taskStats.queued})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }
        if (state.taskStats.completed > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'completed',
                title: `✅ Completed (${state.taskStats.completed})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            }));
        }
        if (state.taskStats.failed > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'failed',
                title: `❌ Failed (${state.taskStats.failed})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            }));
        }
        return groups;
    }
    getTasksInGroup(groupType) {
        const tasks = this.uiStateManager.getTasksByStatus(groupType);
        return tasks.map(task => new TaskItem({
            type: 'task',
            task,
            title: task.title,
            collapsibleState: this.hasTaskDetails(task) ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None
        }));
    }
    getTaskDetails(task) {
        const details = [];
        if (task.dependsOn && task.dependsOn.length > 0) {
            details.push(new TaskItem({
                type: 'detail',
                title: `📋 Depends on: ${task.dependsOn.join(', ')}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }
        if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
            details.push(new TaskItem({
                type: 'detail',
                title: `🎯 Capabilities: ${task.requiredCapabilities.join(', ')}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }
        if (task.tags && task.tags.length > 0) {
            details.push(new TaskItem({
                type: 'detail',
                title: `🏷️ Tags: ${task.tags.join(', ')}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }
        if (task.estimatedDuration) {
            details.push(new TaskItem({
                type: 'detail',
                title: `⏱️ Estimated: ${task.estimatedDuration} minutes`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }
        if (task.blockingReason) {
            details.push(new TaskItem({
                type: 'detail',
                title: `🚫 Blocked: ${task.blockingReason}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }
        if (task.agentMatchScore !== undefined) {
            details.push(new TaskItem({
                type: 'detail',
                title: `📊 Match Score: ${(task.agentMatchScore * 100).toFixed(0)}%`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }
        return details;
    }
    hasTaskDetails(task) {
        return !!(task.dependsOn?.length ||
            task.requiredCapabilities?.length ||
            task.tags?.length ||
            task.estimatedDuration ||
            task.blockingReason ||
            task.agentMatchScore !== undefined);
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getDragAndDropController() {
        const taskQueue = this.taskQueue;
        return {
            dragMimeTypes: ['application/vnd.code.tree.taskTree'],
            dropMimeTypes: ['application/vnd.code.tree.taskTree'],
            handleDrag: (source, dataTransfer, token) => {
                const taskIds = source
                    .filter(item => item.type === 'task' && item.task)
                    .map(item => item.task.id);
                if (taskIds.length > 0) {
                    dataTransfer.set('application/vnd.code.tree.taskTree', new vscode.DataTransferItem(taskIds));
                }
            },
            handleDrop: (target, dataTransfer, token) => {
                if (!target || target.type !== 'task' || !target.task || !taskQueue) {
                    return;
                }
                const draggedTaskIds = dataTransfer.get('application/vnd.code.tree.taskTree')?.value;
                if (!draggedTaskIds || draggedTaskIds.length === 0) {
                    return;
                }
                for (const draggedTaskId of draggedTaskIds) {
                    if (draggedTaskId !== target.task.id) {
                        taskQueue.addTaskDependency(draggedTaskId, target.task.id);
                    }
                }
            }
        };
    }
    dispose() {
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        this._onDidChangeTreeData.dispose();
    }
}
exports.TaskTreeProvider = TaskTreeProvider;
class TaskItem extends vscode.TreeItem {
    constructor(data) {
        super(data.title, data.collapsibleState);
        this.type = data.type;
        this.groupType = data.groupType;
        this.task = data.task;
        if (data.type === 'group') {
            this.contextValue = 'taskGroup';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
        else if (data.type === 'task' && data.task) {
            this.setupTaskItem(data.task);
        }
        else if (data.type === 'detail') {
            this.contextValue = 'taskDetail';
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
    setupTaskItem(task) {
        this.tooltip = this.buildTooltip(task);
        this.description = this.buildDescription(task);
        this.iconPath = new vscode.ThemeIcon(task.status === 'completed' ? 'pass' :
            task.status === 'in-progress' ? 'sync~spin' :
                task.status === 'assigned' ? 'arrow-right' :
                    task.status === 'failed' ? 'error' :
                        task.status === 'blocked' ? 'circle-slash' :
                            task.status === 'ready' ? 'play' :
                                task.status === 'validated' ? 'check' :
                                    'circle-outline');
        this.contextValue = 'task';
        if (task.numericPriority >= 100) {
            this.resourceUri = vscode.Uri.parse(`task://high/${task.id}`);
        }
        else if (task.numericPriority >= 50) {
            this.resourceUri = vscode.Uri.parse(`task://medium/${task.id}`);
        }
        else {
            this.resourceUri = vscode.Uri.parse(`task://low/${task.id}`);
        }
    }
    buildTooltip(task) {
        let tooltip = `${task.title}\n\n${task.description}\n\n`;
        tooltip += `Status: ${task.status}\n`;
        tooltip += `Priority: ${(0, ui_1.formatPriority)(task.numericPriority)}\n`;
        if (task.assignedTo) {
            tooltip += `Assigned to: ${task.assignedTo}\n`;
        }
        if (task.dependsOn && task.dependsOn.length > 0) {
            tooltip += `Depends on: ${task.dependsOn.join(', ')}\n`;
        }
        if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
            tooltip += `Required capabilities: ${task.requiredCapabilities.join(', ')}\n`;
        }
        if (task.tags && task.tags.length > 0) {
            tooltip += `Tags: ${task.tags.join(', ')}\n`;
        }
        if (task.estimatedDuration) {
            tooltip += `Estimated duration: ${task.estimatedDuration} minutes\n`;
        }
        if (task.blockingReason) {
            tooltip += `Blocking reason: ${task.blockingReason}\n`;
        }
        if (task.agentMatchScore !== undefined) {
            tooltip += `Agent match score: ${(task.agentMatchScore * 100).toFixed(0)}%\n`;
        }
        tooltip += `Created: ${task.createdAt.toLocaleString()}`;
        if (task.completedAt) {
            tooltip += `\nCompleted: ${task.completedAt.toLocaleString()}`;
        }
        return tooltip;
    }
    buildDescription(task) {
        const parts = [];
        parts.push((0, ui_1.formatPriority)(task.numericPriority));
        parts.push((0, ui_1.getStatusIcon)(task.status));
        if (task.assignedTo) {
            parts.push(`👤 ${task.assignedTo}`);
        }
        if (task.dependsOn && task.dependsOn.length > 0) {
            parts.push(`📋 ${task.dependsOn.length} deps`);
        }
        if (task.conflictsWith && task.conflictsWith.length > 0) {
            parts.push(`⚠️ ${task.conflictsWith.length} conflicts`);
        }
        return parts.join(' • ');
    }
}
//# sourceMappingURL=TaskTreeProvider.js.map