import * as vscode from 'vscode';
import { EnhancedConductorPanel } from './panels/EnhancedConductorPanel';
import { AgentManager } from './agents/AgentManager';
import { TaskQueue } from './tasks/TaskQueue';
import { AgentTreeProvider } from './views/AgentTreeProvider';
import { NofxDevTreeProvider } from './views/NofxDevTreeProvider';
// TaskTreeProvider no longer needed - tasks shown in AgentTreeProvider
import { NofxTerminalProvider } from './views/NofxTerminalProvider';
import { ConductorChat } from './conductor/ConductorChat';
import { ConductorChatWebview } from './conductor/ConductorChatWebview';
import { ConductorTerminal } from './conductor/ConductorTerminal';
import { OrchestrationServer } from './orchestration/OrchestrationServer';
import { MessageFlowDashboard } from './dashboard/MessageFlowDashboard';
import { MessageType, OrchestratorMessage } from './orchestration/MessageProtocol';

let conductorPanel: EnhancedConductorPanel | undefined;
let agentManager: AgentManager;
let taskQueue: TaskQueue;
let conductorChat: ConductorChat | undefined;
let conductorWebview: ConductorChatWebview | undefined;
let conductorTerminal: ConductorTerminal | undefined;
let orchestrationServer: OrchestrationServer | undefined;
let messageFlowDashboard: MessageFlowDashboard | undefined;
let extensionContext: vscode.ExtensionContext;
let currentTeamName: string = 'Active Agents';  // Track the current team name
let agentProvider: AgentTreeProvider;  // Make this global so we can update team names

