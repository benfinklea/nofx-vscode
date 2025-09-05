import * as vscode from 'vscode';
import { 
    ICommandHandler, 
    IContainer, 
    ICommandService, 
    INotificationService, 
    IConfigurationService,
    SERVICE_TOKENS 
} from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

export class AgentCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly context: vscode.ExtensionContext;

    constructor(container: IContainer) {
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve<TaskQueue>(SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.context = container.resolve<vscode.ExtensionContext>(SERVICE_TOKENS.ExtensionContext);
    }

    register(): void {
        // Register all agent-related commands
        this.commandService.register('nofx.addAgent', this.addAgent.bind(this));
        this.commandService.register('nofx.deleteAgent', this.deleteAgent.bind(this));
        this.commandService.register('nofx.editAgent', this.editAgent.bind(this));
        this.commandService.register('nofx.focusAgentTerminal', this.focusAgentTerminal.bind(this));
        this.commandService.register('nofx.restoreAgents', this.restoreAgents.bind(this));
    }

    private async addAgent(): Promise<void> {
        // Show selection between individual agent and team preset
        const addType = await this.notificationService.showQuickPick<PickItem<string>>([
            {
                label: '$(person) Individual Agent',
                description: 'Add a single agent with specific capabilities',
                value: 'individual'
            },
            {
                label: '$(organization) Team Preset',
                description: 'Add a pre-configured team of agents',
                value: 'team'
            }
        ], {
            placeHolder: 'How would you like to add agents?'
        });

        if (!addType) {
            return;
        }

        const teamValue = addType.value;
        if (teamValue === 'team') {
            await this.addTeamPreset();
        } else {
            await this.addIndividualAgent();
        }
    }

    private async addIndividualAgent(): Promise<void> {
        // Import template manager
        const { AgentTemplateManager } = await import('../agents/AgentTemplateManager');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        const templates = await templateManager.getTemplates();

        const items: PickItem<string>[] = templates.map(template => ({
            label: `${template.icon} ${template.name}`,
            description: Array.isArray(template.capabilities) ? template.capabilities.slice(0, 3).join(', ') : 'Custom agent',
            value: template.id
        }));

        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select an agent template'
        });

        if (!selected) {
            return;
        }

        const templateId = selected.value;
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            return;
        }

        // Get agent name
        const agentName = await this.notificationService.showInputBox({
            prompt: 'Enter agent name',
            value: template.name,
            validateInput: (value: string): string | undefined => {
                if (!value || value.trim().length === 0) {
                    return 'Agent name is required';
                }
                return undefined;
            }
        });

        if (!agentName) {
            return;
        }

        // Create the agent (AgentManager handles worktrees internally)
        const agent = await this.agentManager.spawnAgent({
            name: agentName,
            type: template?.id ?? 'general',
            template
        });
        await this.notificationService.showInformation(`Agent "${agentName}" created successfully`);
    }

    private async addTeamPreset(): Promise<void> {
        const presets: PickItem<{ agents: string[], label: string }>[] = [
            {
                label: '$(rocket) Full-Stack Development Team',
                description: 'Frontend, Backend, Database, and DevOps specialists',
                value: { 
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer'],
                    label: '$(rocket) Full-Stack Development Team'
                }
            },
            {
                label: '$(beaker) Testing & Quality Team',
                description: 'Test Engineer, Security Expert, and Performance Specialist',
                value: { 
                    agents: ['testing-specialist', 'security-expert', 'backend-specialist'],
                    label: '$(beaker) Testing & Quality Team'
                }
            },
            {
                label: '$(device-mobile) Mobile Development Team',
                description: 'iOS, Android, and Backend API developers',
                value: { 
                    agents: ['mobile-developer', 'backend-specialist', 'testing-specialist'],
                    label: '$(device-mobile) Mobile Development Team'
                }
            },
            {
                label: '$(circuit-board) AI/ML Team',
                description: 'ML Engineer, Data Scientist, and Backend Developer',
                value: { 
                    agents: ['ai-ml-specialist', 'backend-specialist', 'database-architect'],
                    label: '$(circuit-board) AI/ML Team'
                }
            },
            {
                label: '$(dashboard) Startup MVP Team',
                description: 'Fullstack Developer and DevOps for rapid prototyping',
                value: { 
                    agents: ['fullstack-developer', 'devops-engineer'],
                    label: '$(dashboard) Startup MVP Team'
                }
            }
        ];

        const selected = await this.notificationService.showQuickPick(presets, {
            placeHolder: 'Select a team preset'
        });

        if (!selected) {
            return;
        }

        // Import required modules
        const { AgentTemplateManager } = await import('../agents/AgentTemplateManager');
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        const preset = selected.value;
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
                    console.error(`Failed to create agent from template ${templateId}:`, error);
                }
            }
        }

        const message = createdCount === teamAgents.length 
            ? `Team "${preset.label}" created with ${createdCount} agents`
            : `Team "${preset.label}" created with ${createdCount} of ${teamAgents.length} agents (${teamAgents.length - createdCount} failed)`;
        await this.notificationService.showInformation(message);

        // Open conductor terminal using centralized logic
        await this.commandService.execute('nofx.openConductorTerminal');
    }

    private async deleteAgent(agentId?: string): Promise<void> {
        if (!agentId) {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                await this.notificationService.showInformation('No agents to delete');
                return;
            }

            const items: PickItem<string>[] = agents.map(a => ({
                label: `${a.name} (${a.status})`,
                description: a.type,
                value: a.id
            }));

            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select agent to delete'
            });

            if (!selected) {
                return;
            }

            agentId = selected.value;
        }

        const confirmed = await this.notificationService.confirmDestructive(
            `Delete agent? This will terminate their terminal.`,
            'Delete'
        );

        if (confirmed) {
            await this.agentManager.removeAgent(agentId);
            await this.notificationService.showInformation('Agent deleted');
        }
    }

    private async editAgent(agentId?: string): Promise<void> {
        if (!agentId) {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                await this.notificationService.showInformation('No agents to edit');
                return;
            }

            const items: PickItem<string>[] = agents.map(a => ({
                label: a.name,
                description: a.type,
                value: a.id
            }));

            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select agent to edit'
            });

            if (!selected) {
                return;
            }

            agentId = selected.value;
        }

        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            await this.notificationService.showError('Agent not found');
            return;
        }

        // Show edit options
        const options: PickItem<string>[] = [
            { label: 'Change Name', value: 'name' },
            { label: 'Change Role', value: 'role' },
            { label: 'Update Capabilities', value: 'capabilities' }
        ];

        const action = await this.notificationService.showQuickPick(options, {
            placeHolder: 'What would you like to edit?'
        });

        if (!action) {
            return;
        }

        const actionValue = action.value;

        switch (actionValue) {
            case 'name':
                const newName = await this.notificationService.showInputBox({
                    prompt: 'Enter new name',
                    value: agent.name
                });
                if (newName) {
                    this.agentManager.renameAgent(agent.id, newName);
                }
                break;

            case 'role':
                const newRole = await this.notificationService.showInputBox({
                    prompt: 'Enter new role',
                    value: agent.type
                });
                if (newRole) {
                    // Note: role is not a direct property of Agent, update type instead
                    this.agentManager.updateAgentType(agent.id, newRole);
                }
                break;

            case 'capabilities':
                const currentCaps = (agent.template?.capabilities ?? []).join(', ');
                const newCaps = await this.notificationService.showInputBox({
                    prompt: 'Enter capabilities (comma-separated)',
                    value: currentCaps
                });
                if (newCaps) {
                    // Note: capabilities are part of the template, not directly editable
                    // Would need to update template or extend Agent interface
                    await this.notificationService.showWarning('Capabilities are defined by the agent template and cannot be directly edited.');
                }
                break;
        }
    }

    private async focusAgentTerminal(agentId?: string): Promise<void> {
        if (!agentId) {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                await this.notificationService.showInformation('No active agents');
                return;
            }

            if (agents.length === 1) {
                agentId = agents[0].id;
            } else {
                const items: PickItem<string>[] = agents.map(a => ({
                    label: a.name,
                    description: a.status,
                    value: a.id
                }));

                const selected = await this.notificationService.showQuickPick(items, {
                    placeHolder: 'Select agent terminal to focus'
                });

                if (!selected) {
                    return;
                }

                agentId = selected.value;
            }
        }

        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            await this.notificationService.showError('Agent not found');
            return;
        }

        if (agent.terminal) {
            agent.terminal.show();
        } else {
            await this.notificationService.showWarning('Agent terminal not available');
        }
    }

    private async restoreAgents(): Promise<void> {
        const restoredCount = await this.agentManager.restoreAgents();
        await this.notificationService.showInformation(
            restoredCount > 0 ? `Restored ${restoredCount} agents` : 'No agents to restore'
        );
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}