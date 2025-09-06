import * as vscode from 'vscode';
import { IUIStateManager, IContainer, SERVICE_TOKENS, ITaskQueue } from '../services/interfaces';
import { TaskDTO, getStatusIcon, formatPriority, getPriorityColor } from '../types/ui';

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private disposables: vscode.Disposable[] = [];
    private taskQueue?: ITaskQueue;

    constructor(private uiStateManager: IUIStateManager, container?: IContainer) {
        if (container) {
            this.taskQueue = container.resolve<ITaskQueue>(SERVICE_TOKENS.TaskQueue);
        }
        // Subscribe to UI state changes
        this.disposables.push(
            this.uiStateManager.subscribe(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskItem): Thenable<TaskItem[]> {
        if (!element) {
            // Return task groups
            return Promise.resolve(this.getTaskGroups());
        } else if (element.type === 'group') {
            // Return tasks in this group
            return Promise.resolve(this.getTasksInGroup(element.groupType!));
        } else if (element.type === 'task') {
            // Return task details/dependencies
            return Promise.resolve(this.getTaskDetails(element.task!));
        }
        return Promise.resolve([]);
    }

    private getTaskGroups(): TaskItem[] {
        const state = this.uiStateManager.getState();
        const groups: TaskItem[] = [];

        // Validated Tasks
        if (state.taskStats.validated > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'validated',
                title: `✓ Validated Tasks (${state.taskStats.validated})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }

        // Ready Tasks
        if (state.taskStats.ready > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'ready',
                title: `🟢 Ready Tasks (${state.taskStats.ready})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }

        // In Progress
        if (state.taskStats.inProgress > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'in-progress',
                title: `🔄 In Progress (${state.taskStats.inProgress})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }

        // Blocked
        if (state.taskStats.blocked > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'blocked',
                title: `🔴 Blocked (${state.taskStats.blocked})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }

        // Assigned
        if (state.taskStats.assigned > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'assigned',
                title: `👤 Assigned (${state.taskStats.assigned})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }

        // Queued
        if (state.taskStats.queued > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'queued',
                title: `⏳ Queued (${state.taskStats.queued})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }));
        }

        // Completed
        if (state.taskStats.completed > 0) {
            groups.push(new TaskItem({
                type: 'group',
                groupType: 'completed',
                title: `✅ Completed (${state.taskStats.completed})`,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            }));
        }

        // Failed
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

    private getTasksInGroup(groupType: string): TaskItem[] {
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

    private getTaskDetails(task: TaskDTO): TaskItem[] {
        const details: TaskItem[] = [];

        // Dependencies
        if (task.dependsOn && task.dependsOn.length > 0) {
            details.push(new TaskItem({
                type: 'detail',
                title: `📋 Depends on: ${task.dependsOn.join(', ')}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }

        // Required capabilities
        if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
            details.push(new TaskItem({
                type: 'detail',
                title: `🎯 Capabilities: ${task.requiredCapabilities.join(', ')}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }

        // Tags
        if (task.tags && task.tags.length > 0) {
            details.push(new TaskItem({
                type: 'detail',
                title: `🏷️ Tags: ${task.tags.join(', ')}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }

        // Estimated duration
        if (task.estimatedDuration) {
            details.push(new TaskItem({
                type: 'detail',
                title: `⏱️ Estimated: ${task.estimatedDuration} minutes`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }

        // Blocking reason
        if (task.blockingReason) {
            details.push(new TaskItem({
                type: 'detail',
                title: `🚫 Blocked: ${task.blockingReason}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }

        // Agent match score
        if (task.agentMatchScore !== undefined) {
            details.push(new TaskItem({
                type: 'detail',
                title: `📊 Match Score: ${(task.agentMatchScore * 100).toFixed(0)}%`,
                collapsibleState: vscode.TreeItemCollapsibleState.None
            }));
        }

        return details;
    }

    private hasTaskDetails(task: TaskDTO): boolean {
        return !!(task.dependsOn?.length ||
                 task.requiredCapabilities?.length ||
                 task.tags?.length ||
                 task.estimatedDuration ||
                 task.blockingReason ||
                 task.agentMatchScore !== undefined);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // Drag and drop support
    getDragAndDropController(): vscode.TreeDragAndDropController<TaskItem> {
        // Capture taskQueue outside the returned controller to avoid 'this' binding issues
        const taskQueue = this.taskQueue;

        return {
            dragMimeTypes: ['application/vnd.code.tree.taskTree'],
            dropMimeTypes: ['application/vnd.code.tree.taskTree'],
            handleDrag: (source: TaskItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> => {
                // Store the dragged task IDs
                const taskIds = source
                    .filter(item => item.type === 'task' && item.task)
                    .map(item => item.task!.id);

                if (taskIds.length > 0) {
                    dataTransfer.set('application/vnd.code.tree.taskTree', new vscode.DataTransferItem(taskIds));
                }
            },
            handleDrop: (target: TaskItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> => {
                if (!target || target.type !== 'task' || !target.task || !taskQueue) {
                    return;
                }

                const draggedTaskIds = dataTransfer.get('application/vnd.code.tree.taskTree')?.value as string[] | undefined;
                if (!draggedTaskIds || draggedTaskIds.length === 0) {
                    return;
                }

                // Create dependencies for each dragged task to the target task
                for (const draggedTaskId of draggedTaskIds) {
                    if (draggedTaskId !== target.task.id) {
                        taskQueue.addTaskDependency(draggedTaskId, target.task.id);
                    }
                }
            }
        };
    }

    dispose(): void {
        // Dispose all subscriptions
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Dispose event emitter
        this._onDidChangeTreeData.dispose();
    }
}

class TaskItem extends vscode.TreeItem {
    public readonly type?: 'group' | 'task' | 'detail';
    public readonly groupType?: string;
    public readonly task?: TaskDTO;

    constructor(data: {
        type?: 'group' | 'task' | 'detail';
        groupType?: string;
        task?: TaskDTO;
        title: string;
        collapsibleState: vscode.TreeItemCollapsibleState;
    }) {
        super(data.title, data.collapsibleState);

        this.type = data.type;
        this.groupType = data.groupType;
        this.task = data.task;

        if (data.type === 'group') {
            this.contextValue = 'taskGroup';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (data.type === 'task' && data.task) {
            this.setupTaskItem(data.task);
        } else if (data.type === 'detail') {
            this.contextValue = 'taskDetail';
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }

    private setupTaskItem(task: TaskDTO): void {
        this.tooltip = this.buildTooltip(task);
        this.description = this.buildDescription(task);

        // Set icon based on status
        this.iconPath = new vscode.ThemeIcon(
            task.status === 'completed' ? 'pass' :
                task.status === 'in-progress' ? 'sync~spin' :
                    task.status === 'assigned' ? 'arrow-right' :
                        task.status === 'failed' ? 'error' :
                            task.status === 'blocked' ? 'circle-slash' :
                                task.status === 'ready' ? 'play' :
                                    task.status === 'validated' ? 'check' :
                                        'circle-outline'
        );

        // Set context value for context menu
        this.contextValue = 'task';

        // Set color based on priority
        if (task.numericPriority >= 100) {
            this.resourceUri = vscode.Uri.parse(`task://high/${task.id}`);
        } else if (task.numericPriority >= 50) {
            this.resourceUri = vscode.Uri.parse(`task://medium/${task.id}`);
        } else {
            this.resourceUri = vscode.Uri.parse(`task://low/${task.id}`);
        }
    }

    private buildTooltip(task: TaskDTO): string {
        let tooltip = `${task.title}\n\n${task.description}\n\n`;
        tooltip += `Status: ${task.status}\n`;
        tooltip += `Priority: ${formatPriority(task.numericPriority)}\n`;

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

    private buildDescription(task: TaskDTO): string {
        const parts: string[] = [];

        // Priority indicator
        parts.push(formatPriority(task.numericPriority));

        // Status
        parts.push(getStatusIcon(task.status));

        // Assigned agent
        if (task.assignedTo) {
            parts.push(`👤 ${task.assignedTo}`);
        }

        // Dependencies indicator
        if (task.dependsOn && task.dependsOn.length > 0) {
            parts.push(`📋 ${task.dependsOn.length} deps`);
        }

        // Conflicts indicator
        if (task.conflictsWith && task.conflictsWith.length > 0) {
            parts.push(`⚠️ ${task.conflictsWith.length} conflicts`);
        }

        return parts.join(' • ');
    }
}