export async function activate(context: vscode.ExtensionContext) {
    console.log('🎸 n of x Multi-Agent Orchestrator is now active!');

    // Store context globally for access in helper functions
    extensionContext = context;
    (global as any).extensionContext = context;

    // Initialize core components
    agentManager = new AgentManager(context);
    taskQueue = new TaskQueue(agentManager);
    
    // Initialize agent manager (this will check for saved agents)
    await agentManager.initialize();
    
    // Start orchestration server
    orchestrationServer = new OrchestrationServer();
    await orchestrationServer.start();
    
    // Set up message handling for agent commands
    setupOrchestrationHandlers();

    // Register tree data providers for sidebar views
    const nofxDevProvider = new NofxDevTreeProvider();
    agentProvider = new AgentTreeProvider(agentManager, taskQueue);  // Use global variable
    
    vscode.window.registerTreeDataProvider('nofx.dev', nofxDevProvider);
    vscode.window.registerTreeDataProvider('nofx.agents', agentProvider);
    // Task provider no longer needed - tasks shown in agent tree
    
    // Auto-open conductor chat when NofX view becomes visible for the first time
    let hasShownConductor = false;
    const agentTreeView = vscode.window.createTreeView('nofx.agents', {
        treeDataProvider: agentProvider,
        showCollapseAll: true
    });
    
    // COMMENTED OUT - No auto-opening of chat when clicking NofX icon
    // agentTreeView.onDidChangeVisibility(async (e) => {
    //     if (e.visible && !hasShownConductor) {
    //         hasShownConductor = true;
    //         // Auto-open conductor chat when user clicks on NofX icon
    //         await openConductorChatWebview();
    //     }
    // });
    
    context.subscriptions.push(agentTreeView);
    
    // Register NofX terminal panel provider
    const terminalProvider = new NofxTerminalProvider(context.extensionUri, agentManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            NofxTerminalProvider.viewType,
            terminalProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    
    // Update context when agents change
    agentManager.onAgentUpdate(() => {
        const hasAgents = agentManager.getActiveAgents().length > 0;
        vscode.commands.executeCommand('setContext', 'nofx.hasAgents', hasAgents);
    });

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.startConductor', () => {
            startConductor(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.quickStartChat', async () => {
            await quickStartWithChat(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.addAgent', async () => {
            await addAgent();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.createTask', async () => {
            await createTask();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.showOrchestrator', () => {
            showOrchestrator(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.completeTask', async () => {
            await completeCurrentTask();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.editAgent', async (agentId?: string) => {
            await editAgent(agentId);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.focusAgentTerminal', async (agentId?: string) => {
            await focusAgentTerminal(agentId);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.deleteAgent', async (agentId?: string) => {
            await deleteAgent(agentId);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.testClaude', async () => {
            await testClaudeCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.openConductorChat', async () => {
            await openConductorChatWebview();
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.openConductorTerminal', async () => {
            if (!conductorTerminal) {
                conductorTerminal = new ConductorTerminal(agentManager, taskQueue);
            }
            await conductorTerminal.start();
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.openMessageFlow', async () => {
            if (!orchestrationServer) {
                vscode.window.showErrorMessage('Orchestration server not running');
                return;
            }
            if (!messageFlowDashboard) {
                messageFlowDashboard = new MessageFlowDashboard(context, orchestrationServer);
            }
            await messageFlowDashboard.show();
        })
    );
    
    // Persistence commands
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.exportSessions', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace open. Cannot export sessions.');
                return;
            }
            
            const { AgentPersistence } = await import('./persistence/AgentPersistence');
            const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
            const exportPath = await persistence.exportSessionsAsMarkdown();
            
            vscode.window.showInformationMessage(
                `Sessions exported to: ${exportPath}`,
                'Open File'
            ).then(selection => {
                if (selection === 'Open File') {
                    vscode.workspace.openTextDocument(exportPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.archiveSessions', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace open. Cannot archive sessions.');
                return;
            }
            
            const days = await vscode.window.showInputBox({
                prompt: 'Archive sessions older than how many days?',
                value: '7',
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1) {
                        return 'Please enter a positive number';
                    }
                    return null;
                }
            });
            
            if (days) {
                const { AgentPersistence } = await import('./persistence/AgentPersistence');
                const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
                await persistence.archiveOldSessions(parseInt(days));
                vscode.window.showInformationMessage(`Sessions older than ${days} days archived`);
            }
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.restoreAgents', async () => {
            const restored = await agentManager.restoreAgents();
            if (restored > 0) {
                vscode.window.showInformationMessage(`✅ Restored ${restored} agent(s)`);
            } else {
                vscode.window.showInformationMessage('No saved agents to restore');
            }
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.clearPersistence', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'This will remove all saved agent states and sessions. Are you sure?',
                'Yes, Clear All',
                'Cancel'
            );
            
            if (confirm === 'Yes, Clear All') {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace open.');
                    return;
                }
                
                const { AgentPersistence } = await import('./persistence/AgentPersistence');
                const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
                await persistence.cleanup();
                vscode.window.showInformationMessage('All agent persistence data cleared');
            }
        })
    );
    
    // Agent Template Commands
    let templateManager: any;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const { AgentTemplateManager } = await import('./agents/AgentTemplateManager');
        templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
    }
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.browseAgentTemplates', async () => {
            if (!templateManager) {
                vscode.window.showErrorMessage('No workspace open. Cannot browse templates.');
                return;
            }
            const { AgentTemplateBrowser } = await import('./views/AgentTemplateBrowser');
            const browser = new AgentTemplateBrowser(templateManager, agentManager);
            await browser.showTemplateBrowser();
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.createAgentTemplate', async () => {
            if (!templateManager) {
                vscode.window.showErrorMessage('No workspace open. Cannot create templates.');
                return;
            }
            const { AgentTemplateEditor } = await import('./panels/AgentTemplateEditor');
            AgentTemplateEditor.createOrShow(context, templateManager);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.editAgentTemplate', async () => {
            if (!templateManager) {
                vscode.window.showErrorMessage('No workspace open. Cannot edit templates.');
                return;
            }
            
            const templates = templateManager.getTemplates();
            const items = templates.map((t: any) => ({
                label: `${t.icon} ${t.name}`,
                description: t.description,
                id: t.id
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a template to edit'
            });
            
            if (selected) {
                const { AgentTemplateEditor } = await import('./panels/AgentTemplateEditor');
                AgentTemplateEditor.createOrShow(context, templateManager, (selected as any).id);
            }
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('nofx.importAgentTemplate', async () => {
            if (!templateManager) {
                vscode.window.showErrorMessage('No workspace open. Cannot import templates.');
                return;
            }
            
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON files': ['json']
                },
                title: 'Select Agent Template to Import'
            });
            
            if (fileUri && fileUri[0]) {
                const success = await templateManager.importTemplate(fileUri[0]);
                if (success) {
                    vscode.window.showInformationMessage('Template imported successfully');
                }
            }
        })
    );

    // Auto-start conductor if configured
    const config = vscode.workspace.getConfiguration('nofx');
    if (config.get('autoStart')) {
        startConductor(context);
    }

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(dashboard) NofX";
    statusBarItem.tooltip = "Click to show NofX Orchestrator";
    statusBarItem.command = 'nofx.showOrchestrator';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

