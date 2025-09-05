import * as vscode from 'vscode';

// Core services
import { Container } from './services/Container';
import { SERVICE_TOKENS, IContainer, CONFIG_KEYS, ILoggingService, IEventBus, ITaskStateMachine, IMessagePersistenceService } from './services/interfaces';
import { DOMAIN_EVENTS } from './services/EventConstants';
import { ConfigurationService } from './services/ConfigurationService';
import { ConfigurationValidator } from './services/ConfigurationValidator';
import { MetricsService } from './services/MetricsService';
import { NotificationService } from './services/NotificationService';
import { LoggingService } from './services/LoggingService';
import { EventBus } from './services/EventBus';
import { ErrorHandler } from './services/ErrorHandler';
import { CommandService } from './services/CommandService';
import { TerminalManager } from './services/TerminalManager';
import { WorktreeService } from './services/WorktreeService';
import { AgentLifecycleManager } from './services/AgentLifecycleManager';

// Business logic
import { AgentManager } from './agents/AgentManager';
import { TaskQueue } from './tasks/TaskQueue';
import { TaskStateMachine } from './tasks/TaskStateMachine';
import { PriorityTaskQueue } from './tasks/PriorityTaskQueue';
import { CapabilityMatcher } from './tasks/CapabilityMatcher';
import { TaskDependencyManager } from './tasks/TaskDependencyManager';
import { priorityToNumeric } from './tasks/priority';
import { OrchestrationServer } from './orchestration/OrchestrationServer';
import { ConnectionPoolService } from './services/ConnectionPoolService';
import { MessageRouter } from './services/MessageRouter';
import { MessageValidator } from './services/MessageValidator';
import { MessagePersistenceService } from './services/MessagePersistenceService';
import { InMemoryMessagePersistenceService } from './services/InMemoryMessagePersistenceService';
import { MessageFlowDashboard } from './dashboard/MessageFlowDashboard';
import { MessageType, OrchestratorMessage } from './orchestration/MessageProtocol';
import { AgentPersistence } from './persistence/AgentPersistence';
import { WorktreeManager } from './worktrees/WorktreeManager';

// Views
import { AgentTreeProvider } from './views/AgentTreeProvider';
import { TaskTreeProvider } from './views/TaskTreeProvider';
import { NofxDevTreeProvider } from './views/NofxDevTreeProvider';
import { NofxTerminalProvider } from './views/NofxTerminalProvider';

// UI Services
import { UIStateManager } from './services/UIStateManager';
import { TreeStateManager } from './services/TreeStateManager';
import { ConductorViewModel } from './viewModels/ConductorViewModel';
import { DashboardViewModel } from './viewModels/DashboardViewModel';
import { TreeViewHost } from './ui/TreeViewHost';

// Command handlers
import { AgentCommands } from './commands/AgentCommands';
import { TaskCommands } from './commands/TaskCommands';
import { ConductorCommands } from './commands/ConductorCommands';
import { OrchestrationCommands } from './commands/OrchestrationCommands';
import { PersistenceCommands } from './commands/PersistenceCommands';
import { TemplateCommands } from './commands/TemplateCommands';
import { WorktreeCommands } from './commands/WorktreeCommands';
import { UtilityCommands } from './commands/UtilityCommands';

