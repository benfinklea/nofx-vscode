"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.__getContainerForTests = __getContainerForTests;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const Container_1 = require("./services/Container");
const interfaces_1 = require("./services/interfaces");
const EventConstants_1 = require("./services/EventConstants");
const ConfigurationService_1 = require("./services/ConfigurationService");
const ConfigurationValidator_1 = require("./services/ConfigurationValidator");
const MetricsService_1 = require("./services/MetricsService");
const NotificationService_1 = require("./services/NotificationService");
const LoggingService_1 = require("./services/LoggingService");
const EventBus_1 = require("./services/EventBus");
const ErrorHandler_1 = require("./services/ErrorHandler");
const CommandService_1 = require("./services/CommandService");
const TerminalManager_1 = require("./services/TerminalManager");
const WorktreeService_1 = require("./services/WorktreeService");
const AgentLifecycleManager_1 = require("./services/AgentLifecycleManager");
const AgentManager_1 = require("./agents/AgentManager");
const TaskQueue_1 = require("./tasks/TaskQueue");
const TaskStateMachine_1 = require("./tasks/TaskStateMachine");
const PriorityTaskQueue_1 = require("./tasks/PriorityTaskQueue");
const CapabilityMatcher_1 = require("./tasks/CapabilityMatcher");
const TaskDependencyManager_1 = require("./tasks/TaskDependencyManager");
const priority_1 = require("./tasks/priority");
const OrchestrationServer_1 = require("./orchestration/OrchestrationServer");
const ConnectionPoolService_1 = require("./services/ConnectionPoolService");
const MessageRouter_1 = require("./services/MessageRouter");
const MessageValidator_1 = require("./services/MessageValidator");
const MessagePersistenceService_1 = require("./services/MessagePersistenceService");
const InMemoryMessagePersistenceService_1 = require("./services/InMemoryMessagePersistenceService");
const MessageFlowDashboard_1 = require("./dashboard/MessageFlowDashboard");
const AgentPersistence_1 = require("./persistence/AgentPersistence");
const WorktreeManager_1 = require("./worktrees/WorktreeManager");
const AgentTreeProvider_1 = require("./views/AgentTreeProvider");
const TaskTreeProvider_1 = require("./views/TaskTreeProvider");
const NofxDevTreeProvider_1 = require("./views/NofxDevTreeProvider");
const NofxTerminalProvider_1 = require("./views/NofxTerminalProvider");
const UIStateManager_1 = require("./services/UIStateManager");
const TreeStateManager_1 = require("./services/TreeStateManager");
const ConductorViewModel_1 = require("./viewModels/ConductorViewModel");
const DashboardViewModel_1 = require("./viewModels/DashboardViewModel");
const TreeViewHost_1 = require("./ui/TreeViewHost");
const AgentCommands_1 = require("./commands/AgentCommands");
const TaskCommands_1 = require("./commands/TaskCommands");
const ConductorCommands_1 = require("./commands/ConductorCommands");
const OrchestrationCommands_1 = require("./commands/OrchestrationCommands");
const PersistenceCommands_1 = require("./commands/PersistenceCommands");
const TemplateCommands_1 = require("./commands/TemplateCommands");
const WorktreeCommands_1 = require("./commands/WorktreeCommands");
const UtilityCommands_1 = require("./commands/UtilityCommands");
const MetricsCommands_1 = require("./commands/MetricsCommands");
let container;
async function activate(context) {
    container = new Container_1.Container();
    container.registerInstance(interfaces_1.SERVICE_TOKENS.ExtensionContext, context);
    const outputChannel = vscode.window.createOutputChannel('NofX');
    container.registerInstance(interfaces_1.SERVICE_TOKENS.OutputChannel, outputChannel);
    container.register(interfaces_1.SERVICE_TOKENS.EventBus, (container) => new EventBus_1.EventBus(container.resolveOptional(interfaces_1.SERVICE_TOKENS.LoggingService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.NotificationService, () => new NotificationService_1.NotificationService(), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.ConfigurationValidator, (container) => new ConfigurationValidator_1.ConfigurationValidator(container.resolveOptional(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.ConfigurationService, (container) => new ConfigurationService_1.ConfigurationService(container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationValidator), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.LoggingService, (container) => new LoggingService_1.LoggingService(container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.OutputChannel)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.MetricsService, (container) => new MetricsService_1.MetricsService(container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.ErrorHandler, (container) => new ErrorHandler_1.ErrorHandler(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.CommandService, (container) => new CommandService_1.CommandService(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler)), 'singleton');
    const loggingService = container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService);
    const errorHandler = container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler);
    container.setLoggingService(loggingService);
    const eventBus = container.resolve(interfaces_1.SERVICE_TOKENS.EventBus);
    eventBus.setLoggingService(loggingService);
    loggingService.info('🎸 n of x Multi-Agent Orchestrator is now active!');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const worktreeManager = new WorktreeManager_1.WorktreeManager(workspaceFolder.uri.fsPath, loggingService, container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService));
        container.registerInstance(interfaces_1.SERVICE_TOKENS.WorktreeManager, worktreeManager);
        const agentPersistence = new AgentPersistence_1.AgentPersistence(workspaceFolder.uri.fsPath, loggingService);
        container.registerInstance(interfaces_1.SERVICE_TOKENS.AgentPersistence, agentPersistence);
    }
    container.register(interfaces_1.SERVICE_TOKENS.TerminalManager, (container) => new TerminalManager_1.TerminalManager(container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.WorktreeService, (container) => new WorktreeService_1.WorktreeService(container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService), container.resolve(interfaces_1.SERVICE_TOKENS.WorktreeManager), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler)), 'singleton');
    const agentManager = new AgentManager_1.AgentManager(context, container.resolveOptional(interfaces_1.SERVICE_TOKENS.AgentPersistence));
    container.registerInstance(interfaces_1.SERVICE_TOKENS.AgentManager, agentManager);
    container.register(interfaces_1.SERVICE_TOKENS.AgentLifecycleManager, (container) => new AgentLifecycleManager_1.AgentLifecycleManager(container.resolve(interfaces_1.SERVICE_TOKENS.TerminalManager), container.resolve(interfaces_1.SERVICE_TOKENS.WorktreeService), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService), () => {
        agentManager.notifyAgentUpdated();
    }, container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler)), 'singleton');
    agentManager.setDependencies(container.resolve(interfaces_1.SERVICE_TOKENS.AgentLifecycleManager), container.resolve(interfaces_1.SERVICE_TOKENS.TerminalManager), container.resolve(interfaces_1.SERVICE_TOKENS.WorktreeService), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler), container.resolve(interfaces_1.SERVICE_TOKENS.MetricsService));
    container.register(interfaces_1.SERVICE_TOKENS.TaskStateMachine, (container) => new TaskStateMachine_1.TaskStateMachine(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolveOptional(interfaces_1.SERVICE_TOKENS.TaskQueue)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.TaskDependencyManager, (container) => new TaskDependencyManager_1.TaskDependencyManager(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.PriorityTaskQueue, (container) => new PriorityTaskQueue_1.PriorityTaskQueue(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.TaskDependencyManager)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.CapabilityMatcher, (container) => new CapabilityMatcher_1.CapabilityMatcher(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService)), 'singleton');
    const taskQueue = new TaskQueue_1.TaskQueue(agentManager, container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.TaskStateMachine), container.resolve(interfaces_1.SERVICE_TOKENS.PriorityTaskQueue), container.resolve(interfaces_1.SERVICE_TOKENS.CapabilityMatcher), container.resolve(interfaces_1.SERVICE_TOKENS.TaskDependencyManager), container.resolve(interfaces_1.SERVICE_TOKENS.MetricsService));
    container.registerInstance(interfaces_1.SERVICE_TOKENS.TaskQueue, taskQueue);
    const taskStateMachine = container.resolve(interfaces_1.SERVICE_TOKENS.TaskStateMachine);
    taskStateMachine.setTaskReader(taskQueue);
    const config = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
    const isTestMode = config.get(interfaces_1.CONFIG_KEYS.TEST_MODE, false);
    if (isTestMode) {
        loggingService.info('🧪 Test mode enabled - skipping auto behaviors and noisy services');
        await config.update(interfaces_1.CONFIG_KEYS.ENABLE_METRICS, false, vscode.ConfigurationTarget.Global);
    }
    await agentManager.initialize();
    await migrateExistingTasks(taskQueue, loggingService);
    const commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
    await commandService.execute('setContext', 'nofx.hasAgents', agentManager.getActiveAgents().length > 0);
    container.register(interfaces_1.SERVICE_TOKENS.ConnectionPoolService, (container) => new ConnectionPoolService_1.ConnectionPoolService(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.MessageValidator, (container) => new MessageValidator_1.MessageValidator(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus)), 'singleton');
    let messagePersistence;
    if (workspaceFolder) {
        messagePersistence = new MessagePersistenceService_1.MessagePersistenceService(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), workspaceFolder.uri.fsPath);
    }
    else {
        messagePersistence = new InMemoryMessagePersistenceService_1.InMemoryMessagePersistenceService(container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus));
    }
    container.registerInstance(interfaces_1.SERVICE_TOKENS.MessagePersistenceService, messagePersistence);
    container.register(interfaces_1.SERVICE_TOKENS.MessageRouter, (container) => new MessageRouter_1.MessageRouter(container.resolve(interfaces_1.SERVICE_TOKENS.ConnectionPoolService), container.resolve(interfaces_1.SERVICE_TOKENS.MessagePersistenceService), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler), container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager), container.resolve(interfaces_1.SERVICE_TOKENS.TaskQueue)), 'singleton');
    let orchestrationServer;
    if (!isTestMode) {
        orchestrationServer = new OrchestrationServer_1.OrchestrationServer(7777, container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.ErrorHandler), container.resolve(interfaces_1.SERVICE_TOKENS.ConnectionPoolService), container.resolve(interfaces_1.SERVICE_TOKENS.MessageRouter), container.resolve(interfaces_1.SERVICE_TOKENS.MessageValidator), container.resolve(interfaces_1.SERVICE_TOKENS.MessagePersistenceService), container.resolve(interfaces_1.SERVICE_TOKENS.MetricsService));
        try {
            await orchestrationServer.start();
        }
        catch (error) {
            const notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
            loggingService.error('Failed to start orchestration server', error);
            if (error.code === 'EADDRINUSE') {
                notificationService.showWarning('NofX orchestration server could not start on port 7777 (port already in use). ' +
                    'Some features may be unavailable. Please ensure no other processes are using this port.');
            }
            else {
                notificationService.showWarning(`NofX orchestration server could not start: ${error.message}. Some features may be unavailable.`);
            }
            orchestrationServer = undefined;
        }
        if (orchestrationServer) {
            container.registerInstance(interfaces_1.SERVICE_TOKENS.OrchestrationServer, orchestrationServer);
        }
        else {
            const mockOrchestrationServer = {
                start: () => Promise.resolve(),
                stop: () => Promise.resolve(),
                getStatus: () => ({ isRunning: false, port: 0, connectionCount: 0 }),
                dispose: () => { }
            };
            container.registerInstance(interfaces_1.SERVICE_TOKENS.OrchestrationServer, mockOrchestrationServer);
        }
    }
    else {
        const mockOrchestrationServer = {
            start: () => Promise.resolve(),
            stop: () => Promise.resolve(),
            getStatus: () => ({ isRunning: false, port: 0, connectionCount: 0 }),
            dispose: () => { }
        };
        container.registerInstance(interfaces_1.SERVICE_TOKENS.OrchestrationServer, mockOrchestrationServer);
    }
    container.register(interfaces_1.SERVICE_TOKENS.UIStateManager, (container) => new UIStateManager_1.UIStateManager(container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager), container.resolve(interfaces_1.SERVICE_TOKENS.TaskQueue)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.TreeStateManager, (container) => new TreeStateManager_1.TreeStateManager(container.resolve(interfaces_1.SERVICE_TOKENS.UIStateManager), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.ConductorViewModel, (container) => new ConductorViewModel_1.ConductorViewModel(container.resolve(interfaces_1.SERVICE_TOKENS.UIStateManager), container.resolve(interfaces_1.SERVICE_TOKENS.CommandService), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.DashboardViewModel, (container) => new DashboardViewModel_1.DashboardViewModel(container.resolve(interfaces_1.SERVICE_TOKENS.UIStateManager), container.resolve(interfaces_1.SERVICE_TOKENS.OrchestrationServer), container.resolve(interfaces_1.SERVICE_TOKENS.EventBus), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService), container.resolve(interfaces_1.SERVICE_TOKENS.MessagePersistenceService), container.resolve(interfaces_1.SERVICE_TOKENS.ConnectionPoolService)), 'singleton');
    container.register(interfaces_1.SERVICE_TOKENS.MessageFlowDashboard, (container) => MessageFlowDashboard_1.MessageFlowDashboard.create(context, container.resolve(interfaces_1.SERVICE_TOKENS.DashboardViewModel), container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService)), 'transient');
    const nofxDevProvider = new NofxDevTreeProvider_1.NofxDevTreeProvider();
    const agentProvider = new AgentTreeProvider_1.AgentTreeProvider(container.resolve(interfaces_1.SERVICE_TOKENS.TreeStateManager), container.resolve(interfaces_1.SERVICE_TOKENS.UIStateManager));
    const taskProvider = new TaskTreeProvider_1.TaskTreeProvider(container.resolve(interfaces_1.SERVICE_TOKENS.UIStateManager), container);
    vscode.window.registerTreeDataProvider('nofx.dev', nofxDevProvider);
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
    const agentTreeViewHost = TreeViewHost_1.TreeViewHost.create(agentTreeView, agentProvider, loggingService);
    container.registerInstance(interfaces_1.SERVICE_TOKENS.AgentTreeViewHost, agentTreeViewHost);
    const treeStateManager = container.resolve(interfaces_1.SERVICE_TOKENS.TreeStateManager);
    context.subscriptions.push(agentTreeView.onDidExpandElement((e) => {
        const element = e.element;
        if (element && element.contextValue === 'teamSection') {
            treeStateManager.toggleSection('teamSection');
        }
    }), agentTreeView.onDidCollapseElement((e) => {
        const element = e.element;
        if (element && element.contextValue === 'teamSection') {
            treeStateManager.toggleSection('teamSection');
        }
    }));
    context.subscriptions.push(agentTreeView);
    const terminalProvider = new NofxTerminalProvider_1.NofxTerminalProvider(context.extensionUri, agentManager);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(NofxTerminalProvider_1.NofxTerminalProvider.viewType, terminalProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    }));
    agentManager.onAgentUpdate(() => {
        const hasAgents = agentManager.getActiveAgents().length > 0;
        commandService.execute('setContext', 'nofx.hasAgents', hasAgents);
    });
    const agentCommands = new AgentCommands_1.AgentCommands(container);
    agentCommands.register();
    context.subscriptions.push({ dispose: () => agentCommands.dispose() });
    const taskCommands = new TaskCommands_1.TaskCommands(container);
    taskCommands.register();
    context.subscriptions.push({ dispose: () => taskCommands.dispose() });
    const conductorCommands = new ConductorCommands_1.ConductorCommands(container);
    conductorCommands.setAgentProvider(agentProvider);
    conductorCommands.register();
    context.subscriptions.push({ dispose: () => conductorCommands.dispose() });
    const orchestrationCommands = new OrchestrationCommands_1.OrchestrationCommands(container);
    if (orchestrationServer) {
        orchestrationCommands.setOrchestrationServer(orchestrationServer);
    }
    orchestrationCommands.register();
    context.subscriptions.push({ dispose: () => orchestrationCommands.dispose() });
    const persistenceCommands = new PersistenceCommands_1.PersistenceCommands(container);
    persistenceCommands.register();
    context.subscriptions.push({ dispose: () => persistenceCommands.dispose() });
    const templateCommands = new TemplateCommands_1.TemplateCommands(container);
    templateCommands.register();
    context.subscriptions.push({ dispose: () => templateCommands.dispose() });
    const worktreeCommands = new WorktreeCommands_1.WorktreeCommands(container);
    worktreeCommands.register();
    context.subscriptions.push({ dispose: () => worktreeCommands.dispose() });
    const utilityCommands = new UtilityCommands_1.UtilityCommands(container);
    utilityCommands.register();
    context.subscriptions.push({ dispose: () => utilityCommands.dispose() });
    const metricsCommands = new MetricsCommands_1.MetricsCommands(container);
    metricsCommands.register();
    context.subscriptions.push({ dispose: () => metricsCommands.dispose() });
    let statusBarItem;
    let updateStatusBar;
    if (!isTestMode) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.text = '$(organization) NofX';
        statusBarItem.tooltip = 'Multi-Agent Orchestrator';
        statusBarItem.command = 'nofx.showOrchestrator';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        container.registerInstance(interfaces_1.SERVICE_TOKENS.StatusBarItem, statusBarItem);
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
            statusBarItem.text = statusText;
        };
        const eventBus = container.resolve(interfaces_1.SERVICE_TOKENS.EventBus);
        const eventSubscriptions = [
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_CREATED, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_COMPLETED, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_ASSIGNED, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_BLOCKED, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.TASK_READY, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_CREATED, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_REMOVED, updateStatusBar),
            eventBus.subscribe(EventConstants_1.DOMAIN_EVENTS.AGENT_STATUS_CHANGED, updateStatusBar)
        ];
        context.subscriptions.push(...eventSubscriptions);
        updateStatusBar();
    }
    else {
        const mockStatusBarItem = {
            text: '',
            tooltip: '',
            command: '',
            show: () => { },
            hide: () => { },
            dispose: () => { }
        };
        container.registerInstance(interfaces_1.SERVICE_TOKENS.StatusBarItem, mockStatusBarItem);
    }
    if (!isTestMode && config.get(interfaces_1.CONFIG_KEYS.AUTO_START, false)) {
        await commandService.execute('nofx.quickStartChat');
    }
    const metricsService = container.resolve(interfaces_1.SERVICE_TOKENS.MetricsService);
    const activationTimer = metricsService.startTimer('extension.activation');
    metricsService.incrementCounter('extension.activated');
    metricsService.setGauge('extension.services.registered', 25);
    metricsService.endTimer(activationTimer);
    const configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
    const validationResult = configService.validateAll();
    if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        loggingService.warn('Configuration validation issues detected', { errors: validationResult.errors });
        const criticalErrors = validationResult.errors.filter((e) => e.severity === 'error');
        if (criticalErrors.length > 0) {
            const notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
            await notificationService.showWarning(`Configuration validation failed: ${errorMessages}. Some features may not work correctly.`);
        }
        const warnings = validationResult.errors.filter((e) => e.severity === 'warning');
        if (warnings.length > 0) {
            const warningMessages = warnings.map((e) => `${e.field}: ${e.message}`).join('; ');
            const notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
            await notificationService.showWarning(`Configuration warnings: ${warningMessages}`);
        }
    }
    const agentCount = agentManager.getActiveAgents().length;
    if (agentCount > 0) {
        metricsService.incrementCounter('agents.restored', { count: agentCount.toString() });
        metricsService.setGauge('agents.active.count', agentCount);
    }
    const taskCount = taskQueue.getTasks().length;
    if (taskCount > 0) {
        metricsService.incrementCounter('tasks.restored', { count: taskCount.toString() });
        metricsService.setGauge('tasks.total.count', taskCount);
    }
    loggingService.info('🎸 NofX Multi-Agent Orchestrator activation completed with metrics and validation');
}
function __getContainerForTests() {
    if (process.env.NODE_ENV === 'test') {
        return container;
    }
    return undefined;
}
async function migrateExistingTasks(taskQueue, loggingService) {
    try {
        const allTasks = taskQueue.getTasks();
        let migratedCount = 0;
        for (const task of allTasks) {
            let needsUpdate = false;
            if (task.numericPriority === undefined) {
                task.numericPriority = (0, priority_1.priorityToNumeric)(task.priority);
                needsUpdate = true;
            }
            if (task.conflictsWith === undefined) {
                task.conflictsWith = [];
                needsUpdate = true;
            }
            if (task.blockedBy === undefined) {
                task.blockedBy = [];
                needsUpdate = true;
            }
            if (task.dependsOn === undefined) {
                task.dependsOn = [];
                needsUpdate = true;
            }
            if (task.tags === undefined) {
                task.tags = [];
                needsUpdate = true;
            }
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
    }
    catch (error) {
        loggingService.error('Error during task migration:', error);
    }
}
async function deactivate() {
    const loggingService = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.LoggingService);
    if (loggingService) {
        loggingService.info('NofX extension deactivating...');
    }
    const orchestrationServer = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.OrchestrationServer);
    if (orchestrationServer) {
        await orchestrationServer.stop();
    }
    const connectionPool = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.ConnectionPoolService);
    if (connectionPool && typeof connectionPool === 'object' && connectionPool !== null && 'dispose' in connectionPool) {
        connectionPool.dispose();
    }
    const messageRouter = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.MessageRouter);
    if (messageRouter && typeof messageRouter === 'object' && messageRouter !== null && 'dispose' in messageRouter) {
        messageRouter.dispose();
    }
    const messageValidator = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.MessageValidator);
    if (messageValidator && typeof messageValidator === 'object' && messageValidator !== null && 'dispose' in messageValidator) {
        messageValidator.dispose();
    }
    const messagePersistence = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.MessagePersistenceService);
    if (messagePersistence && typeof messagePersistence === 'object' && messagePersistence !== null && 'dispose' in messagePersistence) {
        messagePersistence.dispose();
    }
    const messageFlowDashboard = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.MessageFlowDashboard);
    if (messageFlowDashboard && typeof messageFlowDashboard === 'object' && messageFlowDashboard !== null && 'dispose' in messageFlowDashboard) {
        messageFlowDashboard.dispose();
    }
    if (loggingService) {
        loggingService.info('NofX extension deactivated');
    }
    if (container) {
        const agentManager = container?.resolveOptional(interfaces_1.SERVICE_TOKENS.AgentManager);
        if (agentManager && typeof agentManager === 'object' && agentManager !== null && 'dispose' in agentManager) {
            await agentManager.dispose();
        }
        await container.dispose();
    }
}
//# sourceMappingURL=extension.js.map