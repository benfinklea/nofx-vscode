import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    SERVICE_TOKENS,
    ITaskDependencyManager
} from '../services/interfaces';
import { PickItem, formatBlockingReason } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { Task, TaskConfig } from '../agents/types';

export class TaskCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly dependencyManager: ITaskDependencyManager;

    constructor(container: IContainer) {
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve<TaskQueue>(SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.dependencyManager = container.resolve<ITaskDependencyManager>(SERVICE_TOKENS.TaskDependencyManager);
    }

    register(): void {
        this.commandService.register('nofx.createTask', this.createTask.bind(this));
        this.commandService.register('nofx.completeTask', this.completeTask.bind(this));
        this.commandService.register('nofx.addTaskDependency', this.addTaskDependency.bind(this));
        this.commandService.register('nofx.removeTaskDependency', this.removeTaskDependency.bind(this));
        this.commandService.register('nofx.resolveTaskConflict', this.resolveTaskConflict.bind(this));
        this.commandService.register('nofx.viewTaskDependencies', this.viewTaskDependencies.bind(this));
        this.commandService.register('nofx.retryBlockedTask', this.retryBlockedTask.bind(this));
        this.commandService.register('nofx.createTaskBatch', this.createTaskBatch.bind(this));
        this.commandService.register('nofx.resolveAllConflicts', this.resolveAllConflicts.bind(this));
    }

    private async createTask(): Promise<void> {
        const taskDescription = await this.notificationService.showInputBox({
            prompt: 'Enter task description',
            placeHolder: 'e.g., Fix authentication bug in login component'
        });

        if (!taskDescription) {
            return;
        }

        // Gather file context if there's an active editor
        const fileContext: string[] = [];
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
            fileContext.push(relativePath);
        }

        // Get priority
        const priorityOptions: PickItem<'high' | 'medium' | 'low'>[] = [
            { label: '🔴 High', value: 'high' },
            { label: '🟡 Medium', value: 'medium' },
            { label: '🟢 Low', value: 'low' }
        ];

        const priority = await this.notificationService.showQuickPick(priorityOptions, {
            placeHolder: 'Select task priority'
        });

        if (!priority) {
            return;
        }

        // Get tags
        const tagsInput = await this.notificationService.showInputBox({
            prompt: 'Enter tags (comma-separated)',
            placeHolder: 'e.g., frontend, bug, authentication',
            value: ''
        });

        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];

        // Get required capabilities
        const capabilitiesInput = await this.notificationService.showInputBox({
            prompt: 'Enter required capabilities (comma-separated)',
            placeHolder: 'e.g., React, TypeScript, CSS',
            value: ''
        });

        const requiredCapabilities = capabilitiesInput ? capabilitiesInput.split(',').map(cap => cap.trim()).filter(cap => cap.length > 0) : [];

        // Get estimated duration
        const durationInput = await this.notificationService.showInputBox({
            prompt: 'Enter estimated duration in minutes (optional)',
            placeHolder: 'e.g., 30',
            value: ''
        });

        const estimatedDuration = durationInput ? parseInt(durationInput, 10) : undefined;

        // Get dependencies
        const existingTasks = this.taskQueue.getTasks().filter(t => t.status !== 'completed');
        let dependsOn: string[] = [];
        
        if (existingTasks.length > 0) {
            const dependencyChoice = await this.notificationService.showQuickPick([
                { label: 'No dependencies', value: 'none' },
                { label: 'Add dependencies', value: 'add' }
            ], {
                placeHolder: 'Does this task depend on other tasks?'
            });

            if (dependencyChoice?.value === 'add') {
                const dependencyItems: PickItem<string>[] = existingTasks.map(task => ({
                    label: task.title,
                    description: `${task.status} - ${task.priority} priority`,
                    value: task.id
                }));

                const selectedDependencies = await this.notificationService.showQuickPick(dependencyItems, {
                    placeHolder: 'Select tasks this depends on (select multiple)',
                    canPickMany: true
                });

                if (selectedDependencies && Array.isArray(selectedDependencies)) {
                    dependsOn = selectedDependencies.map((item: PickItem<string>) => item.value);
                }
            }
        }

        // Create task configuration
        const taskConfig: TaskConfig = {
            title: taskDescription,
            description: taskDescription,
            priority: priority.value,
            files: fileContext,
            dependsOn,
            tags,
            estimatedDuration,
            requiredCapabilities
        };

        try {
            // Add to queue
            const task = this.taskQueue.addTask(taskConfig);

            // Auto-assign is handled by TaskQueue.tryAssignTasks() automatically
            await this.notificationService.showInformation('Task created and added to queue');
        } catch (error: any) {
            await this.notificationService.showError(`Failed to create task: ${error.message}`);
        }
    }

    private async completeTask(): Promise<void> {
        // Get all active tasks
        const activeTasks = this.taskQueue.getTasks().filter(t => t.status !== 'completed');

        if (activeTasks.length === 0) {
            await this.notificationService.showInformation('No active tasks to complete');
            return;
        }

        let taskToComplete: Task;

        if (activeTasks.length === 1) {
            taskToComplete = activeTasks[0];
        } else {
            // Let user select which task to complete
            const items: PickItem<string>[] = activeTasks.map(task => ({
                label: task.title,
                description: `${task.status} - ${task.priority} priority`,
                detail: task.assignedTo ? `Assigned to: ${this.agentManager.getAgent(task.assignedTo)?.name}` : 'Unassigned',
                value: task.id
            }));

            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select task to mark as complete'
            });

            if (!selected) {
                return;
            }

            const taskId = selected.value;
            const task = this.taskQueue.getTasks().find(t => t.id === taskId);
            if (!task) {
                await this.notificationService.showError('Task not found');
                return;
            }
            taskToComplete = task;
        }

        // Mark as complete using TaskQueue method
        const success = this.taskQueue.completeTask(taskToComplete.id);

        if (success) {
            // If assigned to an agent, notify agent manager
            if (taskToComplete.assignedTo) {
                this.agentManager.completeTask(taskToComplete.assignedTo, taskToComplete);
            }

            await this.notificationService.showInformation('Task marked as complete');
        } else {
            await this.notificationService.showError('Failed to complete task. Check task state and dependencies.');
        }
    }


    // New command methods for enhanced task management

    private async addTaskDependency(): Promise<void> {
        const tasks = this.taskQueue.getTasks().filter(t => t.status !== 'completed');
        
        if (tasks.length < 2) {
            await this.notificationService.showInformation('Need at least 2 tasks to create dependencies');
            return;
        }

        // Select task to add dependency to
        const taskItems: PickItem<string>[] = tasks.map(task => ({
            label: task.title,
            description: `${task.status} - ${task.priority} priority`,
            value: task.id
        }));

        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select task to add dependency to'
        });

        if (!selectedTask) return;

        // Select dependency task
        const dependencyItems: PickItem<string>[] = tasks
            .filter(t => t.id !== selectedTask.value)
            .map(task => ({
                label: task.title,
                description: `${task.status} - ${task.priority} priority`,
                value: task.id
            }));

        const selectedDependency = await this.notificationService.showQuickPick(dependencyItems, {
            placeHolder: 'Select task this depends on'
        });

        if (!selectedDependency) return;

        const success = this.taskQueue.addTaskDependency(selectedTask.value, selectedDependency.value);
        if (success) {
            await this.notificationService.showInformation('Dependency added successfully');
        } else {
            await this.notificationService.showError('Failed to add dependency (may create circular dependency)');
        }
    }

    private async removeTaskDependency(): Promise<void> {
        const tasks = this.taskQueue.getTasks().filter(t => t.dependsOn && t.dependsOn.length > 0);
        
        if (tasks.length === 0) {
            await this.notificationService.showInformation('No tasks with dependencies found');
            return;
        }

        // Select task with dependencies
        const taskItems: PickItem<string>[] = tasks.map(task => ({
            label: task.title,
            description: `Depends on: ${task.dependsOn?.join(', ')}`,
            value: task.id
        }));

        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select task to remove dependency from'
        });

        if (!selectedTask) return;

        const task = this.taskQueue.getTask(selectedTask.value);
        if (!task || !task.dependsOn || task.dependsOn.length === 0) return;

        // Select dependency to remove
        const dependencyItems: PickItem<string>[] = task.dependsOn.map(depId => {
            const depTask = this.taskQueue.getTask(depId);
            return {
                label: depTask?.title || depId,
                description: depTask ? `${depTask.status} - ${depTask.priority} priority` : 'Unknown task',
                value: depId
            };
        });

        const selectedDependency = await this.notificationService.showQuickPick(dependencyItems, {
            placeHolder: 'Select dependency to remove'
        });

        if (!selectedDependency) return;

        const success = this.taskQueue.removeTaskDependency(selectedTask.value, selectedDependency.value);
        if (success) {
            await this.notificationService.showInformation('Dependency removed successfully');
        } else {
            await this.notificationService.showError('Failed to remove dependency');
        }
    }

    private async resolveTaskConflict(): Promise<void> {
        const blockedTasks = this.taskQueue.getBlockedTasks();
        
        if (blockedTasks.length === 0) {
            await this.notificationService.showInformation('No blocked tasks found');
            return;
        }

        // Select blocked task
        const taskItems: PickItem<string>[] = blockedTasks.map(task => ({
            label: task.title,
            description: `Blocked: ${formatBlockingReason(task) || 'Unknown reason'}`,
            value: task.id
        }));

        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select blocked task to resolve'
        });

        if (!selectedTask) return;

        // Select resolution
        const resolutionItems: PickItem<'block' | 'allow' | 'merge'>[] = [
            { label: 'Block task', value: 'block', description: 'Keep task blocked' },
            { label: 'Allow task', value: 'allow', description: 'Allow task to proceed' },
            { label: 'Merge tasks', value: 'merge', description: 'Merge with conflicting tasks' }
        ];

        const selectedResolution = await this.notificationService.showQuickPick(resolutionItems, {
            placeHolder: 'Select conflict resolution'
        });

        if (!selectedResolution) return;

        const success = this.taskQueue.resolveConflict(selectedTask.value, selectedResolution.value);
        if (success) {
            await this.notificationService.showInformation('Conflict resolved successfully');
        } else {
            await this.notificationService.showError('Failed to resolve conflict');
        }
    }

    private async viewTaskDependencies(): Promise<void> {
        const tasks = this.taskQueue.getTasks();
        const tasksWithDeps = tasks.filter(t => t.dependsOn && t.dependsOn.length > 0);
        
        if (tasksWithDeps.length === 0) {
            await this.notificationService.showInformation('No task dependencies found');
            return;
        }

        let message = 'Task Dependencies:\n\n';
        for (const task of tasksWithDeps) {
            message += `📋 ${task.title}\n`;
            message += `   Depends on: ${task.dependsOn?.join(', ')}\n`;
            message += `   Status: ${task.status}\n\n`;
        }

        await this.notificationService.showInformation(message);
    }

    private async retryBlockedTask(): Promise<void> {
        const blockedTasks = this.taskQueue.getBlockedTasks();
        
        if (blockedTasks.length === 0) {
            await this.notificationService.showInformation('No blocked tasks found');
            return;
        }

        // Select blocked task
        const taskItems: PickItem<string>[] = blockedTasks.map(task => ({
            label: task.title,
            description: `Blocked: ${formatBlockingReason(task) || 'Unknown reason'}`,
            value: task.id
        }));

        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select blocked task to retry'
        });

        if (!selectedTask) return;

        // Try to resolve conflicts and unblock
        const success = this.taskQueue.resolveConflict(selectedTask.value, 'allow');
        if (success) {
            await this.notificationService.showInformation('Task unblocked successfully');
        } else {
            await this.notificationService.showError('Failed to unblock task');
        }
    }

    private async createTaskBatch(): Promise<void> {
        const taskCount = await this.notificationService.showInputBox({
            prompt: 'How many tasks to create?',
            placeHolder: 'e.g., 3',
            value: '2'
        });

        if (!taskCount) return;

        const count = parseInt(taskCount, 10);
        if (isNaN(count) || count < 1 || count > 10) {
            await this.notificationService.showError('Please enter a number between 1 and 10');
            return;
        }

        const tasks: TaskConfig[] = [];
        
        for (let i = 0; i < count; i++) {
            const title = await this.notificationService.showInputBox({
                prompt: `Enter title for task ${i + 1}`,
                placeHolder: `Task ${i + 1} title`
            });

            if (!title) break;

            const description = await this.notificationService.showInputBox({
                prompt: `Enter description for task ${i + 1}`,
                placeHolder: `Task ${i + 1} description`,
                value: title
            });

            if (!description) break;

            const priority = await this.notificationService.showQuickPick([
                { label: '🔴 High', value: 'high' },
                { label: '🟡 Medium', value: 'medium' },
                { label: '🟢 Low', value: 'low' }
            ], {
                placeHolder: `Select priority for task ${i + 1}`
            });

            if (!priority) break;

            tasks.push({
                title,
                description,
                priority: priority.value as 'high' | 'medium' | 'low'
            });
        }

        if (tasks.length === 0) {
            await this.notificationService.showInformation('No tasks created');
            return;
        }

        // Create all tasks
        for (const taskConfig of tasks) {
            try {
                this.taskQueue.addTask(taskConfig);
            } catch (error: any) {
                await this.notificationService.showError(`Failed to create task "${taskConfig.title}": ${error.message}`);
            }
        }

        await this.notificationService.showInformation(`Created ${tasks.length} tasks successfully`);
    }

    private async resolveAllConflicts(): Promise<void> {
        const blockedTasks = this.taskQueue.getBlockedTasks();
        
        if (blockedTasks.length === 0) {
            await this.notificationService.showInformation('No blocked tasks found');
            return;
        }

        const confirmed = await this.notificationService.confirm(
            `Resolve all conflicts for ${blockedTasks.length} blocked tasks?`,
            'Resolve All'
        );

        if (!confirmed) return;

        let resolved = 0;
        for (const task of blockedTasks) {
            const success = this.taskQueue.resolveConflict(task.id, 'allow');
            if (success) resolved++;
        }

        await this.notificationService.showInformation(`Resolved conflicts for ${resolved} out of ${blockedTasks.length} tasks`);
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}