// Global container for dependency injection
let container: IContainer;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize dependency injection container
    container = new Container();
    
    // Register core services
    container.registerInstance(SERVICE_TOKENS.ExtensionContext, context);
    
    const outputChannel = vscode.window.createOutputChannel('NofX');
    container.registerInstance(SERVICE_TOKENS.OutputChannel, outputChannel);
    
    // Register foundational services first (in dependency order)
    container.register(SERVICE_TOKENS.LoggingService, 
        (container) => new LoggingService(
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.OutputChannel)
        ), 'singleton');
    container.register(SERVICE_TOKENS.EventBus, 
        (container) => new EventBus(container.resolveOptional(SERVICE_TOKENS.LoggingService)), 'singleton');
    container.register(SERVICE_TOKENS.NotificationService, 
        () => new NotificationService(), 'singleton');
    
    // Register validation service (depends on LoggingService and NotificationService)
    container.register(SERVICE_TOKENS.ConfigurationValidator, 
        (container) => new ConfigurationValidator(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.NotificationService)
        ), 'singleton');
    
    // Register configuration service (depends on ConfigurationValidator and EventBus)
    container.register(SERVICE_TOKENS.ConfigurationService, 
        (container) => new ConfigurationService(
            container.resolve(SERVICE_TOKENS.ConfigurationValidator),
            container.resolve(SERVICE_TOKENS.EventBus)
        ), 'singleton');
    
    // Register metrics service (depends on ConfigurationService, LoggingService, EventBus)
    container.register(SERVICE_TOKENS.MetricsService, 
        (container) => new MetricsService(
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus)
        ), 'singleton');
    container.register(SERVICE_TOKENS.ErrorHandler, 
        (container) => new ErrorHandler(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.NotificationService)
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.CommandService, 
        (container) => new CommandService(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');
    
    // Get logging service for use in activation
    const loggingService = container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
    const errorHandler = container.resolve(SERVICE_TOKENS.ErrorHandler);
    
    // Set logging service on container for future operations
    container.setLoggingService(loggingService);
    
    loggingService.info('🎸 n of x Multi-Agent Orchestrator is now active!');
    
    // Register new services
    container.register(SERVICE_TOKENS.TerminalManager, 
        (container) => new TerminalManager(
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');
    container.register(SERVICE_TOKENS.WorktreeService, 
        (container) => new WorktreeService(
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.NotificationService),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');
    
    // Get workspace folder once
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Register WorktreeManager and AgentPersistence
    if (workspaceFolder) {
        const worktreeManager = new WorktreeManager(workspaceFolder.uri.fsPath);
        container.registerInstance(SERVICE_TOKENS.WorktreeManager, worktreeManager);
        
        // Register AgentPersistence
        const agentPersistence = new AgentPersistence(workspaceFolder.uri.fsPath);
        container.registerInstance(SERVICE_TOKENS.AgentPersistence, agentPersistence);
    }
    
    // Register business services
    const agentManager = new AgentManager(context);
    container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);
    
    // Register AgentLifecycleManager with callback to AgentManager
    container.register(SERVICE_TOKENS.AgentLifecycleManager, 
        (container) => new AgentLifecycleManager(
            container.resolve(SERVICE_TOKENS.TerminalManager),
            container.resolve(SERVICE_TOKENS.WorktreeService),
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.NotificationService),
            container.resolveOptional(SERVICE_TOKENS.AgentPersistence),
            () => {
                // Callback for agent updates
                (agentManager as any)._onAgentUpdate.fire();
            },
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');
    
    // Set the dependencies in AgentManager after registration
    agentManager.setDependencies(
        container.resolve(SERVICE_TOKENS.AgentLifecycleManager),
        container.resolve(SERVICE_TOKENS.TerminalManager),
        container.resolve(SERVICE_TOKENS.WorktreeService),
        container.resolve(SERVICE_TOKENS.ConfigurationService),
        container.resolve(SERVICE_TOKENS.NotificationService),
        container.resolve(SERVICE_TOKENS.LoggingService),
        container.resolve(SERVICE_TOKENS.EventBus),
        container.resolve(SERVICE_TOKENS.ErrorHandler),
        container.resolve(SERVICE_TOKENS.MetricsService)
    );
    
    // Register new task management services
    container.register(SERVICE_TOKENS.TaskStateMachine, 
        (container) => new TaskStateMachine(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolveOptional(SERVICE_TOKENS.TaskQueue) // Optional to avoid circular dependency during initial registration
        ), 'singleton');
    
    // Register TaskDependencyManager BEFORE PriorityTaskQueue to ensure it's available
    container.register(SERVICE_TOKENS.TaskDependencyManager, 
        (container) => new TaskDependencyManager(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.NotificationService)
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.PriorityTaskQueue, 
        (container) => new PriorityTaskQueue(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.TaskDependencyManager)
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.CapabilityMatcher, 
        (container) => new CapabilityMatcher(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.ConfigurationService)
        ), 'singleton');

    const taskQueue = new TaskQueue(
        agentManager,
        container.resolve(SERVICE_TOKENS.LoggingService),
        container.resolve(SERVICE_TOKENS.EventBus),
        container.resolve(SERVICE_TOKENS.ErrorHandler),
        container.resolve(SERVICE_TOKENS.NotificationService),
        container.resolve(SERVICE_TOKENS.ConfigurationService),
        container.resolve(SERVICE_TOKENS.TaskStateMachine),
        container.resolve(SERVICE_TOKENS.PriorityTaskQueue),
        container.resolve(SERVICE_TOKENS.CapabilityMatcher),
        container.resolve(SERVICE_TOKENS.TaskDependencyManager),
        container.resolve(SERVICE_TOKENS.MetricsService)
    );
    container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);
    
    // Inject TaskQueue into TaskStateMachine for dependency validation
    const taskStateMachine = container.resolve<ITaskStateMachine>(SERVICE_TOKENS.TaskStateMachine);
    taskStateMachine.setTaskReader(taskQueue);
    
    // Initialize agent manager (this will check for saved agents)
    await agentManager.initialize();
    
    // Migrate existing tasks to normalize new fields
    await migrateExistingTasks(taskQueue, loggingService);
    
    // Set initial context for UI
    vscode.commands.executeCommand('setContext', 'nofx.hasAgents', agentManager.getActiveAgents().length > 0);
    
    // Register orchestration services
    container.register(SERVICE_TOKENS.ConnectionPoolService, 
        (container) => new ConnectionPoolService(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.ErrorHandler),
            container.resolve(SERVICE_TOKENS.ConfigurationService)
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.MessageValidator, 
        (container) => new MessageValidator(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus)
        ), 'singleton');
    
    // Register MessagePersistenceService with workspace path or use in-memory fallback
    let messagePersistence: IMessagePersistenceService;
    
    if (workspaceFolder) {
        messagePersistence = new MessagePersistenceService(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.EventBus),
            workspaceFolder.uri.fsPath
        );
    } else {
        messagePersistence = new InMemoryMessagePersistenceService(
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.EventBus)
        );
    }
    
    container.registerInstance(SERVICE_TOKENS.MessagePersistenceService, messagePersistence);
    
    container.register(SERVICE_TOKENS.MessageRouter, 
        (container) => new MessageRouter(
            container.resolve(SERVICE_TOKENS.ConnectionPoolService),
            container.resolve(SERVICE_TOKENS.MessagePersistenceService),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.ErrorHandler),
            container.resolve(SERVICE_TOKENS.AgentManager),
            container.resolve(SERVICE_TOKENS.TaskQueue)
        ), 'singleton');
    
    // Start orchestration server with new services
    const orchestrationServer = new OrchestrationServer(
        7777,
        container.resolve(SERVICE_TOKENS.LoggingService),
        container.resolve(SERVICE_TOKENS.EventBus),
        container.resolve(SERVICE_TOKENS.ErrorHandler),
        container.resolve(SERVICE_TOKENS.ConnectionPoolService),
        container.resolve(SERVICE_TOKENS.MessageRouter),
        container.resolve(SERVICE_TOKENS.MessageValidator),
        container.resolve(SERVICE_TOKENS.MessagePersistenceService),
        container.resolve(SERVICE_TOKENS.MetricsService)
    );
    await orchestrationServer.start();
    container.registerInstance(SERVICE_TOKENS.OrchestrationServer, orchestrationServer);
    
    // Register UI services
    container.register(SERVICE_TOKENS.UIStateManager, 
        (container) => new UIStateManager(
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.AgentManager), // Now implements IAgentReader
            container.resolve(SERVICE_TOKENS.TaskQueue)     // Now implements ITaskReader
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.TreeStateManager, 
        (container) => new TreeStateManager(
            container.resolve(SERVICE_TOKENS.UIStateManager),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.LoggingService)
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.ConductorViewModel, 
        (container) => new ConductorViewModel(
            container.resolve(SERVICE_TOKENS.UIStateManager),
            container.resolve(SERVICE_TOKENS.CommandService),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.NotificationService)
        ), 'singleton');
    
    container.register(SERVICE_TOKENS.DashboardViewModel, 
        (container) => new DashboardViewModel(
            container.resolve(SERVICE_TOKENS.UIStateManager),
            container.resolve(SERVICE_TOKENS.OrchestrationServer),
            container.resolve(SERVICE_TOKENS.EventBus),
            container.resolve(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.MessagePersistenceService),
            container.resolve(SERVICE_TOKENS.ConnectionPoolService)
        ), 'singleton');

    // Register message flow dashboard
    const messageFlowDashboard = new MessageFlowDashboard(
        context,
        container.resolve(SERVICE_TOKENS.DashboardViewModel),
        container.resolve(SERVICE_TOKENS.LoggingService)
    );
    container.registerInstance(SERVICE_TOKENS.MessageFlowDashboard, messageFlowDashboard);
    
    // Message handling is now done through MessageRouter

    // Register tree data providers for sidebar views
    const nofxDevProvider = new NofxDevTreeProvider();
    const agentProvider = new AgentTreeProvider(
        container.resolve(SERVICE_TOKENS.TreeStateManager),
        container.resolve(SERVICE_TOKENS.UIStateManager)
    );
    const taskProvider = new TaskTreeProvider(
        container.resolve(SERVICE_TOKENS.UIStateManager),
        container
    );
    
    vscode.window.registerTreeDataProvider('nofx.dev', nofxDevProvider);
    vscode.window.registerTreeDataProvider('nofx.agents', agentProvider);
    
    // Register task tree with drag and drop support
    const taskTreeView = vscode.window.createTreeView('nofx.tasks', {
        treeDataProvider: taskProvider,
        dragAndDropController: taskProvider.getDragAndDropController(),
        showCollapseAll: true
    });
    context.subscriptions.push(taskTreeView);
    
    const agentTreeView = vscode.window.createTreeView('nofx.agents', {
        treeDataProvider: agentProvider,
        showCollapseAll: true
    });
    
    // Create TreeViewHost for the agents tree view
    const agentTreeViewHost = TreeViewHost.create(agentTreeView, agentProvider, loggingService);
    container.registerInstance(SERVICE_TOKENS.AgentTreeViewHost, agentTreeViewHost);
    
    // Hook into expand/collapse events to update TreeStateManager
    const treeStateManager = container.resolve(SERVICE_TOKENS.TreeStateManager);
    context.subscriptions.push(
        agentTreeView.onDidExpandElement((e) => {
            const element = e.element;
            if (element && element.contextValue === 'teamSection') {
                treeStateManager.toggleSection('teamSection');
            }
        }),
        agentTreeView.onDidCollapseElement((e) => {
            const element = e.element;
            if (element && element.contextValue === 'teamSection') {
                treeStateManager.toggleSection('teamSection');
            }
        })
    );
    
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

    // Register command handlers
    const agentCommands = new AgentCommands(container);
    agentCommands.register();
    
    const taskCommands = new TaskCommands(container);
    taskCommands.register();
    
    const conductorCommands = new ConductorCommands(container);
    conductorCommands.setAgentProvider(agentProvider);
    conductorCommands.register();
    
    const orchestrationCommands = new OrchestrationCommands(container);
    orchestrationCommands.setOrchestrationServer(orchestrationServer);
    orchestrationCommands.register();
    
    const persistenceCommands = new PersistenceCommands(container);
    persistenceCommands.register();
    
    const templateCommands = new TemplateCommands(container);
    templateCommands.register();
    
    const worktreeCommands = new WorktreeCommands(container);
    worktreeCommands.register();
    
    const utilityCommands = new UtilityCommands(container);
    utilityCommands.register();
    
    // Register metrics commands
    const metricsCommands = new (require('./commands/MetricsCommands').MetricsCommands)(container);
    metricsCommands.register();
    
    // Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(organization) NofX';
    statusBarItem.tooltip = 'Multi-Agent Orchestrator';
    statusBarItem.command = 'nofx.showOrchestrator';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    container.registerInstance(SERVICE_TOKENS.StatusBarItem, statusBarItem);

    // Update status bar with task statistics
    const updateStatusBar = () => {
        const taskStats = taskQueue.getTaskStats();
        const agentStats = agentManager.getAgentStats();
        
        let statusText = '$(organization) NofX';
        if (taskStats.total > 0) {
            statusText += ` | 📋 ${taskStats.ready} ready, ${taskStats.inProgress} active`;
            if (taskStats.blocked > 0) {
                statusText += `, 🔴 ${taskStats.blocked} blocked`;
            }
        }
        if (agentStats.total > 0) {
            statusText += ` | 🤖 ${agentStats.idle} idle, ${agentStats.working} working`;
        }
        
        statusBarItem.text = statusText;
    };

    // Subscribe to task and agent updates
    const eventBus = container.resolve(SERVICE_TOKENS.EventBus) as IEventBus;
    eventBus.subscribe(DOMAIN_EVENTS.TASK_CREATED, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.TASK_BLOCKED, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.TASK_READY, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.AGENT_CREATED, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.AGENT_REMOVED, updateStatusBar);
    eventBus.subscribe(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, updateStatusBar);
    
    // Initial update
    updateStatusBar();

    // Auto-start if configured
    const config = container.resolve<ConfigurationService>(SERVICE_TOKENS.ConfigurationService);
    if (config.get(CONFIG_KEYS.AUTO_START, false)) {
        await vscode.commands.executeCommand('nofx.quickStartChat');
    }

    // Record activation metrics
    const metricsService = container.resolve(SERVICE_TOKENS.MetricsService);
    const activationTimer = metricsService.startTimer('extension.activation');
    metricsService.incrementCounter('extension.activated');
    metricsService.setGauge('extension.services.registered', 25); // Approximate count
    metricsService.endTimer(activationTimer);

    // Validate configuration during startup
    const configValidator = container.resolve(SERVICE_TOKENS.ConfigurationValidator);
    const validationResult = configValidator.validateConfiguration(config.getAll());
    if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map(e => `${e.field}: ${e.message}`).join('; ');
        loggingService.warn('Configuration validation issues detected', { errors: validationResult.errors });
        
        // Show notification for critical errors
        const criticalErrors = validationResult.errors.filter(e => e.severity === 'error');
        if (criticalErrors.length > 0) {
            const notificationService = container.resolve(SERVICE_TOKENS.NotificationService);
            await notificationService.showWarning(
                `Configuration validation failed: ${errorMessages}. Some features may not work correctly.`
            );
        }
    }

    // Record agent restoration metrics
    const agentCount = agentManager.getActiveAgents().length;
    if (agentCount > 0) {
        metricsService.incrementCounter('agents.restored', { count: agentCount.toString() });
        metricsService.setGauge('agents.active.count', agentCount);
    }

    // Record task restoration metrics
    const taskCount = taskQueue.getTasks().length;
    if (taskCount > 0) {
        metricsService.incrementCounter('tasks.restored', { count: taskCount.toString() });
        metricsService.setGauge('tasks.total.count', taskCount);
    }

    loggingService.info('🎸 NofX Multi-Agent Orchestrator activation completed with metrics and validation');

    // Note: Global context removed - use dependency injection instead
}

