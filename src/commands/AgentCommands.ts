import * as vscode from 'vscode';
import { ICommandHandler, ICommandService, INotificationService, IConfiguration } from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { ServiceLocator } from '../services/ServiceLocator';

export class AgentCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfiguration;
    private readonly context: vscode.ExtensionContext;

    constructor() {
        this.agentManager = ServiceLocator.get<AgentManager>('AgentManager');
        this.commandService = ServiceLocator.get<ICommandService>('CommandService');
        this.notificationService = ServiceLocator.get<INotificationService>('NotificationService');
        this.configService = ServiceLocator.get<IConfiguration>('ConfigurationService');
        this.context = ServiceLocator.get<vscode.ExtensionContext>('ExtensionContext');
    }

    register(): void {
        // Register all agent-related commands
        this.commandService.register('nofx.addAgent', this.addAgent.bind(this));
        this.commandService.register('nofx.deleteAgent', this.deleteAgent.bind(this));
        this.commandService.register('nofx.editAgent', this.editAgent.bind(this));
        this.commandService.register('nofx.focusAgentTerminal', this.focusAgentTerminal.bind(this));
        this.commandService.register('nofx.restoreAgents', this.restoreAgents.bind(this));
        this.commandService.register('nofx.restoreAgentFromSession', this.restoreAgentFromSession.bind(this));
        this.commandService.register('nofx.clearAgents', this.clearAgents.bind(this));
        this.commandService.register(
            'nofx.createAgentFromNaturalLanguage',
            this.createAgentFromNaturalLanguage.bind(this)
        );
    }

    private async addAgent(): Promise<void> {
        console.log('[NofX Debug] addAgent called');

        try {
            vscode.window.showInformationMessage('NofX: Opening agent selection...');
        } catch (error) {
            console.error('[NofX Debug] Error showing info message:', error);
        }

        // Show selection between individual agent and team preset
        const addType = await this.notificationService.showQuickPick<PickItem<string>>(
            [
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
            ],
            {
                placeHolder: 'How would you like to add agents?'
            }
        );

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
        console.log('[NofX Debug] addIndividualAgent() called');
        vscode.window.showInformationMessage('[NofX] addIndividualAgent() called');

        try {
            // Import template manager
            console.log('[NofX Debug] Importing AgentTemplateManager...');
            const { AgentTemplateManager } = await import('../agents/AgentTemplateManager');
            console.log('[NofX Debug] AgentTemplateManager imported successfully');

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                await this.notificationService.showError('No workspace folder open');
                return;
            }

            console.log('[NofX Debug] Creating AgentTemplateManager...');
            const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
            console.log('[NofX Debug] AgentTemplateManager created, getting templates...');
            const templates = await templateManager.getTemplates();
            console.log('[NofX Debug] Got templates:', {
                count: templates.length,
                ids: templates.map(t => t.id),
                backendSpecialistExists: templates.some(t => t.id === 'backend-specialist')
            });

            // Check the backend-specialist template specifically
            const backendTemplate = templates.find(t => t.id === 'backend-specialist');
            if (backendTemplate) {
                console.log('[NofX Debug] Backend template details:', {
                    hasSystemPrompt: !!backendTemplate.systemPrompt,
                    hasDetailedPrompt: !!backendTemplate.detailedPrompt,
                    systemPromptLength: backendTemplate.systemPrompt?.length || 0,
                    detailedPromptLength: backendTemplate.detailedPrompt?.length || 0,
                    keys: Object.keys(backendTemplate)
                });
            }

            const items: PickItem<string>[] = templates.map(template => ({
                label: `${template.icon} ${template.name}`,
                description: Array.isArray(template.capabilities)
                    ? template.capabilities.slice(0, 3).join(', ')
                    : 'Custom agent',
                value: template.id
            }));

            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select an agent template'
            });

            if (!selected) {
                return;
            }

            const templateId = selected.value;
            console.log('[NofX Debug] Selected template ID:', templateId);

            const template = templates.find(t => t.id === templateId);
            console.log('[NofX Debug] Found template:', {
                found: !!template,
                hasSystemPrompt: !!template?.systemPrompt,
                hasDetailedPrompt: !!template?.detailedPrompt,
                systemPromptLength: template?.systemPrompt?.length || 0,
                detailedPromptLength: template?.detailedPrompt?.length || 0
            });

            if (!template) {
                vscode.window.showErrorMessage('[NofX] Template not found!');
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
        } catch (error) {
            console.error('[NofX Debug] Error in addIndividualAgent:', error);
            vscode.window.showErrorMessage(
                `[NofX] Error in addIndividualAgent: ${error instanceof Error ? error.message : String(error)}`
            );
            throw error;
        }
    }

    private async addTeamPreset(): Promise<void> {
        const presets: PickItem<{ agents: string[]; label: string }>[] = [
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
                    // Error handling is done by the notification service in the calling context
                }
            }
        }

        const message =
            createdCount === teamAgents.length
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
            'Delete agent? This will terminate their terminal.',
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
                    await this.notificationService.showWarning(
                        'Capabilities are defined by the agent template and cannot be directly edited.'
                    );
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

    private async restoreAgentFromSession(session: any): Promise<void> {
        if (!session) {
            await this.notificationService.showError('No session data provided');
            return;
        }

        try {
            // Restore agent with context from session
            await this.agentManager.spawnAgent({
                name: session.agentName,
                type: session.agentType,
                template: session.template,
                context: {
                    sessionId: session.id,
                    conversationHistory: session.conversationHistory,
                    workingDirectory: session.workingDirectory,
                    gitBranch: session.gitBranch,
                    currentTask: session.currentTask,
                    completedTasks: session.completedTasks
                }
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            await this.notificationService.showError(`Failed to restore agent from session: ${err.message}`);
        }
    }

    private async clearAgents(): Promise<void> {
        const agents = this.agentManager.getActiveAgents();
        if (agents.length === 0) {
            await this.notificationService.showInformation('No agents to clear');
            return;
        }

        const confirmed = await this.notificationService.confirmDestructive(
            `Clear all ${agents.length} agents? This will terminate all agent terminals.`,
            'Clear All'
        );

        if (confirmed) {
            // Remove all agents
            for (const agent of agents) {
                await this.agentManager.removeAgent(agent.id);
            }
            await this.notificationService.showInformation(`Cleared ${agents.length} agents`);
        }
    }

    private async createAgentFromNaturalLanguage(): Promise<void> {
        // Get natural language description from user
        const description = await this.notificationService.showInputBox({
            prompt: 'Describe the agent you want to create',
            placeHolder: 'e.g., "I need a Python expert who can write unit tests and handle API integrations"',
            validateInput: (value: string): string | undefined => {
                if (!value || value.trim().length < 10) {
                    return 'Please provide a more detailed description (at least 10 characters)';
                }
                return undefined;
            }
        });

        if (!description) {
            return;
        }

        try {
            // Import NaturalLanguageService
            const { NaturalLanguageService } = await import('../services/NaturalLanguageService');
            const nlService = new NaturalLanguageService();

            // Parse the description to determine agent type and capabilities
            const agentConfig = await nlService.parseAgentDescription(description);

            if (!agentConfig) {
                await this.notificationService.showError(
                    'Could not understand the agent description. Please try again.'
                );
                return;
            }

            // Import template manager to find best matching template
            const { AgentTemplateManager } = await import('../agents/AgentTemplateManager');
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                await this.notificationService.showError('No workspace folder open');
                return;
            }

            const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
            const templates = await templateManager.getTemplates();

            // Find best matching template based on capabilities
            let bestTemplate = templates[0]; // Default to first template
            let bestScore = 0;

            for (const template of templates) {
                const capabilities = template.capabilities || [];
                let score = 0;

                // Calculate match score based on overlapping capabilities
                for (const cap of agentConfig.capabilities || []) {
                    if (capabilities.some(c => c.toLowerCase().includes(cap.toLowerCase()))) {
                        score++;
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestTemplate = template;
                }
            }

            // Get agent name
            const agentName = await this.notificationService.showInputBox({
                prompt: 'Enter a name for your agent',
                value: agentConfig.suggestedName || bestTemplate.name,
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

            // Create the agent with custom system prompt
            const customPrompt = `${bestTemplate.systemPrompt}\n\nAdditional context from user: ${description}`;

            const agent = await this.agentManager.spawnAgent({
                name: agentName,
                type: bestTemplate.id ?? 'general',
                template: {
                    ...bestTemplate,
                    systemPrompt: customPrompt
                }
            });

            await this.notificationService.showInformation(`Agent "${agentName}" created from your description`);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            await this.notificationService.showError(`Failed to create agent: ${err.message}`);
        }
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}
