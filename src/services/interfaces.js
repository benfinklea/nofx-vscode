"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METRICS_CONFIG_KEYS = exports.MetricType = exports.CONFIG_KEYS = exports.CircularDependencyError = exports.ServiceNotFoundError = exports.SERVICE_TOKENS = void 0;
exports.SERVICE_TOKENS = {
    ConfigurationService: Symbol('ConfigurationService'),
    NotificationService: Symbol('NotificationService'),
    LoggingService: Symbol('LoggingService'),
    EventBus: Symbol('EventBus'),
    ErrorHandler: Symbol('ErrorHandler'),
    CommandService: Symbol('CommandService'),
    TerminalManager: Symbol('TerminalManager'),
    WorktreeService: Symbol('WorktreeService'),
    AgentLifecycleManager: Symbol('AgentLifecycleManager'),
    AgentManager: Symbol('AgentManager'),
    TaskQueue: Symbol('TaskQueue'),
    TaskStateMachine: Symbol('TaskStateMachine'),
    PriorityTaskQueue: Symbol('PriorityTaskQueue'),
    CapabilityMatcher: Symbol('CapabilityMatcher'),
    TaskDependencyManager: Symbol('TaskDependencyManager'),
    OrchestrationServer: Symbol('OrchestrationServer'),
    ConnectionPoolService: Symbol('ConnectionPoolService'),
    MessageRouter: Symbol('MessageRouter'),
    MessageValidator: Symbol('MessageValidator'),
    MessagePersistenceService: Symbol('MessagePersistenceService'),
    MessageFlowDashboard: Symbol('MessageFlowDashboard'),
    ExtensionContext: Symbol('ExtensionContext'),
    OutputChannel: Symbol('OutputChannel'),
    StatusBarItem: Symbol('StatusBarItem'),
    AgentPersistence: Symbol('AgentPersistence'),
    WorktreeManager: Symbol('WorktreeManager'),
    UIStateManager: Symbol('UIStateManager'),
    ConductorViewModel: Symbol('ConductorViewModel'),
    DashboardViewModel: Symbol('DashboardViewModel'),
    TreeStateManager: Symbol('TreeStateManager'),
    AgentTreeViewHost: Symbol('AgentTreeViewHost'),
    MetricsService: Symbol('MetricsService'),
    ConfigurationValidator: Symbol('ConfigurationValidator')
};
class ServiceNotFoundError extends Error {
    constructor(token) {
        super(`Service not found: ${token.toString()}`);
        this.token = token;
        this.name = 'ServiceNotFoundError';
    }
}
exports.ServiceNotFoundError = ServiceNotFoundError;
class CircularDependencyError extends Error {
    constructor(chain) {
        super(`Circular dependency detected: ${chain.map(s => s.toString()).join(' -> ')}`);
        this.chain = chain;
        this.name = 'CircularDependencyError';
    }
}
exports.CircularDependencyError = CircularDependencyError;
exports.CONFIG_KEYS = {
    MAX_AGENTS: 'maxAgents',
    CLAUDE_PATH: 'claudePath',
    AUTO_ASSIGN_TASKS: 'autoAssignTasks',
    AUTO_START: 'autoStart',
    AUTO_OPEN_DASHBOARD: 'autoOpenDashboard',
    USE_WORKTREES: 'useWorktrees',
    SHOW_AGENT_TERMINAL_ON_SPAWN: 'showAgentTerminalOnSpawn',
    TEMPLATES_PATH: 'templatesPath',
    PERSIST_AGENTS: 'persistAgents',
    LOG_LEVEL: 'logLevel',
    ORCHESTRATION_PORT: 'orchestrationPort',
    ENABLE_METRICS: 'enableMetrics',
    METRICS_OUTPUT_LEVEL: 'metricsOutputLevel',
    METRICS_RETENTION_HOURS: 'metricsRetentionHours',
    TEST_MODE: 'testMode',
    CLAUDE_COMMAND_STYLE: 'claudeCommandStyle',
    ORCH_HEARTBEAT_INTERVAL: 'orchestration.heartbeatInterval',
    ORCH_HEARTBEAT_TIMEOUT: 'orchestration.heartbeatTimeout',
    ORCH_HISTORY_LIMIT: 'orchestration.historyLimit',
    ORCH_PERSISTENCE_PATH: 'orchestration.persistencePath',
    ORCH_MAX_FILE_SIZE: 'orchestration.maxFileSize'
};
var MetricType;
(function (MetricType) {
    MetricType["COUNTER"] = "counter";
    MetricType["GAUGE"] = "gauge";
    MetricType["HISTOGRAM"] = "histogram";
    MetricType["TIMER"] = "timer";
})(MetricType || (exports.MetricType = MetricType = {}));
exports.METRICS_CONFIG_KEYS = {
    ENABLE_METRICS: exports.CONFIG_KEYS.ENABLE_METRICS,
    METRICS_OUTPUT_LEVEL: exports.CONFIG_KEYS.METRICS_OUTPUT_LEVEL,
    METRICS_RETENTION_HOURS: exports.CONFIG_KEYS.METRICS_RETENTION_HOURS
};
//# sourceMappingURL=interfaces.js.map