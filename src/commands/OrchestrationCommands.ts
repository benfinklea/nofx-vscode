import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    IMessagePersistenceService,
    ILoggingService,
    IConductorViewModel,
    SERVICE_TOKENS
} from '../services/interfaces';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { OrchestrationServer } from '../orchestration/OrchestrationServer';
import { MessageFlowDashboard } from '../dashboard/MessageFlowDashboard';
import { EnhancedConductorPanel } from '../panels/EnhancedConductorPanel';
import { AgentPersistence } from '../persistence/AgentPersistence';

export class OrchestrationCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly loggingService: ILoggingService;
    private readonly context: vscode.ExtensionContext;
    private readonly container: IContainer;
    private readonly messagePersistence: IMessagePersistenceService;

    private orchestrationServer?: OrchestrationServer;
    private messageFlowDashboard?: MessageFlowDashboard;
    private conductorPanel?: EnhancedConductorPanel;

    constructor(container: IContainer) {
        this.container = container;
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve<TaskQueue>(SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
        this.context = container.resolve<vscode.ExtensionContext>(SERVICE_TOKENS.ExtensionContext);
        this.messagePersistence = container.resolve<IMessagePersistenceService>(
            SERVICE_TOKENS.MessagePersistenceService
        );

        // Resolve optional services
        this.orchestrationServer = container.resolveOptional<OrchestrationServer>(SERVICE_TOKENS.OrchestrationServer);
        this.messageFlowDashboard = container.resolveOptional<MessageFlowDashboard>(
            SERVICE_TOKENS.MessageFlowDashboard
        );
    }

    setOrchestrationServer(server: OrchestrationServer): void {
        this.orchestrationServer = server;
    }

    register(): void {
        this.commandService.register('nofx.showOrchestrator', this.showOrchestrator.bind(this));
        this.commandService.register('nofx.openMessageFlow', this.openMessageFlow.bind(this));
        this.commandService.register('nofx.resetNofX', this.resetNofX.bind(this));
    }

    private async showOrchestrator(): Promise<void> {
        if (this.conductorPanel) {
            this.conductorPanel.reveal();
        } else {
            const viewModel = this.container.resolve<IConductorViewModel>(SERVICE_TOKENS.ConductorViewModel);
            const loggingService = this.container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
            this.conductorPanel = EnhancedConductorPanel.create(this.context, viewModel, loggingService);
        }
    }

    private async openMessageFlow(): Promise<void> {
        if (!this.orchestrationServer) {
            await this.notificationService.showError('Orchestration server not running');
            return;
        }

        if (!this.messageFlowDashboard) {
            // Use the factory to create the dashboard on demand
            this.messageFlowDashboard = this.container.resolve(SERVICE_TOKENS.MessageFlowDashboard);
        }

        await this.messageFlowDashboard.show();
    }

    private async resetNofX(): Promise<void> {
        const confirmed = await this.notificationService.confirmDestructive(
            'Reset NofX? This will stop all agents, clear all data, and restart the orchestration server.',
            'Reset Everything'
        );

        if (!confirmed) {
            return;
        }

        await this.notificationService.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Resetting NofX...',
                cancellable: false
            },
            async progress => {
                try {
                    // Step 1: Stop orchestration server
                    progress.report({ message: 'Stopping orchestration server...', increment: 20 });
                    if (this.orchestrationServer) {
                        await this.orchestrationServer.stop();
                    }

                    // Step 2: Remove all agents
                    progress.report({ message: 'Removing all agents...', increment: 20 });
                    const agents = this.agentManager.getActiveAgents();
                    for (const agent of agents) {
                        await this.agentManager.removeAgent(agent.id);
                    }

                    // Step 3: Clear task queue
                    progress.report({ message: 'Clearing task queue...', increment: 20 });
                    this.taskQueue.clearAllTasks();

                    // Step 4: Clear persistence
                    progress.report({ message: 'Clearing saved data...', increment: 15 });
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder) {
                        const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
                        await persistence.clearAll();

                        // Also clear .nofx directory if it exists
                        const nofxDir = path.join(workspaceFolder.uri.fsPath, '.nofx');
                        try {
                            await fsPromises.access(nofxDir);
                            await this.removeDirectory(nofxDir);
                        } catch (error) {
                            // Directory doesn't exist, ignore
                        }
                    }

                    // Step 5: Clear orchestration history
                    progress.report({ message: 'Clearing orchestration history...', increment: 5 });
                    try {
                        await this.messagePersistence.clear();
                    } catch (error) {
                        this.loggingService?.warn('Failed to clear orchestration history:', error);
                        // Don't fail the entire reset for this
                    }

                    // Step 6: Restart orchestration server
                    progress.report({ message: 'Restarting orchestration server...', increment: 20 });
                    if (this.orchestrationServer) {
                        await this.orchestrationServer.start();
                    }

                    // Close any open dashboards or panels
                    this.messageFlowDashboard = undefined;
                    this.conductorPanel?.dispose();
                    this.conductorPanel = undefined;

                    await this.notificationService.showInformation(
                        '🎸 NofX has been completely reset. You can now start fresh!'
                    );
                } catch (error) {
                    this.loggingService?.error('Error resetting NofX:', error);
                    await this.notificationService.showError(
                        `Failed to reset NofX: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                }
            }
        );
    }

    private async removeDirectory(dirPath: string): Promise<void> {
        // Check if this is the .nofx directory and preserve templates
        if (dirPath.endsWith('.nofx')) {
            const templatesPath = path.join(dirPath, 'templates');
            const hasTemplates = await fsPromises
                .access(templatesPath)
                .then(() => true)
                .catch(() => false);

            if (hasTemplates) {
                // Remove everything except templates
                const items = await fsPromises.readdir(dirPath);
                for (const item of items) {
                    if (item !== 'templates') {
                        const itemPath = path.join(dirPath, item);
                        await fsPromises.rm(itemPath, { recursive: true, force: true });
                    }
                }
                return; // Don't remove the directory itself
            }
        }

        // For other directories or .nofx without templates, remove completely
        await fsPromises.rm(dirPath, { recursive: true, force: true });
    }

    dispose(): void {
        this.messageFlowDashboard = undefined;
        this.conductorPanel?.dispose();
        this.conductorPanel = undefined;
        // Command disposal handled by CommandService
    }
}
