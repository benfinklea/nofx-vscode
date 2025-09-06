import * as vscode from 'vscode';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    ILoggingService,
    IConductorViewModel,
    SERVICE_TOKENS
} from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { ConductorChat } from '../conductor/ConductorChat';
import { ConductorChatWebview } from '../conductor/ConductorChatWebview';
import { ConductorTerminal } from '../conductor/ConductorTerminal';
import { IntelligentConductor } from '../conductor/IntelligentConductor';
import { SuperSmartConductor } from '../conductor/SuperSmartConductor';
import { AgentTemplateManager } from '../agents/AgentTemplateManager';
import { AgentTreeProvider } from '../views/AgentTreeProvider';
import { ConductorPanel } from '../panels/ConductorPanel';

interface TeamPreset {
    value: string;
    agents: string[];
}

export class ConductorCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly loggingService: ILoggingService;
    private readonly context: vscode.ExtensionContext;
    private readonly container: IContainer;

    private conductorChat?: ConductorChat;
    private conductorWebview?: ConductorChatWebview;
    private conductorTerminal?: ConductorTerminal | SuperSmartConductor | IntelligentConductor;
    private currentTeamName: string = 'Active Agents';
    private agentProvider?: AgentTreeProvider;

    constructor(container: IContainer) {
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve<TaskQueue>(SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
        this.context = container.resolve<vscode.ExtensionContext>(SERVICE_TOKENS.ExtensionContext);
        this.container = container;
    }

    setAgentProvider(provider: AgentTreeProvider): void {
        this.agentProvider = provider;
    }

    register(): void {
        this.commandService.register('nofx.startConductor', this.startConductor.bind(this));
        this.commandService.register('nofx.quickStartChat', this.quickStartChat.bind(this));
        this.commandService.register('nofx.openConductorChat', this.openConductorChat.bind(this));
        this.commandService.register('nofx.openConductorTerminal', this.openConductorTerminal.bind(this));
        this.commandService.register('nofx.openSimpleConductor', this.openConductorChat.bind(this));
        this.commandService.register('nofx.openConductorPanel', this.openConductorPanel.bind(this));
    }

    private async startConductor(): Promise<void> {
        // Show team preset selection
        const presets: PickItem<TeamPreset>[] = [
            {
                label: '$(rocket) Full-Stack Development Team',
                description: 'Frontend, Backend, Database, and DevOps specialists',
                value: {
                    value: 'fullstack',
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                }
            },
            {
                label: '$(beaker) Testing & Quality Team',
                description: 'Test Engineer, Security Expert, and Performance Specialist',
                value: {
                    value: 'testing',
                    agents: ['testing-specialist', 'security-expert', 'backend-specialist']
                }
            },
            {
                label: '$(device-mobile) Mobile Development Team',
                description: 'iOS, Android, and Backend API developers',
                value: {
                    value: 'mobile',
                    agents: ['mobile-developer', 'backend-specialist', 'testing-specialist']
                }
            },
            {
                label: '$(circuit-board) AI/ML Team',
                description: 'ML Engineer, Data Scientist, and Backend Developer',
                value: {
                    value: 'ai-ml',
                    agents: ['ai-ml-specialist', 'backend-specialist', 'database-architect']
                }
            },
            {
                label: '$(dashboard) Startup MVP Team',
                description: 'Fullstack Developer and DevOps for rapid prototyping',
                value: {
                    value: 'startup',
                    agents: ['fullstack-developer', 'devops-engineer']
                }
            },
            {
                label: '$(person) Custom Team',
                description: 'Select your own combination of agents',
                value: {
                    value: 'custom',
                    agents: []
                }
            }
        ];

        const selected = await this.notificationService.showQuickPick(presets, {
            placeHolder: 'Select a team configuration'
        });

        if (!selected) {
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        const preset = selected.value;

        // Update team name based on selection
        this.currentTeamName = selected.label.replace(/\$\([^)]*\)\s*/g, ''); // Remove icon

        // Update agent tree provider with new team name
        if (this.agentProvider && typeof this.agentProvider.setTeamName === 'function') {
            this.agentProvider.setTeamName(this.currentTeamName);
        }

        if (preset.value === 'custom') {
            // Let user manually add agents
            await this.commandService.execute('nofx.addAgent');
        } else {
            // Create the team
            const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
            const teamAgents = preset.agents;

            // Create agents (AgentManager handles worktrees internally)
            let createdCount = 0;
            for (const templateId of teamAgents) {
                const template = await templateManager.getTemplate(templateId);
                if (template) {
                    try {
                        await this.agentManager.spawnAgent({
                            name: template.name,
                            type: template.id ?? 'general',
                            template
                        });
                        createdCount++;
                    } catch (error) {
                        this.loggingService?.error(`Failed to create agent from template ${templateId}:`, error);
                    }
                }
            }

            const message = createdCount === teamAgents.length
                ? `Team "${this.currentTeamName}" created with ${createdCount} agents`
                : `Team "${this.currentTeamName}" created with ${createdCount} of ${teamAgents.length} agents (${teamAgents.length - createdCount} failed)`;
            await this.notificationService.showInformation(message);
        }

        // Open conductor terminal
        await this.openConductorTerminal();
    }

    private async quickStartChat(): Promise<void> {
        const projectTypes: PickItem<{ value: string; teamPreset: string; teamName: string; agents: string[] }>[] = [
            {
                label: '$(globe) Web Application',
                description: 'React, Vue, Angular, or vanilla JS',
                value: {
                    value: 'web',
                    teamPreset: 'frontend',
                    teamName: 'Frontend Team',
                    agents: ['frontend-specialist', 'testing-specialist']
                }
            },
            {
                label: '$(server) Backend API',
                description: 'Node.js, Python, Java, or Go',
                value: {
                    value: 'backend',
                    teamPreset: 'backend',
                    teamName: 'Backend Team',
                    agents: ['backend-specialist', 'database-architect']
                }
            },
            {
                label: '$(device-mobile) Mobile App',
                description: 'React Native, Flutter, or native',
                value: {
                    value: 'mobile',
                    teamPreset: 'mobile',
                    teamName: 'Mobile Team',
                    agents: ['mobile-developer', 'backend-specialist', 'testing-specialist']
                }
            },
            {
                label: '$(package) Full-Stack Application',
                description: 'Complete frontend and backend',
                value: {
                    value: 'fullstack',
                    teamPreset: 'fullstack',
                    teamName: 'Full-Stack Team',
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                }
            },
            {
                label: '$(library) Library/Package',
                description: 'Reusable component or module',
                value: {
                    value: 'library',
                    teamPreset: 'library',
                    teamName: 'Library Team',
                    agents: ['fullstack-developer', 'testing-specialist']
                }
            }
        ];

        const projectType = await this.notificationService.showQuickPick(projectTypes, {
            placeHolder: 'What type of project are you working on?'
        });

        if (!projectType) {
            return;
        }

        // Auto-select team based on project type
        const projectConfig = projectType.value;

        // Update current team name
        this.currentTeamName = projectConfig.teamName;
        if (this.agentProvider && typeof this.agentProvider.setTeamName === 'function') {
            this.agentProvider.setTeamName(this.currentTeamName);
        }

        // Create agents
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);

        let createdCount = 0;
        for (const templateId of projectConfig.agents) {
            const template = await templateManager.getTemplate(templateId);
            if (template) {
                try {
                    await this.agentManager.spawnAgent({
                        name: template.name,
                        type: template.id ?? 'general',
                        template
                    });
                    createdCount++;
                } catch (error) {
                    this.loggingService?.error(`Failed to create agent from template ${templateId}:`, error);
                }
            }
        }

        // Open conductor terminal automatically
        await this.openConductorTerminal();

        const assemblyMessage = createdCount === projectConfig.agents.length
            ? `${projectConfig.teamName} assembled (${createdCount} agents)! Conductor terminal is ready.`
            : `${projectConfig.teamName} partially assembled (${createdCount} of ${projectConfig.agents.length} agents)! Conductor terminal is ready.`;
        await this.notificationService.showInformation(assemblyMessage);
    }

    private async openConductorChat(): Promise<void> {
        if (!this.conductorWebview) {
            const loggingService = this.container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
            const notificationService = this.container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
            this.conductorWebview = new ConductorChatWebview(
                this.context,
                this.agentManager,
                this.taskQueue,
                loggingService,
                notificationService
            );
        }
        await this.conductorWebview.show();
    }

    private async openConductorTerminal(): Promise<void> {
        // Determine which conductor to use based on team size or configuration
        const activeAgents = this.agentManager.getActiveAgents();
        const agentCount = activeAgents.length;

        if (agentCount === 0) {
            await this.notificationService.showWarning('No agents available. Please add agents first.');
            return;
        }

        // Select conductor based on team complexity
        let conductorType: 'basic' | 'intelligent' | 'supersmart' = 'basic';

        if (agentCount >= 5) {
            // Large team - use SuperSmartConductor
            conductorType = 'supersmart';
        } else if (agentCount >= 3) {
            // Medium team - use IntelligentConductor
            conductorType = 'intelligent';
        } else {
            // Small team - use ConductorTerminal
            conductorType = 'basic';
        }

        // Create appropriate conductor instance using factory method
        this.conductorTerminal = this.createConductor(conductorType);

        await this.conductorTerminal?.start();

        await this.notificationService.showInformation(
            `${this.currentTeamName} conductor started (${conductorType} mode)`
        );
    }

    /**
     * Factory method to create conductor instances - allows for clean testing
     */
    public createConductor(type: 'basic' | 'intelligent' | 'supersmart'): ConductorTerminal | IntelligentConductor | SuperSmartConductor {
        switch (type) {
            case 'supersmart':
                return new SuperSmartConductor(this.agentManager, this.taskQueue);
            case 'intelligent':
                return new IntelligentConductor(this.agentManager, this.taskQueue);
            default:
                return new ConductorTerminal(this.agentManager, this.taskQueue);
        }
    }

    private async openConductorPanel(): Promise<void> {
        try {
            const viewModel = this.container.resolve<IConductorViewModel>(SERVICE_TOKENS.ConductorViewModel);
            const loggingService = this.container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);

            ConductorPanel.createOrShow(this.context, viewModel, loggingService);

            await this.notificationService.showInformation('Conductor Panel opened');
        } catch (error) {
            this.notificationService.showError('Failed to open Conductor Panel');
        }
    }

    dispose(): void {
        this.conductorChat?.dispose();
        this.conductorWebview = undefined;
        this.conductorTerminal = undefined;
        // Command disposal handled by CommandService
    }
}