/**
 * Migrates existing tasks to normalize new fields
 */
async function migrateExistingTasks(taskQueue: TaskQueue, loggingService: ILoggingService): Promise<void> {
    try {
        const allTasks = taskQueue.getTasks();
        let migratedCount = 0;

        for (const task of allTasks) {
            let needsUpdate = false;

            // Ensure numericPriority is set
            if (task.numericPriority === undefined) {
                task.numericPriority = priorityToNumeric(task.priority);
                needsUpdate = true;
            }

            // Ensure conflictsWith is initialized
            if (task.conflictsWith === undefined) {
                task.conflictsWith = [];
                needsUpdate = true;
            }

            // Ensure blockedBy is initialized
            if (task.blockedBy === undefined) {
                task.blockedBy = [];
                needsUpdate = true;
            }

            // Ensure dependsOn is initialized
            if (task.dependsOn === undefined) {
                task.dependsOn = [];
                needsUpdate = true;
            }

            // Ensure tags is initialized
            if (task.tags === undefined) {
                task.tags = [];
                needsUpdate = true;
            }

            // Ensure requiredCapabilities is initialized
            if (task.requiredCapabilities === undefined) {
                task.requiredCapabilities = [];
                needsUpdate = true;
            }

            if (needsUpdate) {
                migratedCount++;
                loggingService.debug(`Migrated task ${task.id} with new fields`);
            }
        }

        if (migratedCount > 0) {
            loggingService.info(`Migrated ${migratedCount} existing tasks with new field defaults`);
        }
    } catch (error) {
        loggingService.error('Error during task migration:', error);
    }
}


