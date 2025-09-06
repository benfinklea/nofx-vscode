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
exports.TaskCommands = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("../services/interfaces");
const ui_1 = require("../types/ui");
class TaskCommands {
    constructor(container) {
        this.agentManager = container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve(interfaces_1.SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
    }
    register() {
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
    async createTask() {
        const taskDescription = await this.notificationService.showInputBox({
            prompt: 'Enter task description',
            placeHolder: 'e.g., Fix authentication bug in login component'
        });
        if (!taskDescription) {
            return;
        }
        const fileContext = [];
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
            fileContext.push(relativePath);
        }
        const priorityOptions = [
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
        const tagsInput = await this.notificationService.showInputBox({
            prompt: 'Enter tags (comma-separated)',
            placeHolder: 'e.g., frontend, bug, authentication',
            value: ''
        });
        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
        const capabilitiesInput = await this.notificationService.showInputBox({
            prompt: 'Enter required capabilities (comma-separated)',
            placeHolder: 'e.g., React, TypeScript, CSS',
            value: ''
        });
        const requiredCapabilities = capabilitiesInput ? capabilitiesInput.split(',').map(cap => cap.trim()).filter(cap => cap.length > 0) : [];
        const durationInput = await this.notificationService.showInputBox({
            prompt: 'Enter estimated duration in minutes (optional)',
            placeHolder: 'e.g., 30',
            value: ''
        });
        const estimatedDuration = durationInput ? parseInt(durationInput, 10) : undefined;
        const existingTasks = this.taskQueue.getTasks().filter(t => t.status !== 'completed');
        let dependsOn = [];
        if (existingTasks.length > 0) {
            const dependencyChoice = await this.notificationService.showQuickPick([
                { label: 'No dependencies', value: 'none' },
                { label: 'Add dependencies', value: 'add' }
            ], {
                placeHolder: 'Does this task depend on other tasks?'
            });
            if (dependencyChoice?.value === 'add') {
                const dependencyItems = existingTasks.map(task => ({
                    label: task.title,
                    description: `${task.status} - ${task.priority} priority`,
                    value: task.id
                }));
                const selectedDependencies = await this.notificationService.showQuickPick(dependencyItems, {
                    placeHolder: 'Select tasks this depends on (select multiple)',
                    canPickMany: true
                });
                if (selectedDependencies && Array.isArray(selectedDependencies)) {
                    dependsOn = selectedDependencies.map((item) => item.value);
                }
            }
        }
        const taskConfig = {
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
            const task = this.taskQueue.addTask(taskConfig);
            await this.notificationService.showInformation('Task created and added to queue');
        }
        catch (error) {
            await this.notificationService.showError(`Failed to create task: ${error.message}`);
        }
    }
    async completeTask() {
        const activeTasks = this.taskQueue.getTasks().filter(t => t.status !== 'completed');
        if (activeTasks.length === 0) {
            await this.notificationService.showInformation('No active tasks to complete');
            return;
        }
        let taskToComplete;
        if (activeTasks.length === 1) {
            taskToComplete = activeTasks[0];
        }
        else {
            const items = activeTasks.map(task => ({
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
        const success = this.taskQueue.completeTask(taskToComplete.id);
        if (success) {
            if (taskToComplete.assignedTo) {
                this.agentManager.completeTask(taskToComplete.assignedTo, taskToComplete);
            }
            await this.notificationService.showInformation('Task marked as complete');
        }
        else {
            await this.notificationService.showError('Failed to complete task. Check task state and dependencies.');
        }
    }
    async addTaskDependency() {
        const tasks = this.taskQueue.getTasks().filter(t => t.status !== 'completed');
        if (tasks.length < 2) {
            await this.notificationService.showInformation('Need at least 2 tasks to create dependencies');
            return;
        }
        const taskItems = tasks.map(task => ({
            label: task.title,
            description: `${task.status} - ${task.priority} priority`,
            value: task.id
        }));
        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select task to add dependency to'
        });
        if (!selectedTask)
            return;
        const dependencyItems = tasks
            .filter(t => t.id !== selectedTask.value)
            .map(task => ({
            label: task.title,
            description: `${task.status} - ${task.priority} priority`,
            value: task.id
        }));
        const selectedDependency = await this.notificationService.showQuickPick(dependencyItems, {
            placeHolder: 'Select task this depends on'
        });
        if (!selectedDependency)
            return;
        const success = this.taskQueue.addTaskDependency(selectedTask.value, selectedDependency.value);
        if (success) {
            await this.notificationService.showInformation('Dependency added successfully');
        }
        else {
            await this.notificationService.showError('Failed to add dependency (may create circular dependency)');
        }
    }
    async removeTaskDependency() {
        const tasks = this.taskQueue.getTasks().filter(t => t.dependsOn && t.dependsOn.length > 0);
        if (tasks.length === 0) {
            await this.notificationService.showInformation('No tasks with dependencies found');
            return;
        }
        const taskItems = tasks.map(task => ({
            label: task.title,
            description: `Depends on: ${task.dependsOn?.join(', ')}`,
            value: task.id
        }));
        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select task to remove dependency from'
        });
        if (!selectedTask)
            return;
        const task = this.taskQueue.getTask(selectedTask.value);
        if (!task || !task.dependsOn || task.dependsOn.length === 0)
            return;
        const dependencyItems = task.dependsOn.map(depId => {
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
        if (!selectedDependency)
            return;
        const success = this.taskQueue.removeTaskDependency(selectedTask.value, selectedDependency.value);
        if (success) {
            await this.notificationService.showInformation('Dependency removed successfully');
        }
        else {
            await this.notificationService.showError('Failed to remove dependency');
        }
    }
    async resolveTaskConflict() {
        const blockedTasks = this.taskQueue.getBlockedTasks();
        if (blockedTasks.length === 0) {
            await this.notificationService.showInformation('No blocked tasks found');
            return;
        }
        const taskItems = blockedTasks.map(task => ({
            label: task.title,
            description: `Blocked: ${(0, ui_1.formatBlockingReason)(task) || 'Unknown reason'}`,
            value: task.id
        }));
        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select blocked task to resolve'
        });
        if (!selectedTask)
            return;
        const resolutionItems = [
            { label: 'Block task', value: 'block', description: 'Keep task blocked' },
            { label: 'Allow task', value: 'allow', description: 'Allow task to proceed' },
            { label: 'Merge tasks', value: 'merge', description: 'Merge with conflicting tasks' }
        ];
        const selectedResolution = await this.notificationService.showQuickPick(resolutionItems, {
            placeHolder: 'Select conflict resolution'
        });
        if (!selectedResolution)
            return;
        const success = this.taskQueue.resolveConflict(selectedTask.value, selectedResolution.value);
        if (success) {
            await this.notificationService.showInformation('Conflict resolved successfully');
        }
        else {
            await this.notificationService.showError('Failed to resolve conflict');
        }
    }
    async viewTaskDependencies() {
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
    async retryBlockedTask() {
        const blockedTasks = this.taskQueue.getBlockedTasks();
        if (blockedTasks.length === 0) {
            await this.notificationService.showInformation('No blocked tasks found');
            return;
        }
        const taskItems = blockedTasks.map(task => ({
            label: task.title,
            description: `Blocked: ${(0, ui_1.formatBlockingReason)(task) || 'Unknown reason'}`,
            value: task.id
        }));
        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            placeHolder: 'Select blocked task to retry'
        });
        if (!selectedTask)
            return;
        const success = this.taskQueue.resolveConflict(selectedTask.value, 'allow');
        if (success) {
            await this.notificationService.showInformation('Task unblocked successfully');
        }
        else {
            await this.notificationService.showError('Failed to unblock task');
        }
    }
    async createTaskBatch() {
        const taskCount = await this.notificationService.showInputBox({
            prompt: 'How many tasks to create?',
            placeHolder: 'e.g., 3',
            value: '2'
        });
        if (!taskCount)
            return;
        const count = parseInt(taskCount, 10);
        if (isNaN(count) || count < 1 || count > 10) {
            await this.notificationService.showError('Please enter a number between 1 and 10');
            return;
        }
        const tasks = [];
        for (let i = 0; i < count; i++) {
            const title = await this.notificationService.showInputBox({
                prompt: `Enter title for task ${i + 1}`,
                placeHolder: `Task ${i + 1} title`
            });
            if (!title)
                break;
            const description = await this.notificationService.showInputBox({
                prompt: `Enter description for task ${i + 1}`,
                placeHolder: `Task ${i + 1} description`,
                value: title
            });
            if (!description)
                break;
            const priority = await this.notificationService.showQuickPick([
                { label: '🔴 High', value: 'high' },
                { label: '🟡 Medium', value: 'medium' },
                { label: '🟢 Low', value: 'low' }
            ], {
                placeHolder: `Select priority for task ${i + 1}`
            });
            if (!priority)
                break;
            tasks.push({
                title,
                description,
                priority: priority.value
            });
        }
        if (tasks.length === 0) {
            await this.notificationService.showInformation('No tasks created');
            return;
        }
        for (const taskConfig of tasks) {
            try {
                this.taskQueue.addTask(taskConfig);
            }
            catch (error) {
                await this.notificationService.showError(`Failed to create task "${taskConfig.title}": ${error.message}`);
            }
        }
        await this.notificationService.showInformation(`Created ${tasks.length} tasks successfully`);
    }
    async resolveAllConflicts() {
        const blockedTasks = this.taskQueue.getBlockedTasks();
        if (blockedTasks.length === 0) {
            await this.notificationService.showInformation('No blocked tasks found');
            return;
        }
        const confirmed = await this.notificationService.confirm(`Resolve all conflicts for ${blockedTasks.length} blocked tasks?`, 'Resolve All');
        if (!confirmed)
            return;
        let resolved = 0;
        for (const task of blockedTasks) {
            const success = this.taskQueue.resolveConflict(task.id, 'allow');
            if (success)
                resolved++;
        }
        await this.notificationService.showInformation(`Resolved conflicts for ${resolved} out of ${blockedTasks.length} tasks`);
    }
    dispose() {
    }
}
exports.TaskCommands = TaskCommands;
//# sourceMappingURL=TaskCommands.js.map