async function openConductorChatWebview() {
    // Make sure we have a conductor webview instance
    if (!conductorWebview) {
        const context = (global as any).extensionContext;
        conductorWebview = new ConductorChatWebview(context, agentManager, taskQueue);
    }
    
    // Show the conductor webview chat
    await conductorWebview.show();
}

// Legacy terminal-based conductor (kept for backwards compatibility)
async function openConductorChat() {
    // Make sure we have a conductor chat instance
    if (!conductorChat) {
        conductorChat = new ConductorChat(agentManager, taskQueue);
    }
    
    // Start or show the conductor chat
    await conductorChat.start();
}

async function quickStartWithChat(context: vscode.ExtensionContext) {
    // Initialize agent manager if needed (don't show dialog for quick start)
    await agentManager.initialize(false);
    
    // Spawn 3 general purpose agents quickly
    vscode.window.showInformationMessage('🚀 Starting NofX with 3 agents and conductor terminal...');
    
    for (let i = 1; i <= 3; i++) {
        await agentManager.spawnAgent({
            type: 'general',
            name: `Agent-${i}`,
            template: {
                name: `General Agent ${i}`,
                type: 'general',
                specialization: 'Full-Stack Development',
                systemPrompt: 'You are a versatile developer who can handle any task.',
                capabilities: ['Frontend', 'Backend', 'Testing', 'DevOps'],
                icon: '🤖'
            }
        });
    }
    
    // Open conductor terminal instead of chat webview
    if (!conductorTerminal) {
        conductorTerminal = new ConductorTerminal(agentManager, taskQueue);
    }
    await conductorTerminal.start();
}

async function startConductor(context: vscode.ExtensionContext) {
    // Import templates
    const { AGENT_GROUPS, AGENT_TEMPLATES } = await import('./agents/templates');
    
    // Detect project type and recommend team
    const recommendation = await detectProjectType();
    
    // Show team selection with recommendation
    const teamOptions = [
        ...(recommendation ? [{
            label: `$(star-full) Recommended: ${AGENT_GROUPS[recommendation.team]?.name || 'Quick Start'}`,
            description: `Best for your ${recommendation.type} project`,
            value: recommendation.team,
            picked: true
        }] : []),
        {
            label: '$(rocket) Quick Start',
            description: '3 general purpose agents',
            value: 'quick-start'
        },
        ...Object.entries(AGENT_GROUPS).map(([key, group]) => ({
            label: `$(organization) ${group.name}`,
            description: group.description,
            value: key
        })),
        {
            label: '$(add) Custom Selection',
            description: 'Choose individual agents',
            value: 'custom'
        }
    ];
    
    const selected = await vscode.window.showQuickPick(teamOptions, {
        placeHolder: recommendation 
            ? `Detected ${recommendation.type} project - ${recommendation.reason}`
            : 'Select your agent team configuration',
        title: '🎸 NofX Conductor - Choose Your Team'
    });
    
    if (!selected) return;
    
    vscode.window.showInformationMessage('🎼 Starting NofX Conductor...');
    // agentManager is already initialized at extension startup - no need to reinitialize
    
    if (selected.value === 'quick-start') {
        // Start 3 general purpose agents
        currentTeamName = 'Quick Start Team';
        agentProvider.setTeamName(currentTeamName);
        
        for (let i = 1; i <= 3; i++) {
            await agentManager.spawnAgent({
                type: 'general',
                name: `Agent-${i}`,
                template: {
                    name: `General Agent ${i}`,
                    type: 'general',
                    specialization: 'Full-Stack Development',
                    systemPrompt: 'You are a versatile developer who can handle any task.',
                    capabilities: ['Frontend', 'Backend', 'Testing', 'DevOps'],
                    icon: '🤖'
                }
            });
        }
    } else if (selected.value === 'custom') {
        // Let user pick individual agents
        currentTeamName = 'Custom Team';
        agentProvider.setTeamName(currentTeamName);
        
        const agentOptions = Object.entries(AGENT_TEMPLATES).map(([key, template]) => ({
            label: `${template.icon} ${template.name}`,
            description: template.specialization,
            value: key,
            template
        }));
        
        const selectedAgents = await vscode.window.showQuickPick(agentOptions, {
            placeHolder: 'Select agents to spawn (you can select multiple)',
            title: 'Choose Individual Agents',
            canPickMany: true
        });
        
        if (selectedAgents && selectedAgents.length > 0) {
            for (const agent of selectedAgents) {
                await agentManager.spawnAgent({
                    type: agent.template.type,
                    name: agent.template.name,
                    template: agent.template
                });
            }
        }
    } else {
        // Spawn selected team
        const group = AGENT_GROUPS[selected.value];
        if (group) {
            currentTeamName = group.name;
            agentProvider.setTeamName(currentTeamName);
            
            for (const template of group.agents) {
                await agentManager.spawnAgent({
                    type: template.type,
                    name: template.name,
                    template: template
                });
            }
        }
    }
    
    const agentCount = agentManager.getActiveAgents().length;
    
    // Ask user how they want to interact
    const interaction = await vscode.window.showInformationMessage(
        `✅ NofX Conductor started with ${agentCount} agents!`,
        'Open Conductor Chat',
        'Show Dashboard'
    );
    
    if (interaction === 'Open Conductor Chat') {
        // Open the terminal conductor (works better with Claude)
        if (!conductorTerminal) {
            conductorTerminal = new ConductorTerminal(agentManager, taskQueue);
        }
        await conductorTerminal.start();
    } else if (interaction === 'Show Dashboard') {
        // Show the visual dashboard
        showOrchestrator(context);
    }
}

