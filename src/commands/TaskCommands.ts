import * as vscode from 'vscode';
import { ICommandHandler, ICommandService, INotificationService, IConfiguration, ILogger } from '../services/interfaces';
import { ServiceLocator } from '../services/ServiceLocator';
import { TaskQueue } from '../tasks/TaskQueue';
import { AgentManager } from '../agents/AgentManager';
import { Agent } from '../agents/types';
import { PickItem } from '../types/ui';

interface TaskConfig {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'queued' | 'ready' | 'in-progress' | 'completed' | 'blocked';
    assignedTo?: string;
    estimatedDuration?: number;
    dependsOn: string[];
    tags: string[];
    requiredCapabilities: string[];
}

export class TaskCommands implements ICommandHandler {
    private readonly taskQueue: TaskQueue;
    private readonly agentManager: AgentManager;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfiguration;
    private readonly loggingService: ILogger;
    private readonly context: vscode.ExtensionContext;

    constructor() {
        this.taskQueue = ServiceLocator.get<TaskQueue>('TaskQueue');
        this.agentManager = ServiceLocator.get<AgentManager>('AgentManager');
        this.commandService = ServiceLocator.get<ICommandService>('CommandService');
        this.notificationService = ServiceLocator.get<INotificationService>('NotificationService');
        this.configService = ServiceLocator.get<IConfiguration>('ConfigurationService');
        this.loggingService = ServiceLocator.get<ILogger>('LoggingService');
        this.context = ServiceLocator.get<vscode.ExtensionContext>('ExtensionContext');
    }

    register(): void {
        // Register task-related commands
        this.commandService.register('nofx.createTask', this.createTask.bind(this));
        this.commandService.register('nofx.createTaskBatch', this.createTaskBatch.bind(this));
        this.commandService.register('nofx.viewTaskDependencies', this.viewTaskDependencies.bind(this));
        this.commandService.register('nofx.addTaskDependency', this.addTaskDependency.bind(this));
        this.commandService.register('nofx.assignTask', this.assignTask.bind(this));
        this.commandService.register('nofx.completeTask', this.completeTask.bind(this));
    }

    private async createTask(): Promise<void> {
        try {
            this.loggingService.info('Creating new task...');
            
            // Get task title
            const title = await vscode.window.showInputBox({
                prompt: 'Enter task title',
                placeHolder: 'e.g., Implement user authentication',
                validateInput: (value: string) => {
                    if (!value || value.trim().length === 0) {
                        return 'Task title is required';
                    }
                    return null;
                }
            });

            if (!title) {
                return; // User cancelled
            }

            // Get task description
            const description = await vscode.window.showInputBox({
                prompt: 'Enter task description (optional)',
                placeHolder: 'e.g., Create login/signup forms with validation and backend integration',
            }) || '';

            // Get priority
            const priorityItems: PickItem<'low' | 'medium' | 'high'>[] = [
                { label: '🔴 High Priority', value: 'high', description: 'Urgent, blocking other work' },
                { label: '🟡 Medium Priority', value: 'medium', description: 'Important, should be done soon' },
                { label: '🟢 Low Priority', value: 'low', description: 'Nice to have, can wait' }
            ];

            const priorityChoice = await this.notificationService.showQuickPick(priorityItems, {
                title: 'Select Task Priority',
                placeHolder: 'Choose priority level for this task'
            });

            if (!priorityChoice) {
                return; // User cancelled
            }

            // Get available agents for assignment
            const agents = this.agentManager.getActiveAgents();
            const agentItems: PickItem<string>[] = [
                { label: '$(person) Unassigned', value: '', description: 'Task will be assigned later' }
            ];

            agents.forEach(agent => {
                agentItems.push({
                    label: `$(${agent.template.terminalIcon || 'person'}) ${agent.name}`,
                    value: agent.id,
                    description: `${agent.template.name} - ${agent.status}`
                });
            });

            const agentChoice = await this.notificationService.showQuickPick(agentItems, {
                title: 'Assign Task to Agent (Optional)',
                placeHolder: 'Choose which agent should handle this task'
            });

            if (agentChoice === undefined) {
                return; // User cancelled
            }

            // Create task configuration
            const taskConfig: TaskConfig = {
                id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: title.trim(),
                description: description.trim(),
                priority: priorityChoice.value,
                status: 'queued',
                assignedTo: agentChoice.value || undefined,
                dependsOn: [],
                tags: [],
                requiredCapabilities: []
            };

            // Add task to queue
            const task = this.taskQueue.addTask(taskConfig);
            
            this.loggingService.info(`Task created: ${task.title} (${task.id})`);
            this.notificationService.showInformation(
                `✅ Task "${task.title}" created successfully${task.assignedTo ? ` and assigned to ${agents.find(a => a.id === task.assignedTo)?.name}` : ''}`
            );

        } catch (error: any) {
            this.loggingService.error('Failed to create task:', error);
            this.notificationService.showError(`Failed to create task: ${error.message}`);
        }
    }

