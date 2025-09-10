import * as vscode from 'vscode';
import {
    ICommandHandler,
    ICommandService,
    INotificationService,
    ILogger,
    IDashboardViewModel
} from '../services/interfaces';
import { ServiceLocator } from '../services/ServiceLocator';
import { MessageFlowDashboard } from '../dashboard/MessageFlowDashboard';

export class OrchestrationCommands implements ICommandHandler {
    private commandService: ICommandService;
    private notificationService: INotificationService;
    private loggingService: ILogger;
    private orchestrationServer: any;
    private serviceLocator: typeof ServiceLocator;

    constructor(serviceLocator: typeof ServiceLocator) {
        this.serviceLocator = serviceLocator;
        this.commandService = ServiceLocator.get<ICommandService>('CommandService');
        this.notificationService = ServiceLocator.get<INotificationService>('NotificationService');
        this.loggingService = ServiceLocator.get<ILogger>('LoggingService');
    }

    setOrchestrationServer(server: any): void {
        this.orchestrationServer = server;
    }

    register(): void {
        // Register orchestration-related commands
        this.commandService.register('nofx.openMessageFlow', this.openMessageFlow.bind(this));
        this.commandService.register('nofx.showOrchestrator', this.showOrchestrator.bind(this));
    }

    private async openMessageFlow(): Promise<void> {
        try {
            this.loggingService.info('Opening Message Flow Dashboard');

            // Get the dashboard from ServiceLocator or create it
            let dashboard = this.serviceLocator.tryGet('MessageFlowDashboard');

            if (!dashboard) {
                const context = this.serviceLocator.get<vscode.ExtensionContext>('ExtensionContext');
                const dashboardViewModel = this.serviceLocator.get('DashboardViewModel') as IDashboardViewModel;
                dashboard = MessageFlowDashboard.create(context, dashboardViewModel, this.loggingService);
                this.serviceLocator.register('MessageFlowDashboard', dashboard);
            }

            // Show the dashboard
            if (dashboard && typeof dashboard === 'object' && 'show' in dashboard) {
                await (dashboard as any).show();
            } else {
                await this.notificationService.showError('Failed to open Message Flow Dashboard');
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to open Message Flow Dashboard', err);
            await this.notificationService.showError(`Failed to open dashboard: ${err.message}`);
        }
    }

    private async showOrchestrator(): Promise<void> {
        try {
            // Show a quick pick menu for orchestrator actions
            const actions = [
                { label: '$(play) Start Conductor', value: 'startConductor' },
                { label: '$(add) Add Agent', value: 'addAgent' },
                { label: '$(graph) Open Dashboard', value: 'openMessageFlow' },
                { label: '$(history) Restore Session', value: 'restoreAgents' },
                { label: '$(settings-gear) Settings', value: 'settings' }
            ];

            const selected = await this.notificationService.showQuickPick(actions, {
                placeHolder: 'Select an orchestrator action'
            });

            if (selected) {
                const action = selected.value;
                switch (action) {
                    case 'startConductor':
                        await this.commandService.execute('nofx.startConductor');
                        break;
                    case 'addAgent':
                        await this.commandService.execute('nofx.addAgent');
                        break;
                    case 'openMessageFlow':
                        await this.openMessageFlow();
                        break;
                    case 'restoreAgents':
                        await this.commandService.execute('nofx.restoreAgents');
                        break;
                    case 'settings':
                        await this.commandService.execute('nofx.settings');
                        break;
                }
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService.error('Failed to show orchestrator menu', err);
            await this.notificationService.showError(`Failed to show orchestrator: ${err.message}`);
        }
    }

    dispose(): void {
        // Cleanup handled by CommandService
    }
}
