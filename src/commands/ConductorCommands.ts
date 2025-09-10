import * as vscode from 'vscode';
import {
    ICommandHandler,
    ICommandService,
    INotificationService,
    IConfiguration,
    ILogger,
    IEventEmitter,
    IEventSubscriber,
    IConductorViewModel
} from '../services/interfaces';
import { ServiceLocator } from '../services/ServiceLocator';
// TaskToolBridge removed - overly complex
import { PickItem } from '../types/ui';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';
import { SmartConductor } from '../conductor/SmartConductor';
import { AgentTemplateManager } from '../agents/AgentTemplateManager';
// import { AgentTreeProvider } from '../views/AgentTreeProvider';
import { ConductorPanel } from '../panels/ConductorPanel';
import {
    SmartTemplateFactory,
    AgentConfig,
    DeveloperConfig,
    ArchitectConfig,
    QualityConfig,
    ProcessConfig,
    SmartAgentTemplate
} from '../agents/SmartTemplateSystem';
import { NaturalLanguageTemplateResolver, NLParseResult } from '../agents/NaturalLanguageTemplateResolver';
import { SmartAgentConfigInterface } from '../agents/types';

interface TeamPreset {
    value: string;
    agents: string[];
}

interface SmartTeamPreset {
    value: string;
    name: string;
    description: string;
    agentConfigs: AgentConfig[];
}

interface SmartSpawnCommand {
    type: 'spawn';
    category: 'developer' | 'architect' | 'quality' | 'process';
    config: Partial<AgentConfig>;
    name?: string;
    customizations?: {
        additionalLanguages?: string[];
        additionalSpecializations?: string[];
        priorityOverride?: 'low' | 'medium' | 'high' | 'critical';
    };
}