    private async createTaskBatch(): Promise<void> {
        try {
            this.loggingService.info('Creating task batch for project...');
            
            // Predefined task templates for the NofX project
            const projectTasks = [
                {
                    title: 'Implement user authentication system',
                    description: 'Create login/signup forms, JWT handling, password reset functionality',
                    priority: 'high' as const,
                    capabilities: ['frontend', 'backend', 'security']
                },
                {
                    title: 'Design and implement API endpoints',
                    description: 'Create RESTful API for agents, tasks, and orchestration',
                    priority: 'high' as const,
                    capabilities: ['backend', 'api-design']
                },
                {
                    title: 'Build responsive dashboard UI',
                    description: 'Create agent management dashboard with real-time updates',
                    priority: 'medium' as const,
                    capabilities: ['frontend', 'ui-design']
                },
                {
                    title: 'Set up CI/CD pipeline',
                    description: 'Configure automated testing, building, and deployment',
                    priority: 'medium' as const,
                    capabilities: ['devops', 'ci-cd']
                },
                {
                    title: 'Implement database schema and migrations',
                    description: 'Design and implement database structure for agents and tasks',
                    priority: 'high' as const,
                    capabilities: ['database', 'backend']
                },
                {
                    title: 'Write comprehensive test suite',
                    description: 'Unit tests, integration tests, and E2E tests',
                    priority: 'medium' as const,
                    capabilities: ['testing', 'quality-assurance']
                }
            ];

            const selectedTasks = await vscode.window.showQuickPick(
                projectTasks.map((task, index) => ({
                    label: `$(checklist) ${task.title}`,
                    description: task.description,
                    detail: `Priority: ${task.priority} | Requires: ${task.capabilities.join(', ')}`,
                    picked: true, // Pre-select all tasks
                    task: task
                })),
                {
                    canPickMany: true,
                    title: 'Select Tasks to Create',
                    placeHolder: 'Choose which tasks to add to the project'
                }
            );

            if (!selectedTasks || selectedTasks.length === 0) {
                return; // User cancelled or selected nothing
            }

            // Create all selected tasks
            let createdCount = 0;
            for (const selection of selectedTasks) {
                const task = selection.task;
                const taskConfig: TaskConfig = {
                    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    title: task.title,
                    description: task.description,
                    priority: task.priority,
                    status: 'queued',
                    dependsOn: [],
                    tags: task.capabilities,
                    requiredCapabilities: task.capabilities
                };

                this.taskQueue.addTask(taskConfig);
                createdCount++;
            }

            this.loggingService.info(`Task batch created: ${createdCount} tasks`);
            this.notificationService.showInformation(`✅ Created ${createdCount} tasks for the NofX project`);

        } catch (error: any) {
            this.loggingService.error('Failed to create task batch:', error);
            this.notificationService.showError(`Failed to create task batch: ${error.message}`);
        }
    }

    private async viewTaskDependencies(): Promise<void> {
        const tasks = this.taskQueue.getTasks();
        const tasksWithDeps = tasks.filter(task => task.dependsOn && task.dependsOn.length > 0);
        
        if (tasksWithDeps.length === 0) {
            this.notificationService.showInformation('No task dependencies found');
            return;
        }

        const dependencyInfo = tasksWithDeps.map(task => {
            const depTasks = task.dependsOn.map(depId => {
                const depTask = tasks.find(t => t.id === depId);
                return depTask ? depTask.title : `Unknown (${depId})`;
            }).join(', ');
            
            return `• ${task.title} → depends on: ${depTasks}`;
        }).join('\n');

        await vscode.window.showInformationMessage(
            `Task Dependencies:\n\n${dependencyInfo}`,
            { modal: true }
        );
    }