async function addAgent() {
    // Import templates
    const { AGENT_GROUPS, AGENT_TEMPLATES } = await import('./agents/templates');
    
    // First ask: individual agent or team preset?
    const choice = await vscode.window.showQuickPick([
        {
            label: '$(person) Individual Agent',
            description: 'Select a specific agent to add',
            value: 'individual'
        },
        {
            label: '$(organization) Team Preset',
            description: 'Add a pre-configured team of agents',
            value: 'team'
        }
    ], {
        placeHolder: 'Add individual agent or team preset?',
        title: 'Add Agent(s)'
    });
    
    if (!choice) return;
    
    if (choice.value === 'individual') {
        // Show individual agent options
        const agentOptions = Object.entries(AGENT_TEMPLATES).map(([key, template]) => ({
            label: `${template.icon} ${template.name}`,
            description: template.specialization,
            value: key,
            template
        }));
        
        const selectedAgent = await vscode.window.showQuickPick(agentOptions, {
            placeHolder: 'Select agent to add',
            title: 'Choose Agent'
        });
        
        if (selectedAgent) {
            await agentManager.spawnAgent({
                type: selectedAgent.template.type,
                name: selectedAgent.template.name,
                template: selectedAgent.template
            });
            
            vscode.window.showInformationMessage(
                `✅ Spawned ${selectedAgent.template.name}`
            );
        }
    } else {
        // Show team preset options
        const teamOptions = [
            {
                label: '$(rocket) Quick Start Team',
                description: '3 general purpose agents',
                value: 'quick-start'
            },
            ...Object.entries(AGENT_GROUPS).map(([key, group]) => ({
                label: `$(organization) ${group.name}`,
                description: group.description,
                value: key
            }))
        ];
        
        const selectedTeam = await vscode.window.showQuickPick(teamOptions, {
            placeHolder: 'Select team preset',
            title: 'Choose Team'
        });
        
        if (!selectedTeam) return;
        
        if (selectedTeam.value === 'quick-start') {
            // Start 3 general purpose agents
            for (let i = 1; i <= 3; i++) {
                await agentManager.spawnAgent({
                    type: 'general',
                    name: `Agent-${i}`,
                    template: {
                        name: `General Agent ${i}`,
                        type: 'general',
                        specialization: 'Full-Stack Development',
                        systemPrompt: 'You are a versatile developer who can handle any task.',
                        capabilities: ['Frontend', 'Backend', 'Testing', 'DevOps'],
                        icon: '🤖'
                    }
                });
            }
            vscode.window.showInformationMessage('✅ Spawned Quick Start team (3 agents)');
        } else {
            // Spawn selected team
            const group = AGENT_GROUPS[selectedTeam.value];
            if (group) {
                for (const template of group.agents) {
                    await agentManager.spawnAgent({
                        type: template.type,
                        name: template.name,
                        template: template
                    });
                }
                vscode.window.showInformationMessage(`✅ Spawned ${group.name} (${group.agents.length} agents)`);
            }
        }
    }
}

