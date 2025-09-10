import * as vscode from 'vscode';
import { ServiceLocator } from '../services/ServiceLocator';
import { AgentManager } from '../agents/AgentManager';
import { INotificationService, ICommandService, IConfiguration } from '../services/interfaces';
import { ILogger } from '../interfaces/ILogging';

/**
 * Main Commands - Core NofX functionality
 * Handles agents, conductors, and primary workflows
 */
export class MainCommands {
    private readonly agentManager: AgentManager;
    private readonly notificationService: INotificationService;
    private readonly logger: ILogger;
    private readonly config: IConfiguration;

    constructor() {
        this.agentManager = ServiceLocator.get<AgentManager>('AgentManager');
        this.notificationService = ServiceLocator.get<INotificationService>('NotificationService');
        this.logger = ServiceLocator.get<ILogger>('LoggingService');
        this.config = ServiceLocator.get<IConfiguration>('ConfigurationService');
    }

    register(context: vscode.ExtensionContext): void {
        // Agent Commands
        this.registerCommand(context, 'nofx.addAgent', () => this.addAgent());
        this.registerCommand(context, 'nofx.removeAgent', agent => this.removeAgent(agent));
        this.registerCommand(context, 'nofx.clearAgents', () => this.clearAgents());
        this.registerCommand(context, 'nofx.restoreAgents', () => this.restoreAgents());

        // Conductor Commands
        this.registerCommand(context, 'nofx.startConductor', () => this.startConductor());
        this.registerCommand(context, 'nofx.openConductorTerminal', () => this.openConductorTerminal());

        // Workflow Commands
        this.registerCommand(context, 'nofx.quickStart', () => this.quickStart());
        this.registerCommand(context, 'nofx.openMessageFlow', () => this.openMessageFlow());
    }

    private registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any) {
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    }

    // Command implementations
    private async addAgent(): Promise<void> {
        try {
            const agents = await this.agentManager.selectAgents();
            if (agents && agents.length > 0) {
                await this.agentManager.spawnAgents(agents);
                this.notificationService.showInformation(`Added ${agents.length} agent(s)`);
            }
        } catch (error) {
            this.logger.error('Failed to add agent', error);
            this.notificationService.showError('Failed to add agent');
        }
    }

    private async removeAgent(agent: any): Promise<void> {
        if (agent?.id) {
            await this.agentManager.removeAgent(agent.id);
        }
    }

    private async clearAgents(): Promise<void> {
        const confirm = await this.notificationService.confirm('Remove all agents?', 'Clear All');
        if (confirm) {
            await this.agentManager.clearAllAgents();
        }
    }

    private async restoreAgents(): Promise<void> {
        const restored = await this.agentManager.restorePreviousSession();
        if (restored) {
            this.notificationService.showInformation('Previous session restored');
        }
    }

    private async startConductor(): Promise<void> {
        await vscode.commands.executeCommand('nofx.quickStartTeam');
    }

    private async openConductorTerminal(): Promise<void> {
        // Implementation handled by conductor service
        this.logger.info('Opening conductor terminal');
    }

    private async quickStart(): Promise<void> {
        // Quick start workflow
        await this.agentManager.quickStart();
    }

    private async openMessageFlow(): Promise<void> {
        await vscode.commands.executeCommand('nofx.showDashboard');
    }
}