export class ConductorCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly taskQueue: TaskQueue;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfiguration;
    private readonly loggingService: ILogger;
    private readonly context: vscode.ExtensionContext;
    private readonly serviceLocator: typeof ServiceLocator;
    // TaskToolBridge removed - overly complex

    private smartConductor?: SmartConductor;
    private currentTeamName: string = 'Active Agents';
    private agentProvider?: any; // AgentTreeProvider;
    private templateManager?: AgentTemplateManager;

    constructor(serviceLocator: typeof ServiceLocator) {
        this.agentManager = ServiceLocator.get<AgentManager>('AgentManager');
        this.taskQueue = ServiceLocator.get<TaskQueue>('TaskQueue');
        this.commandService = ServiceLocator.get<ICommandService>('CommandService');
        this.notificationService = ServiceLocator.get<INotificationService>('NotificationService');
        this.configService = ServiceLocator.get<IConfiguration>('ConfigurationService');
        this.loggingService = ServiceLocator.get<ILogger>('LoggingService');
        this.context = ServiceLocator.get<vscode.ExtensionContext>('ExtensionContext');
        this.serviceLocator = serviceLocator;
        // TaskToolBridge removed - overly complex
    }

    setAgentProvider(provider: any): void {
        // AgentTreeProvider
        this.agentProvider = provider;
    }

    register(): void {
        this.commandService.register('nofx.startConductor', this.startConductor.bind(this));
        this.commandService.register('nofx.quickStartChat', this.quickStartChat.bind(this));
        this.commandService.register('nofx.openConductorChat', this.openConductorChat.bind(this));
        this.commandService.register('nofx.openConductorTerminal', this.openConductorTerminal.bind(this));
        this.commandService.register('nofx.openSimpleConductor', this.openConductorChat.bind(this));
        this.commandService.register('nofx.openConductorPanel', this.openConductorPanel.bind(this));
        this.commandService.register('nofx.startSmartTeam', this.startSmartTeam.bind(this));
        this.commandService.register('nofx.spawnSmartAgent', this.spawnSmartAgent.bind(this));
    }

    private async startConductor(): Promise<void> {
        console.log('[NofX Debug] startConductor called');
        this.loggingService.info('startConductor command invoked');

        try {
            // Show information message to confirm command is running
            vscode.window.showInformationMessage('NofX: Starting conductor setup...');
        } catch (error) {
            console.error('[NofX Debug] Error showing info message:', error);
        }

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

                        // Add delay between agent creations to avoid overwhelming the terminal system
                        if (createdCount < teamAgents.length) {
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Increased from 1000ms to 2000ms
                        }
                    } catch (error) {
                        this.loggingService?.error(`Failed to create agent from template ${templateId}:`, error);
                    }
                }
            }

            const message =
                createdCount === teamAgents.length
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
                    // Small delay between agent creation to prevent terminal panel issues
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Increased from 300ms to 1500ms
                } catch (error) {
                    this.loggingService?.error(`Failed to create agent from template ${templateId}:`, error);
                }
            }
        }

        // Small delay before opening conductor to ensure all agent terminals are settled
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased from 500ms to 2000ms

        // Open conductor terminal automatically
        await this.openConductorTerminal();

        // Don't force terminal focus - let agents settle first
        // Focus manipulation can interfere with agent initialization
        // vscode.commands.executeCommand('workbench.action.terminal.focus');
        // await new Promise(resolve => setTimeout(resolve, 200));
        // vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');

        const assemblyMessage =
            createdCount === projectConfig.agents.length
                ? `${projectConfig.teamName} assembled (${createdCount} agents)! Conductor terminal is ready.`
                : `${projectConfig.teamName} partially assembled (${createdCount} of ${projectConfig.agents.length} agents)! Conductor terminal is ready.`;
        await this.notificationService.showInformation(assemblyMessage);
    }

    private async openConductorChat(): Promise<void> {
        // Conductor chat is deprecated - use SmartConductor terminal instead
        await this.openConductorTerminal();
    }

    private async openConductorTerminal(): Promise<void> {
        // Determine which conductor to use based on team size or configuration
        const activeAgents = this.agentManager.getActiveAgents();
        const agentCount = activeAgents.length;

        if (agentCount === 0) {
            await this.notificationService.showWarning('No agents available. Please add agents first.');
            return;
        }

        // Create the unified Smart Conductor
        this.smartConductor = new SmartConductor(this.context);
        await this.smartConductor.start();

        await this.notificationService.showInformation(`${this.currentTeamName} conductor started`);
    }

    private async openConductorPanel(): Promise<void> {
        try {
            const viewModel = this.serviceLocator.get<IConductorViewModel>('ConductorViewModel');
            const loggingService = this.serviceLocator.get<ILogger>('LoggingService');

            ConductorPanel.createOrShow(this.context, viewModel, loggingService);

            await this.notificationService.showInformation('Conductor Panel opened');
        } catch (error) {
            this.notificationService.showError('Failed to open Conductor Panel');
        }
    }

    private async startSmartTeam(): Promise<void> {
        console.log('[NofX Debug] startSmartTeam called');
        this.loggingService.info('startSmartTeam command invoked');

        try {
            vscode.window.showInformationMessage('NofX: Starting smart team setup...');
        } catch (error) {
            console.error('[NofX Debug] Error showing info message:', error);
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        if (!this.templateManager) {
            this.templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        }

        // Smart team presets using dynamic configurations
        const smartPresets: PickItem<SmartTeamPreset>[] = [
            {
                label: '$(rocket) Smart Full-Stack Team',
                description: 'Dynamic frontend, backend, and DevOps specialists',
                value: {
                    value: 'smart-fullstack',
                    name: 'Smart Full-Stack Team',
                    description: 'Dynamically configured full-stack development team',
                    agentConfigs: [
                        {
                            category: 'developer',
                            primaryDomain: 'frontend',
                            languages: ['typescript', 'javascript', 'html', 'css'],
                            frameworks: ['react', 'next.js', 'tailwind-css'],
                            specializations: ['responsive-design', 'accessibility', 'performance'],
                            toolchain: ['vscode', 'git', 'webpack', 'jest'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'developer',
                            primaryDomain: 'backend',
                            languages: ['typescript', 'python', 'sql'],
                            frameworks: ['express', 'fastapi', 'postgresql'],
                            specializations: ['api-design', 'database-design', 'authentication'],
                            toolchain: ['vscode', 'git', 'docker', 'jest'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'architect',
                            scope: 'cloud',
                            focusAreas: ['infrastructure', 'deployment', 'monitoring'],
                            decisionLevel: 'tactical',
                            systemTypes: ['containerization', 'ci-cd'],
                            complexity: 'high',
                            priority: 'high'
                        } as ArchitectConfig
                    ]
                }
            },
            {
                label: '$(beaker) Smart Quality Team',
                description: 'Dynamic testing, security, and performance specialists',
                value: {
                    value: 'smart-quality',
                    name: 'Smart Quality Team',
                    description: 'Comprehensive quality assurance team',
                    agentConfigs: [
                        {
                            category: 'quality',
                            primaryFocus: 'testing',
                            testingTypes: ['unit', 'integration', 'e2e'],
                            securityScope: ['application-security'],
                            auditAreas: ['code-quality'],
                            toolchain: ['jest', 'cypress', 'playwright'],
                            complexity: 'high',
                            priority: 'high'
                        } as QualityConfig,
                        {
                            category: 'quality',
                            primaryFocus: 'security',
                            testingTypes: ['penetration-testing'],
                            securityScope: ['application-security', 'infrastructure-security'],
                            auditAreas: ['vulnerability-assessment'],
                            toolchain: ['burp-suite', 'owasp-zap'],
                            complexity: 'high',
                            priority: 'high'
                        } as QualityConfig,
                        {
                            category: 'developer',
                            primaryDomain: 'backend',
                            languages: ['typescript', 'python'],
                            frameworks: ['express', 'fastapi'],
                            specializations: ['performance-optimization', 'monitoring'],
                            toolchain: ['docker', 'prometheus'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig
                    ]
                }
            },
            {
                label: '$(device-mobile) Smart Mobile Team',
                description: 'Cross-platform mobile development team',
                value: {
                    value: 'smart-mobile',
                    name: 'Smart Mobile Team',
                    description: 'Mobile-first development team',
                    agentConfigs: [
                        {
                            category: 'developer',
                            primaryDomain: 'mobile',
                            languages: ['typescript', 'swift', 'kotlin'],
                            frameworks: ['react-native', 'expo'],
                            specializations: ['cross-platform', 'native-modules', 'app-performance'],
                            toolchain: ['vscode', 'xcode', 'android-studio'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'developer',
                            primaryDomain: 'backend',
                            languages: ['typescript', 'python'],
                            frameworks: ['express', 'fastapi'],
                            specializations: ['api-design', 'real-time', 'push-notifications'],
                            toolchain: ['docker', 'redis'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'quality',
                            primaryFocus: 'testing',
                            testingTypes: ['unit', 'e2e', 'device-testing'],
                            securityScope: ['mobile-security'],
                            auditAreas: ['performance'],
                            toolchain: ['detox', 'appium'],
                            complexity: 'high',
                            priority: 'high'
                        } as QualityConfig
                    ]
                }
            },
            {
                label: '$(circuit-board) Smart AI Team',
                description: 'AI/ML development and integration team',
                value: {
                    value: 'smart-ai',
                    name: 'Smart AI Team',
                    description: 'AI/ML focused development team',
                    agentConfigs: [
                        {
                            category: 'developer',
                            primaryDomain: 'ai-ml',
                            languages: ['python', 'typescript'],
                            frameworks: ['tensorflow', 'pytorch', 'langchain'],
                            specializations: ['machine-learning', 'nlp', 'model-training'],
                            toolchain: ['jupyter', 'docker', 'gpu-clusters'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'developer',
                            primaryDomain: 'data',
                            languages: ['python', 'sql', 'r'],
                            frameworks: ['pandas', 'spark', 'airflow'],
                            specializations: ['data-processing', 'analytics', 'etl-pipelines'],
                            toolchain: ['jupyter', 'databricks', 'snowflake'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'architect',
                            scope: 'database',
                            focusAreas: ['data-architecture', 'ml-pipelines'],
                            decisionLevel: 'tactical',
                            systemTypes: ['data-lake', 'ml-ops'],
                            complexity: 'high',
                            priority: 'high'
                        } as ArchitectConfig
                    ]
                }
            },
            {
                label: '$(dashboard) Smart Startup Team',
                description: 'Lean team for rapid MVP development',
                value: {
                    value: 'smart-startup',
                    name: 'Smart Startup Team',
                    description: 'Agile MVP development team',
                    agentConfigs: [
                        {
                            category: 'developer',
                            primaryDomain: 'fullstack',
                            languages: ['typescript', 'javascript', 'python'],
                            frameworks: ['react', 'express', 'postgresql'],
                            specializations: ['rapid-development', 'mvp-development', 'end-to-end-development'],
                            toolchain: ['vscode', 'git', 'docker'],
                            complexity: 'high',
                            priority: 'high'
                        } as DeveloperConfig,
                        {
                            category: 'process',
                            role: 'product-manager',
                            methodologies: ['agile', 'lean'],
                            stakeholders: ['users', 'development-team', 'investors'],
                            deliverables: ['roadmaps', 'user-stories', 'metrics'],
                            communicationStyle: 'business',
                            complexity: 'medium',
                            priority: 'high'
                        } as ProcessConfig
                    ]
                }
            },
            {
                label: '$(person) Custom Smart Team',
                description: 'Build your team with smart agent configurations',
                value: {
                    value: 'smart-custom',
                    name: 'Custom Smart Team',
                    description: 'Customizable team composition',
                    agentConfigs: []
                }
            }
        ];

        const selected = await this.notificationService.showQuickPick(smartPresets, {
            placeHolder: 'Select a smart team configuration'
        });

        if (!selected) {
            return;
        }

        const preset = selected.value;
        this.currentTeamName = preset.name;

        // Update agent tree provider with new team name
        if (this.agentProvider && typeof this.agentProvider.setTeamName === 'function') {
            this.agentProvider.setTeamName(this.currentTeamName);
        }

        if (preset.value === 'smart-custom') {
            // Let user build custom team
            await this.spawnSmartAgent();
        } else {
            // Create smart agents from configurations
            let createdCount = 0;
            for (const config of preset.agentConfigs) {
                try {
                    const template = SmartTemplateFactory.createTemplate(config);
                    await this.agentManager.spawnAgent({
                        name: template.name,
                        type: template.id,
                        template
                    });
                    createdCount++;

                    // Add delay between agent creations
                    if (createdCount < preset.agentConfigs.length) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    this.loggingService?.error(`Failed to create smart agent:`, error);
                }
            }

            const message = `Smart team "${this.currentTeamName}" created with ${createdCount} dynamic agents`;
            await this.notificationService.showInformation(message);
        }

        // Open conductor terminal
        await this.openConductorTerminal();
    }

    private async spawnSmartAgent(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        if (!this.templateManager) {
            this.templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        }

        // Select agent category
        const categoryOptions: PickItem<string>[] = [
            {
                label: '$(code) Developer',
                description: 'Frontend, backend, fullstack, mobile, AI/ML specialists',
                value: 'developer'
            },
            {
                label: '$(layers) Architect',
                description: 'Software, database, cloud, performance architects',
                value: 'architect'
            },
            {
                label: '$(shield) Quality Specialist',
                description: 'Testing, security, performance, accessibility experts',
                value: 'quality'
            },
            {
                label: '$(organization) Process Manager',
                description: 'Product managers, scrum masters, technical writers',
                value: 'process'
            }
        ];

        const categoryChoice = await this.notificationService.showQuickPick(categoryOptions, {
            placeHolder: 'Select agent category'
        });

        if (!categoryChoice) {
            return;
        }

        let config: AgentConfig;

        switch (categoryChoice.value) {
            case 'developer':
                const devConfig = await this.configureDeveloper();
                if (!devConfig) return;
                config = devConfig as any as AgentConfig;
                break;
            case 'architect':
                const archConfig = await this.configureArchitect();
                if (!archConfig) return;
                config = archConfig as any as AgentConfig;
                break;
            case 'quality':
                const qualConfig = await this.configureQuality();
                if (!qualConfig) return;
                config = qualConfig as any as AgentConfig;
                break;
            case 'process':
                const procConfig = await this.configureProcess();
                if (!procConfig) return;
                config = procConfig as any as AgentConfig;
                break;
            default:
                return;
        }

        if (!config) {
            return;
        }

        try {
            const template = SmartTemplateFactory.createTemplate(config);
            await this.agentManager.spawnAgent({
                name: template.name,
                type: template.id,
                template
            });

            await this.notificationService.showInformation(`Smart agent "${template.name}" created successfully`);
        } catch (error) {
            this.loggingService?.error('Failed to create smart agent:', error);
            await this.notificationService.showError('Failed to create smart agent');
        }
    }

    private async configureDeveloper(): Promise<DeveloperConfig | null> {
        // Select primary domain
        const domainOptions: PickItem<DeveloperConfig['primaryDomain']>[] = [
            { label: 'Frontend', description: 'UI, React, Vue, Angular', value: 'frontend' },
            { label: 'Backend', description: 'APIs, databases, servers', value: 'backend' },
            { label: 'Fullstack', description: 'End-to-end development', value: 'fullstack' },
            { label: 'Mobile', description: 'iOS, Android, React Native', value: 'mobile' },
            { label: 'AI/ML', description: 'Machine learning, data science', value: 'ai-ml' },
            { label: 'Data', description: 'Data engineering, analytics', value: 'data' }
        ];

        const domainChoice = await this.notificationService.showQuickPick(domainOptions, {
            placeHolder: 'Select primary domain'
        });

        if (!domainChoice) {
            return null;
        }

        // Get suggested languages and frameworks based on domain
        const suggestions = this.getDomainSuggestions(domainChoice.value);

        return {
            category: 'developer',
            primaryDomain: domainChoice.value,
            languages: suggestions.languages,
            frameworks: suggestions.frameworks,
            specializations: suggestions.specializations,
            toolchain: suggestions.toolchain,
            complexity: 'high',
            priority: 'high'
        };
    }

    private async configureArchitect(): Promise<ArchitectConfig | null> {
        const scopeOptions: PickItem<ArchitectConfig['scope']>[] = [
            { label: 'Software', description: 'System design, patterns', value: 'software' },
            { label: 'Database', description: 'Data modeling, optimization', value: 'database' },
            { label: 'Cloud', description: 'Infrastructure, scalability', value: 'cloud' },
            { label: 'Integration', description: 'APIs, message queues', value: 'integration' },
            { label: 'Performance', description: 'Optimization, monitoring', value: 'performance' }
        ];

        const scopeChoice = await this.notificationService.showQuickPick(scopeOptions, {
            placeHolder: 'Select architectural scope'
        });

        if (!scopeChoice) {
            return null;
        }

        const suggestions = this.getArchitectSuggestions(scopeChoice.value);

        return {
            category: 'architect',
            scope: scopeChoice.value,
            focusAreas: suggestions.focusAreas,
            decisionLevel: 'strategic',
            systemTypes: suggestions.systemTypes,
            complexity: 'high',
            priority: 'high'
        };
    }

    private async configureQuality(): Promise<QualityConfig | null> {
        const focusOptions: PickItem<QualityConfig['primaryFocus']>[] = [
            { label: 'Testing', description: 'Unit, integration, E2E', value: 'testing' },
            { label: 'Security', description: 'Penetration testing, audits', value: 'security' },
            { label: 'Performance', description: 'Load testing, optimization', value: 'performance' },
            { label: 'Accessibility', description: 'WCAG, inclusive design', value: 'accessibility' },
            { label: 'Audit', description: 'Code quality, compliance', value: 'audit' }
        ];

        const focusChoice = await this.notificationService.showQuickPick(focusOptions, {
            placeHolder: 'Select quality focus area'
        });

        if (!focusChoice) {
            return null;
        }

        const suggestions = this.getQualitySuggestions(focusChoice.value);

        return {
            category: 'quality',
            primaryFocus: focusChoice.value,
            testingTypes: suggestions.testingTypes,
            securityScope: suggestions.securityScope,
            auditAreas: suggestions.auditAreas,
            toolchain: suggestions.toolchain,
            complexity: 'high',
            priority: 'high'
        };
    }

    private async configureProcess(): Promise<ProcessConfig | null> {
        const roleOptions: PickItem<ProcessConfig['role']>[] = [
            { label: 'Product Manager', description: 'Strategy, roadmaps', value: 'product-manager' },
            { label: 'Scrum Master', description: 'Agile facilitation', value: 'scrum-master' },
            { label: 'Release Manager', description: 'Deployment coordination', value: 'release-manager' },
            { label: 'Technical Writer', description: 'Documentation, guides', value: 'technical-writer' },
            { label: 'Designer', description: 'UI/UX, prototyping', value: 'designer' }
        ];

        const roleChoice = await this.notificationService.showQuickPick(roleOptions, {
            placeHolder: 'Select process role'
        });

        if (!roleChoice) {
            return null;
        }

        const suggestions = this.getProcessSuggestions(roleChoice.value);

        return {
            category: 'process',
            role: roleChoice.value,
            methodologies: suggestions.methodologies,
            stakeholders: suggestions.stakeholders,
            deliverables: suggestions.deliverables,
            communicationStyle: 'business',
            complexity: 'medium',
            priority: 'high'
        };
    }

    private getDomainSuggestions(domain: DeveloperConfig['primaryDomain']) {
        const suggestions = {
            frontend: {
                languages: ['typescript', 'javascript', 'html', 'css'],
                frameworks: ['react', 'next.js', 'tailwind-css'],
                specializations: ['responsive-design', 'accessibility', 'performance'],
                toolchain: ['vscode', 'git', 'webpack', 'jest']
            },
            backend: {
                languages: ['typescript', 'python', 'sql'],
                frameworks: ['express', 'fastapi', 'postgresql'],
                specializations: ['api-design', 'database-design', 'authentication'],
                toolchain: ['vscode', 'git', 'docker', 'jest']
            },
            fullstack: {
                languages: ['typescript', 'javascript', 'python'],
                frameworks: ['react', 'express', 'postgresql'],
                specializations: ['end-to-end-development', 'api-design', 'ui-ux'],
                toolchain: ['vscode', 'git', 'docker', 'jest']
            },
            mobile: {
                languages: ['typescript', 'swift', 'kotlin'],
                frameworks: ['react-native', 'expo'],
                specializations: ['cross-platform', 'native-modules', 'app-performance'],
                toolchain: ['vscode', 'xcode', 'android-studio']
            },
            'ai-ml': {
                languages: ['python', 'typescript'],
                frameworks: ['tensorflow', 'pytorch', 'langchain'],
                specializations: ['machine-learning', 'nlp', 'model-training'],
                toolchain: ['jupyter', 'docker', 'gpu-clusters']
            },
            data: {
                languages: ['python', 'sql', 'r'],
                frameworks: ['pandas', 'spark', 'airflow'],
                specializations: ['data-processing', 'analytics', 'etl-pipelines'],
                toolchain: ['jupyter', 'databricks', 'snowflake']
            }
        };

        return suggestions[domain] || suggestions.fullstack;
    }

    private getArchitectSuggestions(scope: ArchitectConfig['scope']) {
        const suggestions = {
            software: {
                focusAreas: ['system-design', 'scalability', 'performance'],
                systemTypes: ['microservices', 'distributed-systems']
            },
            database: {
                focusAreas: ['data-modeling', 'optimization', 'scaling'],
                systemTypes: ['relational', 'nosql', 'data-warehouse']
            },
            cloud: {
                focusAreas: ['infrastructure', 'deployment', 'monitoring'],
                systemTypes: ['containerization', 'serverless', 'multi-cloud']
            },
            integration: {
                focusAreas: ['api-design', 'message-queues', 'event-driven'],
                systemTypes: ['microservices', 'event-sourcing']
            },
            performance: {
                focusAreas: ['optimization', 'monitoring', 'scaling'],
                systemTypes: ['high-performance', 'real-time']
            }
        };

        return suggestions[scope] || suggestions.software;
    }

    private getQualitySuggestions(focus: QualityConfig['primaryFocus']) {
        const suggestions = {
            testing: {
                testingTypes: ['unit', 'integration', 'e2e'],
                securityScope: ['application-security'],
                auditAreas: ['code-quality'],
                toolchain: ['jest', 'cypress', 'playwright']
            },
            security: {
                testingTypes: ['penetration-testing'],
                securityScope: ['application-security', 'infrastructure-security'],
                auditAreas: ['vulnerability-assessment'],
                toolchain: ['burp-suite', 'owasp-zap']
            },
            performance: {
                testingTypes: ['load-testing', 'stress-testing'],
                securityScope: [],
                auditAreas: ['performance-optimization'],
                toolchain: ['k6', 'jmeter']
            },
            accessibility: {
                testingTypes: ['accessibility-testing'],
                securityScope: [],
                auditAreas: ['wcag-compliance'],
                toolchain: ['axe', 'wave']
            },
            audit: {
                testingTypes: ['compliance-testing'],
                securityScope: ['data-protection'],
                auditAreas: ['code-quality', 'compliance'],
                toolchain: ['sonarqube', 'snyk']
            }
        };

        return suggestions[focus] || suggestions.testing;
    }

    private getProcessSuggestions(role: ProcessConfig['role']) {
        const suggestions = {
            'product-manager': {
                methodologies: ['agile', 'lean'],
                stakeholders: ['users', 'development-team', 'business'],
                deliverables: ['roadmaps', 'requirements', 'user-stories']
            },
            'scrum-master': {
                methodologies: ['scrum', 'agile'],
                stakeholders: ['development-team', 'product-owner'],
                deliverables: ['sprint-planning', 'retrospectives', 'impediment-removal']
            },
            'release-manager': {
                methodologies: ['devops', 'continuous-delivery'],
                stakeholders: ['development-team', 'operations'],
                deliverables: ['release-plans', 'deployment-coordination', 'rollback-procedures']
            },
            'technical-writer': {
                methodologies: ['documentation-driven'],
                stakeholders: ['developers', 'users'],
                deliverables: ['documentation', 'guides', 'tutorials']
            },
            designer: {
                methodologies: ['design-thinking', 'user-centered-design'],
                stakeholders: ['users', 'product-team'],
                deliverables: ['mockups', 'prototypes', 'design-systems']
            }
        };

        return suggestions[role] || suggestions['product-manager'];
    }

    async createAgentFromNaturalLanguage(): Promise<void> {
        const request = await vscode.window.showInputBox({
            prompt: 'Describe what kind of agent or team you need',
            placeHolder: 'e.g., "I need a React developer for UI work" or "Create a security audit team"',
            ignoreFocusOut: true
        });

        if (!request) {
            return;
        }

        try {
            // Parse the natural language request
            const parseResult = NaturalLanguageTemplateResolver.parseNaturalLanguageRequest(request);

            // Show confidence and parsed intent to user
            const confidencePercent = Math.round(parseResult.confidence * 100);
            let message = `Parsed with ${confidencePercent}% confidence:\n`;
            message += `Action: ${parseResult.parsedIntent.action}\n`;

            if (parseResult.parsedIntent.agentType) {
                message += `Agent Type: ${parseResult.parsedIntent.agentType}\n`;
            }
            if (parseResult.parsedIntent.teamType) {
                message += `Team Type: ${parseResult.parsedIntent.teamType}\n`;
            }

            // Handle different confidence levels
            if (parseResult.confidence < 0.3) {
                // Low confidence - show suggestions and ask for clarification
                message += '\nSuggestions:\n' + (parseResult.suggestions || []).join('\n');

                const retry = await vscode.window.showWarningMessage(
                    `Low confidence parsing: ${message}`,
                    'Try Again',
                    'Manual Configuration'
                );

                if (retry === 'Try Again') {
                    return this.createAgentFromNaturalLanguage();
                } else if (retry === 'Manual Configuration') {
                    return this.spawnSmartAgent();
                }
                return;
            } else if (parseResult.confidence < 0.7) {
                // Medium confidence - confirm before proceeding
                const proceed = await vscode.window.showInformationMessage(
                    `Medium confidence: ${message}\nProceed?`,
                    'Yes, Create',
                    'Modify',
                    'Cancel'
                );

                if (proceed === 'Modify') {
                    return this.spawnSmartAgent();
                } else if (proceed !== 'Yes, Create') {
                    return;
                }
            } else {
                // High confidence - just show what we're creating
                vscode.window.showInformationMessage(`High confidence: ${message}`);
            }

            // Execute the parsed intent
            await this.executeNLParseResult(parseResult);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to parse natural language request: ${error}`);
        }
    }

    private async executeNLParseResult(parseResult: NLParseResult): Promise<void> {
        switch (parseResult.parsedIntent.action) {
            case 'spawn_agent':
                if (parseResult.extractedConfig) {
                    // Ensure required fields are present
                    const config: SmartAgentConfigInterface = {
                        category: parseResult.extractedConfig.category || 'developer',
                        ...parseResult.extractedConfig
                    } as SmartAgentConfigInterface;
                    await this.spawnAgentFromConfig(config);
                }
                break;

            case 'create_team':
                if (parseResult.suggestedConfigs && parseResult.suggestedConfigs.length > 0) {
                    await this.spawnTeamFromConfigs(
                        parseResult.suggestedConfigs,
                        parseResult.parsedIntent.teamType || 'Custom Team'
                    );
                }
                break;

            case 'assign_task':
                if (parseResult.parsedIntent.taskDescription) {
                    // This would integrate with task assignment system
                    vscode.window.showInformationMessage(
                        `Task assignment not yet implemented: ${parseResult.parsedIntent.taskDescription}`
                    );
                }
                break;

            default:
                vscode.window.showWarningMessage('Unknown action type from natural language parsing');
        }
    }

    private async spawnAgentFromConfig(config: SmartAgentConfigInterface): Promise<void> {
        try {
            // Complete any missing required fields with defaults
            const completeConfig = {
                category: config.category || 'developer',
                complexity: config.complexity || 'medium',
                priority: config.priority || 'medium',
                ...config
            } as SmartAgentConfigInterface;

            const template = SmartTemplateFactory.createTemplate(completeConfig as AgentConfig);
            await this.agentManager.spawnAgent({
                name: template.name,
                type: template.id,
                template: template
            });

            vscode.window.showInformationMessage(`✅ Smart agent ${template.name} created from natural language!`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create smart agent: ${error}`);
        }
    }

    private async spawnTeamFromConfigs(configs: SmartAgentConfigInterface[], teamName: string): Promise<void> {
        try {
            const spawnedAgents: string[] = [];

            for (let i = 0; i < configs.length; i++) {
                const config = configs[i];
                const template = SmartTemplateFactory.createTemplate(config as AgentConfig);

                await this.agentManager.spawnAgent({
                    name: `${teamName} - ${template.name}`,
                    type: template.id,
                    template: template
                });

                spawnedAgents.push(template.name);
            }

            vscode.window.showInformationMessage(
                `✅ Smart team "${teamName}" created with ${spawnedAgents.length} agents: ${spawnedAgents.join(', ')}`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create smart team: ${error}`);
        }
    }

    dispose(): void {
        this.smartConductor?.dispose();
        this.smartConductor = undefined;
        // Command disposal handled by CommandService
    }
}