export function deactivate() {
    // Get logging service for deactivation logging
    const loggingService = container?.resolveOptional<ILoggingService>(SERVICE_TOKENS.LoggingService);
    if (loggingService) {
        loggingService.info('NofX extension deactivating...');
    }
    
    // Stop orchestration server and services
    const orchestrationServer = container?.resolveOptional<OrchestrationServer>(SERVICE_TOKENS.OrchestrationServer);
    if (orchestrationServer) {
        orchestrationServer.stop();
    }
    
    // Dispose orchestration services
    const connectionPool = container?.resolveOptional(SERVICE_TOKENS.ConnectionPoolService);
    if (connectionPool && 'dispose' in connectionPool) {
        connectionPool.dispose();
    }
    
    const messageRouter = container?.resolveOptional(SERVICE_TOKENS.MessageRouter);
    if (messageRouter && 'dispose' in messageRouter) {
        messageRouter.dispose();
    }
    
    const messageValidator = container?.resolveOptional(SERVICE_TOKENS.MessageValidator);
    if (messageValidator && 'dispose' in messageValidator) {
        messageValidator.dispose();
    }
    
    const messagePersistence = container?.resolveOptional(SERVICE_TOKENS.MessagePersistenceService);
    if (messagePersistence && 'dispose' in messagePersistence) {
        messagePersistence.dispose();
    }
    
    // Dispose container and all services
    if (container) {
        container.dispose();
    }
    
    if (loggingService) {
        loggingService.info('NofX extension deactivated');
    }
}