async function completeCurrentTask() {
    const workingAgents = agentManager.getActiveAgents().filter(
        agent => agent.status === 'working'
    );
    
    if (workingAgents.length === 0) {
        vscode.window.showInformationMessage('No agents are currently working on tasks');
        return;
    }
    
    if (workingAgents.length === 1) {
        const agent = workingAgents[0];
        if (agent.currentTask) {
            agentManager.completeTask(agent.id, agent.currentTask);
            vscode.window.showInformationMessage(
                `✅ Marked "${agent.currentTask.title}" as complete`
            );
        }
    } else {
        // Multiple agents working, let user choose
        const items = workingAgents.map(agent => ({
            label: agent.name,
            description: agent.currentTask?.title || 'Unknown task',
            agent
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Which agent\'s task should be marked complete?'
        });
        
        if (selected && selected.agent.currentTask) {
            agentManager.completeTask(selected.agent.id, selected.agent.currentTask);
            vscode.window.showInformationMessage(
                `✅ Marked "${selected.agent.currentTask.title}" as complete`
            );
        }
    }
}

async function createTask() {
    console.log('[NofX] Creating task...');
    
    const title = await vscode.window.showInputBox({
        prompt: 'Task title',
        placeHolder: 'e.g., Add dark mode support'
    });

    if (!title) {
        console.log('[NofX] Task creation cancelled - no title');
        return;
    }
    console.log(`[NofX] Task title: ${title}`);

    const description = await vscode.window.showInputBox({
        prompt: 'Task description',
        placeHolder: 'Detailed description of what needs to be done',
        ignoreFocusOut: true
    });

    if (!description) {
        console.log('[NofX] Task creation cancelled - no description');
        return;
    }
    console.log(`[NofX] Task description: ${description}`);

    const priority = await vscode.window.showQuickPick(
        ['High', 'Medium', 'Low'],
        {
            placeHolder: 'Task priority'
        }
    );
    console.log(`[NofX] Task priority: ${priority || 'medium'}`);

    // Get active agents before creating task
    const activeAgents = agentManager.getActiveAgents();
    const idleAgents = agentManager.getIdleAgents();
    console.log(`[NofX] Active agents: ${activeAgents.length}, Idle agents: ${idleAgents.length}`);
    console.log('[NofX] Agent statuses:', activeAgents.map(a => `${a.name}: ${a.status}`));

    const task = taskQueue.addTask({
        title,
        description,
        priority: (priority?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
        files: getRelevantFiles()
    });
    
    console.log(`[NofX] Task created with ID: ${task.id}`);

    vscode.window.showInformationMessage(
        `📋 Task "${title}" added to queue`
    );

    // Show output channel for debugging
    const outputChannel = vscode.window.createOutputChannel('NofX Debug');
    outputChannel.appendLine(`Task created: ${task.id}`);
    outputChannel.appendLine(`Title: ${title}`);
    outputChannel.appendLine(`Active agents: ${activeAgents.length}`);
    outputChannel.appendLine(`Idle agents: ${idleAgents.length}`);
    outputChannel.show();

    // Auto-assign if enabled
    const config = vscode.workspace.getConfiguration('nofx');
    const autoAssign = config.get('autoAssignTasks');
    console.log(`[NofX] Auto-assign enabled: ${autoAssign}`);
    
    if (autoAssign) {
        console.log('[NofX] Attempting to auto-assign task...');
        const assigned = taskQueue.assignNextTask();
        console.log(`[NofX] Task assignment result: ${assigned}`);
        outputChannel.appendLine(`Auto-assignment result: ${assigned}`);
    } else {
        console.log('[NofX] Auto-assign disabled, task remains in queue');
    }
}

function showOrchestrator(context: vscode.ExtensionContext) {
    // If panel exists and is visible, just reveal it
    if (conductorPanel) {
        try {
            conductorPanel.reveal();
            return;
        } catch (e) {
            // Panel was disposed, create a new one
            conductorPanel = undefined;
        }
    }
    
    // Create new panel
    conductorPanel = EnhancedConductorPanel.create(context, agentManager, taskQueue);
}

async function detectProjectType(): Promise<{ type: string; team: string; reason: string } | null> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return null;
    
    try {
        // Check for common project files
        const files = await vscode.workspace.findFiles('**/{package.json,Cargo.toml,requirements.txt,go.mod,pom.xml,build.gradle,*.csproj,Gemfile,Podfile,pubspec.yaml}', null, 10);
        
        for (const file of files) {
            const content = await vscode.workspace.fs.readFile(file);
            const text = Buffer.from(content).toString('utf-8');
            
            // Check package.json for framework detection
            if (file.path.endsWith('package.json')) {
                const json = JSON.parse(text);
                const deps = { ...json.dependencies, ...json.devDependencies };
                
                if (deps['next'] || deps['next.js']) {
                    return { type: 'Next.js', team: 'fullstack-team', reason: 'Found Next.js in package.json' };
                }
                if (deps['react-native']) {
                    return { type: 'React Native', team: 'mobile-team', reason: 'Found React Native dependencies' };
                }
                if (deps['react'] || deps['vue'] || deps['angular']) {
                    return { type: 'Frontend', team: 'frontend-team', reason: 'Found frontend framework' };
                }
                if (deps['express'] || deps['fastify'] || deps['koa']) {
                    return { type: 'Backend', team: 'backend-team', reason: 'Found backend framework' };
                }
                if (deps['tensorflow'] || deps['@tensorflow/tfjs'] || deps['openai']) {
                    return { type: 'AI/ML', team: 'ai-team', reason: 'Found AI/ML libraries' };
                }
            }
            
            // Python project
            if (file.path.endsWith('requirements.txt')) {
                if (text.includes('tensorflow') || text.includes('torch') || text.includes('openai')) {
                    return { type: 'AI/ML Python', team: 'ai-team', reason: 'Found ML libraries in requirements.txt' };
                }
                if (text.includes('django') || text.includes('flask') || text.includes('fastapi')) {
                    return { type: 'Python Backend', team: 'backend-team', reason: 'Found Python web framework' };
                }
            }
            
            // Mobile projects
            if (file.path.endsWith('Podfile') || file.path.endsWith('pubspec.yaml')) {
                return { type: 'Mobile', team: 'mobile-team', reason: 'Found mobile project files' };
            }
        }
        
        // Default to startup team for general projects
        return { type: 'General', team: 'startup-team', reason: 'General purpose project' };
        
    } catch (error) {
        return null;
    }
}

async function deleteAgent(agentId?: string) {
    const agents = agentManager.getActiveAgents();
    
    if (agents.length === 0) {
        vscode.window.showInformationMessage('No agents are currently running');
        return;
    }
    
    let agent;
    if (agentId) {
        agent = agents.find(a => a.id === agentId);
    } else {
        // Let user select an agent
        const items = agents.map(a => ({
            label: `${a.template?.icon || '🤖'} ${a.name}`,
            description: `${a.template?.specialization || a.type} - ${a.status}`,
            agent: a
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select agent to delete'
        });
        
        if (selected) {
            agent = selected.agent;
        }
    }
    
    if (!agent) return;
    
    // Confirm deletion
    const confirm = await vscode.window.showWarningMessage(
        `Delete agent ${agent.name}?`,
        { modal: true },
        'Delete'
    );
    
    if (confirm === 'Delete') {
        agentManager.removeAgent(agent.id);
        vscode.window.showInformationMessage(`Agent ${agent.name} deleted`);
    }
}

async function editAgent(agentId?: string) {
    const agents = agentManager.getActiveAgents();
    
    if (agents.length === 0) {
        vscode.window.showInformationMessage('No agents are currently running');
        return;
    }
    
    let agent;
    if (agentId) {
        agent = agents.find(a => a.id === agentId);
    } else {
        // Let user select an agent
        const items = agents.map(a => ({
            label: `${a.template?.icon || '🤖'} ${a.name}`,
            description: `${a.template?.specialization || a.type} - ${a.status}`,
            agent: a
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select agent to edit'
        });
        
        if (selected) {
            agent = selected.agent;
        }
    }
    
    if (!agent) return;
    
    // Create a new document showing agent details
    const content = `# Agent: ${agent.name}

## Type
${agent.template?.type || agent.type}

## Specialization
${agent.template?.specialization || 'General Purpose'}

## Capabilities
${agent.template?.capabilities?.join(', ') || 'All'}

## Status
${agent.status}${agent.currentTask ? ` - Working on: ${agent.currentTask.title}` : ''}

## System Prompt
\`\`\`
${agent.template?.systemPrompt || 'No specific system prompt configured'}
\`\`\`

## Terminal
To interact with this agent, switch to the terminal named: "${agent.name}"

## Commands
- To give this agent a new task, create a task in the task queue
- To stop this agent, close its terminal
- To modify the prompt, edit the template in src/agents/templates.ts
`;
    
    const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'markdown'
    });
    
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    
    // Also show the terminal
    const terminal = agentManager.getAgentTerminal(agent.id);
    if (terminal) {
        terminal.show();
    }
}

async function focusAgentTerminal(agentId?: string) {
    const agents = agentManager.getActiveAgents();
    
    if (agents.length === 0) {
        vscode.window.showInformationMessage('No agents are currently running');
        return;
    }
    
    let agent;
    if (agentId) {
        agent = agents.find(a => a.id === agentId);
    } else {
        // Let user select an agent
        const items = agents.map(a => ({
            label: `${a.template?.icon || '🤖'} ${a.name}`,
            description: `${a.template?.specialization || a.type} - ${a.status}`,
            agent: a
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select agent terminal to focus'
        });
        
        if (selected) {
            agent = selected.agent;
        }
    }
    
    if (!agent) return;
    
    // Show the agent's terminal
    const terminal = agentManager.getAgentTerminal(agent.id);
    if (terminal) {
        terminal.show();
    } else {
        vscode.window.showWarningMessage(`Terminal for ${agent.name} not found`);
    }
}

async function testClaudeCommand() {
    const terminal = vscode.window.createTerminal('Claude Test');
    terminal.show();
    
    const claudePath = vscode.workspace.getConfiguration('nofx').get<string>('claudePath') || 'claude';
    const commandStyle = vscode.workspace.getConfiguration('nofx').get<string>('claudeCommandStyle') || 'simple';
    
    terminal.sendText('clear');
    terminal.sendText('echo "=== Testing Claude Command ==="');
    terminal.sendText(`echo "Using command: ${claudePath}"`);
    terminal.sendText(`echo "Using style: ${commandStyle}"`);
    terminal.sendText('echo ""');
    
    const testPrompt = 'Write a simple hello world function in JavaScript';
    
    switch(commandStyle) {
        case 'simple':
            terminal.sendText(`echo '${testPrompt}' | ${claudePath}`);
            break;
        case 'interactive':
            terminal.sendText(claudePath);
            setTimeout(() => terminal.sendText(testPrompt), 2000);
            break;
        case 'heredoc':
            terminal.sendText(`${claudePath} << 'EOF'`);
            terminal.sendText(testPrompt);
            terminal.sendText('EOF');
            break;
        case 'file':
            const tempFile = '/tmp/nofx-test.txt';
            terminal.sendText(`echo '${testPrompt}' > ${tempFile}`);
            setTimeout(() => {
                terminal.sendText(`${claudePath} < ${tempFile}`);
                setTimeout(() => terminal.sendText(`rm ${tempFile}`), 3000);
            }, 500);
            break;
    }
    
    vscode.window.showInformationMessage(
        `Testing Claude with ${commandStyle} style. Check terminal for output.`
    );
}

function getRelevantFiles(): string[] {
    // Get currently open files as context
    const files: string[] = [];
    vscode.window.visibleTextEditors.forEach(editor => {
        if (editor.document.uri.scheme === 'file') {
            files.push(editor.document.uri.fsPath);
        }
    });
    return files;
}

/**
 * Set up handlers for orchestration messages
 */
function setupOrchestrationHandlers() {
    if (!orchestrationServer) return;
    
    // Listen for agent spawn commands
    const wsServer = (orchestrationServer as any).wss;
    if (!wsServer) return;
    
    wsServer.on('connection', (ws: any) => {
        ws.on('message', async (data: string) => {
            try {
                const message = JSON.parse(data);
                
                // Handle spawn agent commands from conductor
                if (message.type === MessageType.SPAWN_AGENT && message.from === 'conductor') {
                    const { role, name, template } = message.payload;
                    
                    // Find the template
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder) {
                        const { AgentTemplateManager } = await import('./agents/AgentTemplateManager');
                        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
                        const templates = await templateManager.getTemplates();
                        const selectedTemplate = templates.find(t => t.id === role || t.name.toLowerCase().includes(role));
                        
                        if (selectedTemplate) {
                            // Spawn the agent
                            const agent = await agentManager.spawnAgent({
                                type: role,
                                name: name || `${role}-agent`,
                                template: selectedTemplate
                            });
                            
                            // Send confirmation back
                            const confirmMessage = {
                                id: Date.now().toString(),
                                timestamp: new Date().toISOString(),
                                from: 'system',
                                to: 'conductor',
                                type: MessageType.AGENT_READY,
                                payload: {
                                    agentId: agent.id,
                                    name: agent.name,
                                    role: agent.type
                                }
                            };
                            
                            ws.send(JSON.stringify(confirmMessage));
                        }
                    }
                }
                
                // Handle task assignment
                if (message.type === MessageType.ASSIGN_TASK && message.from === 'conductor') {
                    const { agentId, taskId, title, description, priority } = message.payload;
                    
                    // Create and assign task
                    const task = {
                        id: taskId,
                        title,
                        description,
                        priority,
                        agentId,
                        status: 'pending' as const
                    };
                    
                    taskQueue.addTask(task);
                    
                    // Send confirmation
                    const confirmMessage = {
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        from: 'system',
                        to: 'conductor',
                        type: MessageType.TASK_ACCEPTED,
                        payload: { taskId, agentId }
                    };
                    
                    ws.send(JSON.stringify(confirmMessage));
                }
                
                // Handle status query
                if (message.type === MessageType.QUERY_STATUS) {
                    const agents = agentManager.getActiveAgents();
                    const statusMessage = {
                        id: Date.now().toString(),
                        timestamp: new Date().toISOString(),
                        from: 'system',
                        to: message.from,
                        type: MessageType.AGENT_STATUS,
                        payload: {
                            agents: agents.map(a => ({
                                agentId: a.id,
                                name: a.name,
                                status: a.status,
                                currentTask: a.currentTask,
                                completedTasks: a.tasksCompleted
                            }))
                        }
                    };
                    
                    ws.send(JSON.stringify(statusMessage));
                }
                
            } catch (error) {
                console.error('Error handling orchestration message:', error);
            }
        });
    });
}

export function deactivate() {
    // Stop orchestration server
    if (orchestrationServer) {
        orchestrationServer.stop();
    }
    
    // Clean up agents
    if (agentManager) {
        agentManager.dispose();
    }
    
    // Close conductor panel
    if (conductorPanel) {
        conductorPanel.dispose();
    }
}

/**
 * Reset NofX to clean state
 */
async function resetNofX() {
    const answer = await vscode.window.showWarningMessage(
        'This will reset NofX completely: stop all agents, clear persistence, and restart the orchestration server. Continue?',
        'Yes, Reset',
        'Cancel'
    );
    
    if (answer !== 'Yes, Reset') {
        return;
    }
    
    vscode.window.showInformationMessage('Resetting NofX...');
    
    try {
        // Stop orchestration server
        if (orchestrationServer) {
            orchestrationServer.stop();
            orchestrationServer = undefined;
        }
        
        // Clean up agents
        if (agentManager) {
            const agents = agentManager.getActiveAgents();
            for (const agent of agents) {
                await agentManager.removeAgent(agent.id);
            }
            agentManager.dispose();
        }
        
        // Clear conductor chat
        // Note: conductorChatWebview is created on demand, not stored globally
        
        // Clear message flow dashboard
        if (messageFlowDashboard) {
            // MessageFlowDashboard doesn't have dispose yet, just clear reference
            messageFlowDashboard = undefined;
        }
        
        // Clear persistence
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const { AgentPersistence } = await import('./persistence/AgentPersistence');
            const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
            // Clear persistence files
            await persistence.saveAgentState([]);
            await persistence.cleanup();
        }
        
        // Re-initialize managers
        agentManager = new AgentManager(extensionContext);
        taskQueue = new TaskQueue(agentManager);
        
        // Restart orchestration server
        orchestrationServer = new OrchestrationServer();
        await orchestrationServer.start().catch(error => {
            console.error('Failed to restart orchestration server:', error);
        });
        
        // Update tree views
        // agentProvider is not in scope here, need to refresh via command
        vscode.commands.executeCommand('workbench.action.reloadWindow');
        
        vscode.window.showInformationMessage('🎸 NofX has been reset successfully!');
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to reset NofX: ${error.message}`);
    }
}