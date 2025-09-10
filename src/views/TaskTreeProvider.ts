import * as vscode from 'vscode';
// Simple Task interface for TreeProvider
interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignedTo?: string;
    tags?: string[];
}
import { ServiceLocator } from '../services/ServiceLocator';

export class TaskTreeProvider
    implements vscode.TreeDataProvider<TaskTreeItem>, vscode.TreeDragAndDropController<TaskTreeItem>
{
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    dropMimeTypes = ['application/vnd.code.tree.nofx.tasks'];
    dragMimeTypes = ['text/uri-list'];

    constructor(
        private uiStateManager?: any,
        private serviceLocator?: typeof ServiceLocator
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TaskTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskTreeItem): Thenable<TaskTreeItem[]> {
        if (!element) {
            // Root level - show tasks
            const taskQueue = ServiceLocator.tryGet('TaskQueue') as any;
            if (!taskQueue) {
                return Promise.resolve([]);
            }

            const tasks = taskQueue.getTasks();
            return Promise.resolve(
                tasks.map(
                    (task: Task) =>
                        new TaskTreeItem(task.title, task.status, vscode.TreeItemCollapsibleState.None, task)
                )
            );
        }
        return Promise.resolve([]);
    }

    getDragAndDropController(): vscode.TreeDragAndDropController<TaskTreeItem> {
        return this;
    }

    async handleDrag(
        source: readonly TaskTreeItem[],
        dataTransfer: vscode.DataTransfer,
        token: vscode.CancellationToken
    ): Promise<void> {
        dataTransfer.set(
            'application/vnd.code.tree.nofx.tasks',
            new vscode.DataTransferItem(source.map(item => item.task?.id).filter(Boolean))
        );
    }

    async handleDrop(
        target: TaskTreeItem | undefined,
        dataTransfer: vscode.DataTransfer,
        token: vscode.CancellationToken
    ): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.nofx.tasks');
        if (!transferItem) {
            return;
        }

        const taskIds = transferItem.value as string[];
        // Handle task reordering or reassignment here
        console.log('Dropped tasks:', taskIds, 'on target:', target?.task?.id);
    }
}

class TaskTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly status: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly task?: Task
    ) {
        super(label, collapsibleState);
        this.description = status;
        this.iconPath = this.getIconForStatus(status);
        this.contextValue = 'task';

        if (task) {
            this.command = {
                command: 'nofx.selectTask',
                title: 'Select Task',
                arguments: [task]
            };
        }
    }

    private getIconForStatus(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'completed':
                return new vscode.ThemeIcon('check');
            case 'in_progress':
                return new vscode.ThemeIcon('sync~spin');
            case 'blocked':
                return new vscode.ThemeIcon('error');
            case 'ready':
                return new vscode.ThemeIcon('circle-outline');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
}
