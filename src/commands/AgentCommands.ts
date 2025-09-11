import * as vscode from 'vscode';
import { ICommandHandler, ICommandService, INotificationService, IConfiguration } from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { ServiceLocator } from '../services/ServiceLocator';
import { NofxAgentFactory, CoreAgentType, AgentSpecialization } from '../agents/NofxAgentFactory';

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
        this.commandService.register('nofx.createCustomAgent', this.createCustomAgent.bind(this));
        this.commandService.register('nofx.deleteAgent', this.deleteAgent.bind(this));
        this.commandService.register('nofx.editAgent', this.editAgent.bind(this));
        this.commandService.register('nofx.focusAgentTerminal', this.focusAgentTerminal.bind(this));
        this.commandService.register('nofx.restoreAgents', this.restoreAgents.bind(this));
        this.commandService.register('nofx.restoreAgentFromSession', this.restoreAgentFromSession.bind(this));
        this.commandService.register('nofx.saveAgents', this.saveAgents.bind(this));
        this.commandService.register('nofx.refreshTerminalIcons', this.refreshTerminalIcons.bind(this));
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
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                await this.notificationService.showError('No workspace folder open');
                return;
            }

            // Use unified NofxAgentFactory
            const factory = NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath);
            
            // Get core agent types
            const coreTypes = factory.getCoreAgentTypes();
            console.log('[NofX Debug] Got core agent types:', {
                count: coreTypes.length,
                types: coreTypes.map(t => t.id)
            });

            // Load legacy templates for backward compatibility
            const legacyTemplates = await factory.loadLegacyTemplates();
            
            // Combine core types and legacy templates
            const allOptions: PickItem<{type: 'core' | 'legacy', id: string}>[] = [
                // Core agent types
                ...coreTypes.map(coreType => ({
                    label: `🎯 ${coreType.icon} ${coreType.name}`,
                    description: `Modern ${coreType.name} with ${coreType.coreSkills.slice(0, 3).join(', ')}`,
                    value: { type: 'core' as const, id: coreType.id }
                })),
                // Legacy templates (if any)
                ...legacyTemplates.map(template => ({
                    label: `📄 ${template.icon || '⚡'} ${template.name}`,
                    description: `Legacy: ${Array.isArray(template.capabilities) 
                        ? template.capabilities.slice(0, 3).join(', ')
                        : 'Custom agent'}`,
                    value: { type: 'legacy' as const, id: template.id }
                }))
            ];

            const selected = await this.notificationService.showQuickPick(allOptions, {
                placeHolder: 'Select an agent type'
            });

            if (!selected) {
                return;
            }

            const selection = selected.value;
            console.log('[NofX Debug] Selected:', selection);

            let template: any;
            
            if (selection.type === 'core') {
                // Handle core agent type
                const coreType = factory.getCoreAgentType(selection.id);
                if (!coreType) {
                    await this.notificationService.showError('Core agent type not found');
                    return;
                }

                // Show specialization options
                const specializations = factory.getSpecializations(selection.id);
                let selectedSpecialization: AgentSpecialization | undefined;
                
                if (specializations.length > 0) {
                    const specOptions: PickItem<string>[] = [
                        { label: `🎯 General ${coreType.name}`, description: 'Use base configuration', value: 'none' },
                        ...specializations.map(spec => ({
                            label: `⭐ ${spec.name}`,
                            description: spec.description,
                            value: spec.id
                        }))
                    ];

                    const specSelection = await this.notificationService.showQuickPick(specOptions, {
                        placeHolder: 'Choose specialization'
                    });

                    if (!specSelection) return;
                    
                    if (specSelection.value !== 'none') {
                        selectedSpecialization = specializations.find(s => s.id === specSelection.value);
                    }
                }

                // Get agent name
                const defaultName = selectedSpecialization ? selectedSpecialization.name : coreType.name;
                const agentName = await this.notificationService.showInputBox({
                    prompt: 'Enter agent name',
                    value: defaultName,
                    validateInput: (value: string): string | undefined => {
                        if (!value || value.trim().length === 0) {
                            return 'Agent name is required';
                        }
                        return undefined;
                    }
                });

                if (!agentName) return;

                // Generate template using factory
                template = factory.createAgent({
                    coreType: selection.id,
                    specialization: selectedSpecialization?.id,
                    customName: agentName
                });

            } else {
                // Handle legacy template
                const legacyTemplate = legacyTemplates.find(t => t.id === selection.id);
                if (!legacyTemplate) {
                    await this.notificationService.showError('Legacy template not found');
                    return;
                }

                const agentName = await this.notificationService.showInputBox({
                    prompt: 'Enter agent name',
                    value: legacyTemplate.name,
                    validateInput: (value: string): string | undefined => {
                        if (!value || value.trim().length === 0) {
                            return 'Agent name is required';
                        }
                        return undefined;
                    }
                });

                if (!agentName) return;
                
                template = { ...legacyTemplate, name: agentName };
            }

            console.log('[NofX Debug] Generated template:', {
                name: template.name,
                hasSystemPrompt: !!template.systemPrompt,
                systemPromptLength: template.systemPrompt?.length || 0
            });

            // Create the agent (AgentManager handles worktrees internally)
            const agent = await this.agentManager.spawnAgent({
                name: template.name,
                type: template.id,
                template
            });
            await this.notificationService.showInformation(`Agent "${template.name}" created successfully`);
            
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

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        // Use unified NofxAgentFactory
        const factory = NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath);
        const preset = selected.value;
        const teamAgents = preset.agents;

        // Create agents using factory
        let createdCount = 0;
        for (const templateId of teamAgents) {
            try {
                // Try to create using core agent types first
                const coreType = factory.getCoreAgentType(templateId);
                let template: any;
                
                if (coreType) {
                    // Use core agent type
                    template = factory.createAgent({
                        coreType: templateId,
                        customName: coreType.name
                    });
                } else {
                    // Fall back to legacy templates
                    const legacyTemplates = await factory.loadLegacyTemplates();
                    const legacyTemplate = legacyTemplates.find(t => t.id === templateId);
                    if (legacyTemplate) {
                        template = legacyTemplate;
                    }
                }

                if (template) {
                    await this.agentManager.spawnAgent({
                        name: template.name,
                        type: template.id,
                        template
                    });
                    createdCount++;
                }
            } catch (error) {
                console.warn(`Failed to create agent ${templateId}:`, error);
                // Continue with other agents
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

    private async saveAgents(): Promise<void> {
        try {
            const agents = this.agentManager.getActiveAgents();
            console.log(`[AgentCommands] Manual save requested for ${agents.length} agents`);
            
            if (agents.length === 0) {
                await this.notificationService.showInformation('No agents to save');
                return;
            }

            // Trigger the agent manager's save functionality
            await this.agentManager.saveAgentState();
            await this.notificationService.showInformation(
                `✅ Saved ${agents.length} agent${agents.length === 1 ? '' : 's'} to .nofx/agents.json`
            );
            console.log(`[AgentCommands] Successfully saved ${agents.length} agents`);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('[AgentCommands] Failed to save agents:', error);
            await this.notificationService.showError(`Failed to save agents: ${err.message}`);
        }
    }

    private async refreshTerminalIcons(): Promise<void> {
        try {
            console.log('[AgentCommands] Refreshing terminal icons to remove warning triangles');
            
            // Get the terminal manager from service locator
            const terminalManager = ServiceLocator.tryGet('TerminalManager') as any;
            
            if (!terminalManager || typeof terminalManager.refreshAllExitedTerminalIcons !== 'function') {
                await this.notificationService.showWarning('Terminal icon refresh not available');
                return;
            }

            // Refresh all exited terminal icons
            terminalManager.refreshAllExitedTerminalIcons();
            
            await this.notificationService.showInformation('✨ Terminal icons refreshed - warning triangles removed!');
            console.log('[AgentCommands] Terminal icon refresh completed');
            
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('[AgentCommands] Failed to refresh terminal icons:', error);
            await this.notificationService.showError(`Failed to refresh terminal icons: ${err.message}`);
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

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                await this.notificationService.showError('No workspace folder open');
                return;
            }

            // Use unified NofxAgentFactory for natural language processing
            const factory = NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath);
            
            // Create agent from natural language description
            const template = await factory.createAgentFromDescription(description);

            // Get agent name
            const agentName = await this.notificationService.showInputBox({
                prompt: 'Enter a name for your agent',
                value: agentConfig.suggestedName || template.name,
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

            // Update template with custom name
            template.name = agentName;

            const agent = await this.agentManager.spawnAgent({
                name: agentName,
                type: template.id,
                template
            });

            await this.notificationService.showInformation(`Agent "${agentName}" created from your description`);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            await this.notificationService.showError(`Failed to create agent: ${err.message}`);
        }
    }

    private async createCustomAgent(): Promise<void> {
        try {
            console.log('[NofX Debug] createCustomAgent called');

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                await this.notificationService.showError('No workspace folder open');
                return;
            }

            // Use unified NofxAgentFactory
            const factory = NofxAgentFactory.getInstance(workspaceFolder.uri.fsPath);

            // Step 1: Select core agent type
            const coreAgents = factory.getCoreAgentTypes();
            const coreAgentItems: PickItem<string>[] = coreAgents.map(agent => ({
                label: `${agent.icon} ${agent.name}`,
                description: `${agent.primaryDomains.join(', ')} specialist`,
                value: agent.id
            }));

            const selectedCore = await this.notificationService.showQuickPick(coreAgentItems, {
                title: 'Select Core Agent Type',
                placeHolder: 'Choose the base type for your custom agent'
            });

            if (!selectedCore) return;

            // Step 2: Get agent name
            const agentName = await this.notificationService.showInputBox({
                prompt: 'Enter agent name',
                placeHolder: 'e.g., React UI Specialist, API Development Expert',
            });

            if (!agentName) return;

            // Step 3: Select specialization (optional)
            const specializations = factory.getSpecializations(selectedCore.value);
            let selectedSpecialization: AgentSpecialization | undefined;
            
            if (specializations.length > 0) {
                const specItems: PickItem<string>[] = [
                    { label: '$(settings) Custom Specialization', value: 'custom', description: 'Define your own specialization' },
                    { label: '$(star) General', value: 'none', description: 'Use base configuration without specialization' },
                    ...specializations.map(spec => ({
                        label: `$(star) ${spec.name}`,
                        value: spec.id,
                        description: spec.description
                    }))
                ];

                const selectedSpec = await this.notificationService.showQuickPick(specItems, {
                    title: 'Choose Specialization',
                    placeHolder: 'Select a specialization or create custom'
                });

                if (!selectedSpec) return;

                if (selectedSpec.value === 'custom') {
                    // Custom specialization flow - simplified for now
                    const projectContext = await this.notificationService.showInputBox({
                        prompt: 'Project context (optional)',
                        placeHolder: 'e.g., Working on VS Code extension with TypeScript',
                    });

                    const customInstructions = await this.notificationService.showInputBox({
                        prompt: 'Custom instructions (optional)',
                        placeHolder: 'e.g., Focus on testing React components with Jest',
                    });

                    // Create agent with custom configuration
                    const template = factory.createAgent({
                        coreType: selectedCore.value,
                        customName: agentName,
                        projectContext: projectContext || undefined,
                        customInstructions: customInstructions || undefined
                    });

                    const agent = await this.agentManager.spawnAgent({
                        name: agentName,
                        type: template.id,
                        template
                    });

                    await this.notificationService.showInformation(
                        `✅ Custom agent "${agentName}" created successfully!`
                    );
                    return;
                } else if (selectedSpec.value !== 'none') {
                    selectedSpecialization = specializations.find(s => s.id === selectedSpec.value);
                }
            }

            // Step 4: Generate the agent template
            const template = factory.createAgent({
                coreType: selectedCore.value,
                specialization: selectedSpecialization?.id,
                customName: agentName
            });

            console.log('[NofX Debug] Generated agent template:', {
                name: template.name,
                systemPromptLength: template.systemPrompt.length,
                specialization: selectedSpecialization?.name
            });

            // Step 5: Create the agent
            const agent = await this.agentManager.spawnAgent({
                name: agentName,
                type: template.id,
                template
            });

            await this.notificationService.showInformation(
                `✅ Custom agent "${agentName}" created successfully!`
            );

        } catch (error) {
            console.error('[NofX Debug] createCustomAgent error:', error);
            const err = error instanceof Error ? error : new Error(String(error));
            await this.notificationService.showError(`Failed to create custom agent: ${err.message}`);
        }
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}
