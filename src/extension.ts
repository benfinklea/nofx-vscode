import * as vscode from 'vscode';

// Core services
import { Container } from './services/Container';
import {
    SERVICE_TOKENS,
    IContainer,
    CONFIG_KEYS,
    ILoggingService,
    IEventBus,
    ITaskStateMachine,
    IMessagePersistenceService,
    INotificationService,
    IConfigurationService,
    IErrorHandler,
    IMetricsService,
    ICommandService,
    ITreeStateManager,
    ValidationError
} from './services/interfaces';
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
import { MetricsCommands } from './commands/MetricsCommands';

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
    container.register(SERVICE_TOKENS.EventBus,
        (container) => new EventBus(container.resolveOptional(SERVICE_TOKENS.LoggingService)), 'singleton');
    container.register(SERVICE_TOKENS.NotificationService,
        () => new NotificationService(), 'singleton');

    // Register validation service first (no dependencies)
    container.register(SERVICE_TOKENS.ConfigurationValidator,
        (container) => new ConfigurationValidator(
            container.resolveOptional(SERVICE_TOKENS.LoggingService),
            container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService)
        ), 'singleton');

    // Register configuration service (depends on ConfigurationValidator and EventBus)
    container.register(SERVICE_TOKENS.ConfigurationService,
        (container) => new ConfigurationService(
            container.resolve(SERVICE_TOKENS.ConfigurationValidator),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus)
        ), 'singleton');

    // Register LoggingService after ConfigurationService (depends on ConfigurationService)
    container.register(SERVICE_TOKENS.LoggingService,
        (container) => new LoggingService(
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve(SERVICE_TOKENS.OutputChannel)
        ), 'singleton');

    // Register metrics service (depends on ConfigurationService, LoggingService, EventBus)
    container.register(SERVICE_TOKENS.MetricsService,
        (container) => new MetricsService(
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus)
        ), 'singleton');
    container.register(SERVICE_TOKENS.ErrorHandler,
        (container) => new ErrorHandler(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService)
        ), 'singleton');

    container.register(SERVICE_TOKENS.CommandService,
        (container) => new CommandService(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');

    // Get logging service for use in activation
    const loggingService = container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService);
    const errorHandler = container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler);

    // Set logging service on container for future operations
    container.setLoggingService(loggingService);

    // Set logging service on EventBus to enable debug event logging
    const eventBus = container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
    eventBus.setLoggingService(loggingService);

    loggingService.info('🎸 n of x Multi-Agent Orchestrator is now active!');

    // Get workspace folder once
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    // Register WorktreeManager and AgentPersistence BEFORE WorktreeService
    if (workspaceFolder) {
        const worktreeManager = new WorktreeManager(workspaceFolder.uri.fsPath, loggingService, container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService));
        container.registerInstance(SERVICE_TOKENS.WorktreeManager, worktreeManager);

        // Register AgentPersistence
        const agentPersistence = new AgentPersistence(workspaceFolder.uri.fsPath, loggingService);
        container.registerInstance(SERVICE_TOKENS.AgentPersistence, agentPersistence);
    }

    // Register new services
    container.register(SERVICE_TOKENS.TerminalManager,
        (container) => new TerminalManager(
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');
    container.register(SERVICE_TOKENS.WorktreeService,
        (container) => new WorktreeService(
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService),
            container.resolve(SERVICE_TOKENS.WorktreeManager),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');

    // Register business services
    const agentManager = new AgentManager(context, container.resolveOptional(SERVICE_TOKENS.AgentPersistence));
    container.registerInstance(SERVICE_TOKENS.AgentManager, agentManager);

    // Register AgentLifecycleManager with callback to AgentManager
    container.register(SERVICE_TOKENS.AgentLifecycleManager,
        (container) => new AgentLifecycleManager(
            container.resolve(SERVICE_TOKENS.TerminalManager),
            container.resolve(SERVICE_TOKENS.WorktreeService),
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService),
            () => {
                // Callback for agent updates
                agentManager.notifyAgentUpdated();
            },
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler)
        ), 'singleton');

    // Set the dependencies in AgentManager after registration
    agentManager.setDependencies(
        container.resolve(SERVICE_TOKENS.AgentLifecycleManager),
        container.resolve(SERVICE_TOKENS.TerminalManager),
        container.resolve(SERVICE_TOKENS.WorktreeService),
        container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
        container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService),
        container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
        container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
        container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler),
        container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService)
    );

    // Register new task management services
    container.register(SERVICE_TOKENS.TaskStateMachine,
        (container) => new TaskStateMachine(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolveOptional(SERVICE_TOKENS.TaskQueue) // Optional to avoid circular dependency during initial registration
        ), 'singleton');

    // Register TaskDependencyManager BEFORE PriorityTaskQueue to ensure it's available
    container.register(SERVICE_TOKENS.TaskDependencyManager,
        (container) => new TaskDependencyManager(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService)
        ), 'singleton');

    container.register(SERVICE_TOKENS.PriorityTaskQueue,
        (container) => new PriorityTaskQueue(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.TaskDependencyManager)
        ), 'singleton');

    container.register(SERVICE_TOKENS.CapabilityMatcher,
        (container) => new CapabilityMatcher(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService)
        ), 'singleton');

    const taskQueue = new TaskQueue(
        agentManager,
        container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
        container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
        container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler),
        container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService),
        container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
        container.resolve(SERVICE_TOKENS.TaskStateMachine),
        container.resolve(SERVICE_TOKENS.PriorityTaskQueue),
        container.resolve(SERVICE_TOKENS.CapabilityMatcher),
        container.resolve(SERVICE_TOKENS.TaskDependencyManager),
        container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService)
    );
    container.registerInstance(SERVICE_TOKENS.TaskQueue, taskQueue);

    // Inject TaskQueue into TaskStateMachine for dependency validation
    const taskStateMachine = container.resolve<ITaskStateMachine>(SERVICE_TOKENS.TaskStateMachine);
    taskStateMachine.setTaskReader(taskQueue);

    // Check if we're in test mode to skip auto behaviors and noisy services
    const config = container.resolve<ConfigurationService>(SERVICE_TOKENS.ConfigurationService);
    const isTestMode = config.get(CONFIG_KEYS.TEST_MODE, false);

    if (isTestMode) {
        loggingService.info('🧪 Test mode enabled - skipping auto behaviors and noisy services');

        // Optionally disable metrics in test mode
        await config.update(CONFIG_KEYS.ENABLE_METRICS, false, vscode.ConfigurationTarget.Global);
    }

    // Initialize agent manager (this will check for saved agents)
    await agentManager.initialize();

    // Migrate existing tasks to normalize new fields
    await migrateExistingTasks(taskQueue, loggingService);

    // Set initial context for UI
    const commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
    await commandService.execute('setContext', 'nofx.hasAgents', agentManager.getActiveAgents().length > 0);

    // Register orchestration services
    container.register(SERVICE_TOKENS.ConnectionPoolService,
        (container) => new ConnectionPoolService(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler),
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService)
        ), 'singleton');

    container.register(SERVICE_TOKENS.MessageValidator,
        (container) => new MessageValidator(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus)
        ), 'singleton');

    // Register MessagePersistenceService with workspace path or use in-memory fallback
    let messagePersistence: IMessagePersistenceService;

    if (workspaceFolder) {
        messagePersistence = new MessagePersistenceService(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            workspaceFolder.uri.fsPath
        );
    } else {
        messagePersistence = new InMemoryMessagePersistenceService(
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus)
        );
    }

    container.registerInstance(SERVICE_TOKENS.MessagePersistenceService, messagePersistence);

    container.register(SERVICE_TOKENS.MessageRouter,
        (container) => new MessageRouter(
            container.resolve(SERVICE_TOKENS.ConnectionPoolService),
            container.resolve(SERVICE_TOKENS.MessagePersistenceService),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler),
            container.resolve(SERVICE_TOKENS.AgentManager),
            container.resolve(SERVICE_TOKENS.TaskQueue)
        ), 'singleton');

    // Start orchestration server with new services (skip in test mode)
    let orchestrationServer: OrchestrationServer | undefined;
    if (!isTestMode) {
        orchestrationServer = new OrchestrationServer(
            7777,
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler),
            container.resolve(SERVICE_TOKENS.ConnectionPoolService),
            container.resolve(SERVICE_TOKENS.MessageRouter),
            container.resolve(SERVICE_TOKENS.MessageValidator),
            container.resolve(SERVICE_TOKENS.MessagePersistenceService),
            container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService)
        );

        // Wrap orchestration server start with error handling for port conflicts
        try {
            await orchestrationServer.start();
        } catch (error: any) {
            const notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
            loggingService.error('Failed to start orchestration server', error);

            if (error.code === 'EADDRINUSE') {
                notificationService.showWarning(
                    'NofX orchestration server could not start on port 7777 (port already in use). ' +
                    'Some features may be unavailable. Please ensure no other processes are using this port.'
                );
            } else {
                notificationService.showWarning(
                    `NofX orchestration server could not start: ${error.message}. Some features may be unavailable.`
                );
            }

            // Continue activation without failing - other features can still work
            orchestrationServer = undefined;
        }

        if (orchestrationServer) {
            container.registerInstance(SERVICE_TOKENS.OrchestrationServer, orchestrationServer);
        } else {
            // Register a mock orchestration server if the real one failed to start
            const mockOrchestrationServer = {
                start: () => Promise.resolve(),
                stop: () => Promise.resolve(),
                getStatus: () => ({ isRunning: false, port: 0, connectionCount: 0 }),
                dispose: () => {}
            };
            container.registerInstance(SERVICE_TOKENS.OrchestrationServer, mockOrchestrationServer);
        }
    } else {
        // Register a mock orchestration server for test mode
        const mockOrchestrationServer = {
            start: () => Promise.resolve(),
            stop: () => Promise.resolve(),
            getStatus: () => ({ isRunning: false, port: 0, connectionCount: 0 }),
            dispose: () => {}
        };
        container.registerInstance(SERVICE_TOKENS.OrchestrationServer, mockOrchestrationServer);
    }

    // Register UI services
    container.register(SERVICE_TOKENS.UIStateManager,
        (container) => new UIStateManager(
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.AgentManager), // Now implements IAgentReader
            container.resolve(SERVICE_TOKENS.TaskQueue)     // Now implements ITaskReader
        ), 'singleton');

    container.register(SERVICE_TOKENS.TreeStateManager,
        (container) => new TreeStateManager(
            container.resolve(SERVICE_TOKENS.UIStateManager),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService)
        ), 'singleton');

    container.register(SERVICE_TOKENS.ConductorViewModel,
        (container) => new ConductorViewModel(
            container.resolve(SERVICE_TOKENS.UIStateManager),
            container.resolve<ICommandService>(SERVICE_TOKENS.CommandService),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService)
        ), 'singleton');

    container.register(SERVICE_TOKENS.DashboardViewModel,
        (container) => new DashboardViewModel(
            container.resolve(SERVICE_TOKENS.UIStateManager),
            container.resolve(SERVICE_TOKENS.OrchestrationServer),
            container.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService),
            container.resolve(SERVICE_TOKENS.MessagePersistenceService),
            container.resolve(SERVICE_TOKENS.ConnectionPoolService)
        ), 'singleton');

    // Register message flow dashboard factory for on-demand creation
    // Dashboard will be created via 'nofx.openMessageFlow' command when needed
    container.register(SERVICE_TOKENS.MessageFlowDashboard,
        (container) => MessageFlowDashboard.create(
            context,
            container.resolve(SERVICE_TOKENS.DashboardViewModel),
            container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService)
        ), 'transient');

    // Message handling is now done through MessageRouter

    // Register tree data providers for sidebar views
    const nofxDevProvider = new NofxDevTreeProvider();
    const agentProvider = new AgentTreeProvider(
        container.resolve<ITreeStateManager>(SERVICE_TOKENS.TreeStateManager),
        container.resolve(SERVICE_TOKENS.UIStateManager)
    );
    const taskProvider = new TaskTreeProvider(
        container.resolve(SERVICE_TOKENS.UIStateManager),
        container
    );

    vscode.window.registerTreeDataProvider('nofx.dev', nofxDevProvider);

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
    const treeStateManager = container.resolve<ITreeStateManager>(SERVICE_TOKENS.TreeStateManager);
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
        commandService.execute('setContext', 'nofx.hasAgents', hasAgents);
    });

    // Register command handlers
    const agentCommands = new AgentCommands(container);
    agentCommands.register();
    context.subscriptions.push({ dispose: () => agentCommands.dispose() });

    const taskCommands = new TaskCommands(container);
    taskCommands.register();
    context.subscriptions.push({ dispose: () => taskCommands.dispose() });

    const conductorCommands = new ConductorCommands(container);
    conductorCommands.setAgentProvider(agentProvider);
    conductorCommands.register();
    context.subscriptions.push({ dispose: () => conductorCommands.dispose() });

    const orchestrationCommands = new OrchestrationCommands(container);
    if (orchestrationServer) { orchestrationCommands.setOrchestrationServer(orchestrationServer); }
    orchestrationCommands.register();
    context.subscriptions.push({ dispose: () => orchestrationCommands.dispose() });

    const persistenceCommands = new PersistenceCommands(container);
    persistenceCommands.register();
    context.subscriptions.push({ dispose: () => persistenceCommands.dispose() });

    const templateCommands = new TemplateCommands(container);
    templateCommands.register();
    context.subscriptions.push({ dispose: () => templateCommands.dispose() });

    const worktreeCommands = new WorktreeCommands(container);
    worktreeCommands.register();
    context.subscriptions.push({ dispose: () => worktreeCommands.dispose() });

    const utilityCommands = new UtilityCommands(container);
    utilityCommands.register();
    context.subscriptions.push({ dispose: () => utilityCommands.dispose() });

    // Register metrics commands
    const metricsCommands = new MetricsCommands(container);
    metricsCommands.register();

    // Ensure MetricsCommands are disposed on deactivation
    context.subscriptions.push({ dispose: () => metricsCommands.dispose() });

    // Status Bar Item (skip in test mode to reduce noise)
    let statusBarItem: vscode.StatusBarItem | undefined;
    let updateStatusBar: (() => void) | undefined;

    if (!isTestMode) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = '$(organization) NofX';
        statusBarItem.tooltip = 'Multi-Agent Orchestrator';
        statusBarItem.command = 'nofx.showOrchestrator';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        container.registerInstance(SERVICE_TOKENS.StatusBarItem, statusBarItem);

        // Update status bar with task statistics
        updateStatusBar = () => {
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

            statusBarItem!.text = statusText;
        };

        // Subscribe to task and agent updates
        const eventBus = container.resolve<IEventBus>(SERVICE_TOKENS.EventBus) as IEventBus;
        const eventSubscriptions = [
            eventBus.subscribe(DOMAIN_EVENTS.TASK_CREATED, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.TASK_COMPLETED, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.TASK_ASSIGNED, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.TASK_BLOCKED, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.TASK_READY, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.AGENT_CREATED, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.AGENT_REMOVED, updateStatusBar),
            eventBus.subscribe(DOMAIN_EVENTS.AGENT_STATUS_CHANGED, updateStatusBar)
        ];

        // Add all event subscriptions to context for disposal
        context.subscriptions.push(...eventSubscriptions);

        // Initial update
        updateStatusBar();
    } else {
        // Register a mock status bar item for test mode
        const mockStatusBarItem = {
            text: '',
            tooltip: '',
            command: '',
            show: () => {},
            hide: () => {},
            dispose: () => {}
        };
        container.registerInstance(SERVICE_TOKENS.StatusBarItem, mockStatusBarItem);
    }

    // Auto-start if configured (skip in test mode)
    if (!isTestMode && config.get(CONFIG_KEYS.AUTO_START, false)) {
        await commandService.execute('nofx.quickStartChat');
    }

    // Record activation metrics
    const metricsService = container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService);
    const activationTimer = metricsService.startTimer('extension.activation');
    metricsService.incrementCounter('extension.activated');
    metricsService.setGauge('extension.services.registered', 25); // Approximate count
    metricsService.endTimer(activationTimer);

    // Validate configuration during startup (includes both schema and cross-field validation)
    const configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
    const validationResult = configService.validateAll();
    if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map((e: ValidationError) => `${e.field}: ${e.message}`).join('; ');
        loggingService.warn('Configuration validation issues detected', { errors: validationResult.errors });

        // Show notification for critical errors
        const criticalErrors = validationResult.errors.filter((e: ValidationError) => e.severity === 'error');
        if (criticalErrors.length > 0) {
            const notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
            await notificationService.showWarning(
                `Configuration validation failed: ${errorMessages}. Some features may not work correctly.`
            );
        }

        // Show notification for warnings
        const warnings = validationResult.errors.filter((e: ValidationError) => e.severity === 'warning');
        if (warnings.length > 0) {
            const warningMessages = warnings.map((e: ValidationError) => `${e.field}: ${e.message}`).join('; ');
            const notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
            await notificationService.showWarning(
                `Configuration warnings: ${warningMessages}`
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
 * Get container for tests only
 * This is guarded by NODE_ENV to prevent accidental usage in production
 */
export function __getContainerForTests(): IContainer | undefined {
    if (process.env.NODE_ENV === 'test') {
        return container;
    }
    return undefined;
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


export async function deactivate(): Promise<void> {
    // Get logging service for deactivation logging
    const loggingService = container?.resolveOptional<ILoggingService>(SERVICE_TOKENS.LoggingService);
    if (loggingService) {
        loggingService.info('NofX extension deactivating...');
    }

    // Stop orchestration server and services
    const orchestrationServer = container?.resolveOptional<OrchestrationServer>(SERVICE_TOKENS.OrchestrationServer);
    if (orchestrationServer) {
        await orchestrationServer.stop();
    }

    // Dispose orchestration services
    const connectionPool = container?.resolveOptional(SERVICE_TOKENS.ConnectionPoolService);
    if (connectionPool && typeof connectionPool === 'object' && connectionPool !== null && 'dispose' in connectionPool) {
        (connectionPool as any).dispose();
    }

    const messageRouter = container?.resolveOptional(SERVICE_TOKENS.MessageRouter);
    if (messageRouter && typeof messageRouter === 'object' && messageRouter !== null && 'dispose' in messageRouter) {
        (messageRouter as any).dispose();
    }

    const messageValidator = container?.resolveOptional(SERVICE_TOKENS.MessageValidator);
    if (messageValidator && typeof messageValidator === 'object' && messageValidator !== null && 'dispose' in messageValidator) {
        (messageValidator as any).dispose();
    }

    const messagePersistence = container?.resolveOptional(SERVICE_TOKENS.MessagePersistenceService);
    if (messagePersistence && typeof messagePersistence === 'object' && messagePersistence !== null && 'dispose' in messagePersistence) {
        (messagePersistence as any).dispose();
    }

    // Dispose any active MessageFlowDashboard instances
    const messageFlowDashboard = container?.resolveOptional(SERVICE_TOKENS.MessageFlowDashboard);
    if (messageFlowDashboard && typeof messageFlowDashboard === 'object' && messageFlowDashboard !== null && 'dispose' in messageFlowDashboard) {
        (messageFlowDashboard as any).dispose();
    }

    // Log deactivation before disposing container
    if (loggingService) {
        loggingService.info('NofX extension deactivated');
    }

    // Dispose container and all services
    if (container) {
        // Get agent manager and dispose it properly
        const agentManager = container?.resolveOptional(SERVICE_TOKENS.AgentManager);
        if (agentManager && typeof agentManager === 'object' && agentManager !== null && 'dispose' in agentManager) {
            await (agentManager as any).dispose();
        }

        await container.dispose();
    }
}