    private async addTaskDependency(): Promise<void> {
        const tasks = this.taskQueue.getTasks();
        
        if (tasks.length < 2) {
            this.notificationService.showWarning('Need at least 2 tasks to create dependencies');
            return;
        }

        // Select dependent task
        const dependentTaskItems: PickItem<string>[] = tasks.map(task => ({
            label: task.title,
            value: task.id,
            description: `Status: ${task.status} | Priority: ${task.priority}`
        }));

        const dependentTask = await this.notificationService.showQuickPick(dependentTaskItems, {
            title: 'Select Dependent Task',
            placeHolder: 'Choose the task that depends on another task'
        });

        if (!dependentTask) return;

        // Select dependency task (exclude the dependent task itself)
        const dependencyItems: PickItem<string>[] = tasks
            .filter(task => task.id !== dependentTask.value)
            .map(task => ({
                label: task.title,
                value: task.id,
                description: `Status: ${task.status} | Priority: ${task.priority}`
            }));

        const dependencyTask = await this.notificationService.showQuickPick(dependencyItems, {
            title: 'Select Dependency Task',
            placeHolder: 'Choose the task that must be completed first'
        });

        if (!dependencyTask) return;

        // Add dependency
        const success = this.taskQueue.addTaskDependency(dependentTask.value, dependencyTask.value);
        
        if (success) {
            const depTask = tasks.find(t => t.id === dependentTask.value);
            const depOnTask = tasks.find(t => t.id === dependencyTask.value);
            this.notificationService.showInformation(
                `✅ Dependency added: "${depTask?.title}" now depends on "${depOnTask?.title}"`
            );
        } else {
            this.notificationService.showError('Failed to add task dependency (may cause circular dependency)');
        }
    }

    private async assignTask(): Promise<void> {
        const tasks = this.taskQueue.getTasks().filter(t => !t.assignedTo && (t.status === 'queued' || t.status === 'ready'));
        const agents = this.agentManager.getActiveAgents();

        if (tasks.length === 0) {
            this.notificationService.showInformation('No unassigned tasks available');
            return;
        }

        if (agents.length === 0) {
            this.notificationService.showWarning('No active agents available for task assignment');
            return;
        }

        // Select task
        const taskItems: PickItem<string>[] = tasks.map(task => ({
            label: task.title,
            value: task.id,
            description: `Priority: ${task.priority} | ${task.description}`
        }));

        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            title: 'Select Task to Assign',
            placeHolder: 'Choose which task to assign to an agent'
        });

        if (!selectedTask) return;

        // Select agent
        const agentItems: PickItem<string>[] = agents.map(agent => ({
            label: `$(${agent.template.terminalIcon || 'person'}) ${agent.name}`,
            value: agent.id,
            description: `${agent.template.name} - ${agent.status}`
        }));

        const selectedAgent = await this.notificationService.showQuickPick(agentItems, {
            title: 'Select Agent',
            placeHolder: 'Choose which agent should handle this task'
        });

        if (!selectedAgent) return;

        // Assign task
        const success = this.taskQueue.assignTask(selectedTask.value, selectedAgent.value);
        
        if (success) {
            const task = tasks.find(t => t.id === selectedTask.value);
            const agent = agents.find(a => a.id === selectedAgent.value);
            this.notificationService.showInformation(
                `✅ Task "${task?.title}" assigned to ${agent?.name}`
            );
        } else {
            this.notificationService.showError('Failed to assign task');
        }
    }

    private async completeTask(): Promise<void> {
        const tasks = this.taskQueue.getTasks().filter(t => t.status === 'in-progress');

        if (tasks.length === 0) {
            this.notificationService.showInformation('No tasks in progress to complete');
            return;
        }

        // Select task to complete
        const taskItems: PickItem<string>[] = tasks.map(task => ({
            label: task.title,
            value: task.id,
            description: `Assigned to: ${task.assignedTo ? 
                this.agentManager.getActiveAgents().find(a => a.id === task.assignedTo)?.name || 'Unknown' : 
                'Unassigned'}`
        }));

        const selectedTask = await this.notificationService.showQuickPick(taskItems, {
            title: 'Select Task to Complete',
            placeHolder: 'Choose which task to mark as completed'
        });

        if (!selectedTask) return;

        // Mark task as completed
        const success = this.taskQueue.completeTask(selectedTask.value);
        
        if (success) {
            const task = tasks.find(t => t.id === selectedTask.value);
            this.notificationService.showInformation(
                `✅ Task "${task?.title}" marked as completed`
            );
        } else {
            this.notificationService.showError('Failed to complete task');
        }
    }

    dispose(): void {
        // Clean up any resources if needed
    }
}