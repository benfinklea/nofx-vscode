import * as vscode from 'vscode';
import { TaskQueue } from '../tasks/TaskQueue';
import { Task } from '../agents/types';

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private taskQueue: TaskQueue) {
        taskQueue.onTaskUpdate(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskItem): Thenable<TaskItem[]> {
        if (!element) {
            // Return all tasks
            const tasks = this.taskQueue.getTasks();
            return Promise.resolve(
                tasks.map(task => new TaskItem(task))
            );
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

class TaskItem extends vscode.TreeItem {
    constructor(public readonly task: Task) {
        super(task.title, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = task.description;
        this.description = `${task.priority} - ${task.status}`;
        
        // Set icon based on status
        this.iconPath = new vscode.ThemeIcon(
            task.status === 'completed' ? 'pass' :
            task.status === 'in-progress' ? 'sync~spin' :
            task.status === 'assigned' ? 'arrow-right' :
            task.status === 'failed' ? 'error' :
            'circle-outline'
        );
        
        // Set context value for context menu
        this.contextValue = 'task';
    }
}