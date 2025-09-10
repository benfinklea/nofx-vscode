import * as vscode from 'vscode';
import { ConductorViewState, DashboardViewState, AgentDTO, TaskDTO } from '../types/ui';
import { Task, TaskStatus, TaskValidationError, Agent, TaskConfig } from '../agents/types';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
// Import focused interfaces from ../interfaces for local use
import { IEventEmitter, IEventSubscriber, IEventPublisher } from '../interfaces/IEvent';
import { ILogger as ISimpleLogger } from '../interfaces/ILogging';
import { IAgentLifecycle, IAgentQuery } from '../interfaces/IAgent';
import { ITaskManager as ISimpleTaskManager } from '../interfaces/ITask';
import { IConfiguration as ISimpleConfiguration } from '../interfaces/IConfiguration';

// Re-export for convenience
export { IEventEmitter, IEventSubscriber, IEventPublisher };
export { IAgentLifecycle, IAgentQuery };

// Service tokens removed - ServiceLocator uses string-based registration

// Legacy alias for compatibility
export interface IConfigurationService extends IConfiguration {
    // All methods inherited from IConfiguration
}

// Extended Configuration service for VS Code (if needed for backwards compatibility)
export interface IConfiguration extends ISimpleConfiguration {
    get<T>(key: string, defaultValue?: T): T;
    getAll(): Record<string, any>;
    update(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void>;
    onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;

    // Validation
    validateAll(): { isValid: boolean; errors: ValidationError[] };

    // NofX specific configuration methods
    getMaxAgents(): number;
    getAiProvider(): string;
    getAiPath(): string;
    isAutoAssignTasks(): boolean;
    isUseWorktrees(): boolean;
    isAutoManageWorktrees(): boolean;
    isShowAgentTerminalOnSpawn(): boolean;
    isClaudeSkipPermissions(): boolean;
    getClaudeInitializationDelay(): number;
    getTemplatesPath(): string;
    isPersistAgents(): boolean;
    getLogLevel(): string;

    // Orchestration service configuration methods
    getOrchestrationHeartbeatInterval(): number;
    getOrchestrationHeartbeatTimeout(): number;
    getOrchestrationHistoryLimit(): number;
    getOrchestrationPersistencePath(): string;
    getOrchestrationMaxFileSize(): number;
}

// Notification service for user messaging
export interface INotificationService {
    showInformation(message: string, ...items: string[]): Promise<string | undefined>;
    showWarning(message: string, ...items: string[]): Promise<string | undefined>;
    showError(message: string, ...items: string[]): Promise<string | undefined>;
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions
    ): Promise<T | undefined>;
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions & { canPickMany: true }
    ): Promise<T[] | undefined>;
    showInputBox(options?: vscode.InputBoxOptions): Promise<string | undefined>;
    withProgress<T>(
        options: vscode.ProgressOptions,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
    ): Promise<T>;

    // Confirmation dialogs
    confirm(message: string, confirmText?: string): Promise<boolean>;
    confirmDestructive(message: string, confirmText?: string): Promise<boolean>;
}

// Log levels for the logging service
export type LogLevel = 'trace' | 'debug' | 'agents' | 'info' | 'warn' | 'error' | 'none';

// Logging service for centralized, configurable logging
export interface ILoggingService {
    trace(message: string, data?: any): void;
    debug(message: string, data?: any): void;
    agents(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;

    // Configuration-aware logging
    isLevelEnabled(level: LogLevel): boolean;
    setConfigurationService?(configService: IConfiguration): void;

    // Channel management
    getChannel(name: string): vscode.OutputChannel;

    // Utility methods
    time(label: string): void;
    timeEnd(label: string): void;

    // Configuration change notification
    onDidChangeConfiguration?(callback: () => void): vscode.Disposable;

    dispose(): void;
}

// Legacy alias
export interface ILogger {
    trace(message: string, data?: any): void;
    debug(message: string, data?: any): void;
    agents(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;

    // Configuration-aware logging
    isLevelEnabled(level: LogLevel): boolean;
    setConfigurationService?(configService: IConfiguration): void;

    // Channel management
    getChannel(name: string): vscode.OutputChannel;

    // Utility methods
    time(label: string): void;
    timeEnd(label: string): void;

    // Configuration change notification
    onDidChangeConfiguration?(callback: () => void): vscode.Disposable;

    dispose(): void;
}

// Combined interface for event bus (extends emitter, subscriber and publisher)
export interface IEventBus extends IEventEmitter, IEventSubscriber, IEventPublisher {
    // Core methods (already defined in base interfaces)
    subscribe(event: string, handler: (data?: any) => void): vscode.Disposable;
    unsubscribe(event: string, handler: Function): void;

    // Utility methods
    once(event: string, handler: (data?: any) => void): vscode.Disposable;
    filter(event: string, predicate: (data?: any) => boolean): { event: vscode.Event<any>; dispose: () => void };
    subscribePattern(pattern: string, handler: (event: string, data?: any) => void): vscode.Disposable;

    // Configuration methods
    setLoggingService(logger: ILogger): void;

    dispose(): void;
}

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high';

// Error handler for centralized error processing
export interface IErrorHandler {
    handleError(error: Error, context?: string, severity?: ErrorSeverity): void;
    handleAsync<T>(operation: () => Promise<T>, context?: string): Promise<T>;
    wrapSync<T>(operation: () => T, context?: string): T;

    // Recovery options
    withRetry<T>(operation: () => Promise<T>, maxRetries?: number, context?: string): Promise<T>;

    dispose(): void;
}

// Command service for managing VS Code commands
export interface ICommandService {
    register(commandId: string, handler: (...args: any[]) => any, thisArg?: any): vscode.Disposable;
    registerTextEditorCommand(
        commandId: string,
        handler: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void,
        thisArg?: any
    ): vscode.Disposable;
    execute(commandId: string, ...args: any[]): Promise<any>;
    getCommands(filterInternal?: boolean): Promise<string[]>;
    getRegisteredCommands(): string[];
    hasCommand(commandId: string): boolean;
    unregister(commandId: string): void;
    dispose(): void;
}

// Terminal manager for VS Code terminal operations
export interface ITerminalManager {
    createTerminal(agentId: string, agentConfig: any): vscode.Terminal;
    getTerminal(agentId: string): vscode.Terminal | undefined;
    disposeTerminal(agentId: string): void;
    initializeAgentTerminal(agent: any, workingDirectory?: string): Promise<void>;
    createEphemeralTerminal(name: string): vscode.Terminal;
    performHealthCheck(agentId: string): Promise<{ healthy: boolean; issues: string[] }>;
    onTerminalClosed: vscode.Event<vscode.Terminal>;
    dispose(): void;
}

// Worktree service for Git worktree operations
export interface IWorktreeService {
    createForAgent(agent: any): Promise<string | undefined>;
    removeForAgent(agentId: string): Promise<boolean>;
    mergeForAgent(agentId: string): Promise<boolean>;
    getWorktreePath(agentId: string): string | undefined;
    isAvailable(): boolean;
    cleanupOrphaned(): Promise<void>;
    dispose(): void;
}

// Agent lifecycle manager for orchestrating agent operations
export interface IAgentLifecycleManager {
    spawnAgent(config: any, restoredId?: string): Promise<any>;
    removeAgent(agentId: string): Promise<boolean>;
    initialize(): Promise<void>;
    startTaskMonitoring(agentId: string): void;
    stopTaskMonitoring(agentId: string): void;
    dispose(): void;
}

// Service lifetime options
export type ServiceLifetime = 'singleton' | 'transient';

// Service registration metadata
export interface ServiceRegistration<T = any> {
    token: symbol;
    lifetime: ServiceLifetime;
    instance?: T;
}

// Legacy Container interface removed - replaced by ServiceLocator

// Disposable pattern for services
// NOTE: Service dispose() methods MUST be synchronous to ensure proper cleanup order
// and avoid race conditions during container disposal. If async cleanup is needed,
// implement IAsyncDisposable instead.
export interface IDisposable {
    dispose(): void;
}

// Async disposable pattern for services that need async cleanup
// Services implementing this interface will be disposed after sync disposables
// to ensure proper cleanup order and avoid race conditions.
export interface IAsyncDisposable {
    disposeAsync(): Promise<void>;
}

// Base interface for command handlers
export interface ICommandHandler {
    register(): void;
    dispose(): void;
}

// Factory function type for creating services

// Type helper for extracting service type from token
export type ServiceType<T> = T extends symbol ? any : T;

// Error types for dependency injection
export class ServiceNotFoundError extends Error {
    constructor(public token: symbol) {
        super(`Service not found: ${token.toString()}`);
        this.name = 'ServiceNotFoundError';
    }
}

export class CircularDependencyError extends Error {
    constructor(public chain: symbol[]) {
        super(`Circular dependency detected: ${chain.map(s => s.toString()).join(' -> ')}`);
        this.name = 'CircularDependencyError';
    }
}

/**
 * Configuration keys for NofX extension
 * @remarks Keys marked as (future) are not yet exposed in package.json
 */
export const CONFIG_KEYS = {
    // Active in package.json
    MAX_AGENTS: 'maxAgents', // Maximum number of concurrent agents
    AI_PROVIDER: 'aiProvider', // Selected AI provider (claude, aider, etc.)
    AI_PATH: 'aiPath', // Path to AI CLI (Claude, Aider, etc.)
    AUTO_ASSIGN_TASKS: 'autoAssignTasks', // Auto-assign tasks to agents
    AUTO_START: 'autoStart', // Auto-start NofX on VS Code open
    AUTO_OPEN_DASHBOARD: 'autoOpenDashboard', // Auto-open MessageFlowDashboard on activation
    USE_WORKTREES: 'useWorktrees', // Use Git worktrees for agents
    AUTO_MANAGE_WORKTREES: 'autoManageWorktrees', // Automatically manage worktrees
    SHOW_AGENT_TERMINAL_ON_SPAWN: 'showAgentTerminalOnSpawn', // Show agent terminal when spawned
    CLAUDE_SKIP_PERMISSIONS: 'claudeSkipPermissions', // Add --dangerously-skip-permissions flag
    CLAUDE_INITIALIZATION_DELAY: 'nofx.claudeInitializationDelay', // Seconds to wait for Claude to initialize
    // Future/internal use (not in package.json yet)
    TEMPLATES_PATH: 'templatesPath', // (future) Custom templates path
    PERSIST_AGENTS: 'persistAgents', // (future) Persist agent state
    LOG_LEVEL: 'logLevel', // (future) Logging level
    ORCHESTRATION_PORT: 'orchestrationPort', // (future) WebSocket server port
    TEST_MODE: 'testMode', // Test mode flag
    CLAUDE_COMMAND_STYLE: 'claudeCommandStyle', // Claude command style
    // Orchestration service configuration
    ORCH_HEARTBEAT_INTERVAL: 'orchestration.heartbeatInterval',
    ORCH_HEARTBEAT_TIMEOUT: 'orchestration.heartbeatTimeout',
    ORCH_HISTORY_LIMIT: 'orchestration.historyLimit',
    ORCH_PERSISTENCE_PATH: 'orchestration.persistencePath',
    ORCH_MAX_FILE_SIZE: 'orchestration.maxFileSize'
} as const;

// Event emitter for service events
export interface IServiceEventEmitter {
    on(event: string, handler: (...args: any[]) => void): vscode.Disposable;
    emit(event: string, ...args: any[]): void;
    dispose(): void;
}

// UI State Manager for centralized UI state management
export interface IUIStateManager {
    getState(): ConductorViewState;
    subscribe(callback: (state: ConductorViewState) => void): vscode.Disposable;
    updateAgentStats(): void;
    updateTaskStats(): void;
    getAgentStats(): { total: number; idle: number; working: number; error: number; offline: number };
    getTaskStats(): {
        queued: number;
        validated: number;
        ready: number;
        assigned: number;
        inProgress: number;
        completed: number;
        failed: number;
        blocked: number;
        conflicted: number;
    };
    getAgents(): AgentDTO[];
    getTasks(): TaskDTO[];
    getTasksByStatus(status: string): TaskDTO[];
    dispose(): void;
}

// Webview Host abstraction for VS Code webview operations
export interface IWebviewHost {
    postMessage(data: any): Thenable<boolean>;
    setHtml(content: string): void;
    onDidReceiveMessage(handler: (message: any) => void): vscode.Disposable;
    reveal(viewColumn?: vscode.ViewColumn): void;
    onDidDispose(listener: () => any): vscode.Disposable;
    asWebviewUri(uri: vscode.Uri): vscode.Uri;
    getNonce(): string;
    get webview(): vscode.Webview;
    dispose(): void;
}

// Factory function type for creating webview hosts
export type WebviewHostFactory = (panel: vscode.WebviewPanel, logging?: ILogger) => IWebviewHost;

// Tree Data Provider interface for refresh capability
export interface ITreeDataProviderWithRefresh {
    refresh(): void;
}

// Tree View Host abstraction for VS Code tree view operations
export interface ITreeViewHost {
    refresh(): void;
    reveal(element: any): void;
    onDidChangeSelection(handler: (selection: any) => void): vscode.Disposable;
    getSelection(): any[];
    setSelection(items: any[]): void;
    dispose(): void;
}

// Conductor View Model interface
export interface IConductorViewModel {
    getViewState(): ConductorViewState;
    handleCommand(command: string, data?: any): Promise<void>;
    spawnAgentGroup(groupName: string): Promise<void>;
    spawnCustomAgent(templateKey: string): Promise<void>;
    createTask(): Promise<void>;
    removeAgent(agentId: string): Promise<void>;
    toggleTheme(theme: string): Promise<void>;
    subscribe(callback: (state: ConductorViewState) => void): vscode.Disposable;
    dispose(): void;
}

// Dashboard View Model interface
export interface IDashboardViewModel {
    getDashboardState(): Promise<DashboardViewState>;
    handleCommand(command: string, data?: any): Promise<void>;
    applyFilter(filter: { messageType?: string; timeRange?: string; source?: string }): void;
    clearMessages(): void;
    exportMessages(): void;
    calculateMessageStats(): {
        totalMessages: number;
        successRate: number;
        averageResponseTime: number;
        activeConnections: number;
    };
    calculateSuccessRate(): number;
    subscribe(callback: (state: DashboardViewState) => void): vscode.Disposable;
    dispose(): void;
}

// Agent Reader interface for dependency injection
export interface IAgentReader {
    getActiveAgents(): Agent[];
    getAgent(agentId: string): Agent | undefined;
}

// Task Reader interface for dependency injection
export interface ITaskReader {
    getTasks(): Task[];
    getTask(taskId: string): Task | undefined;
}

// Tree State Manager interface
export interface IUIStateManager {
    setTeamName(name: string): void;
    getTeamName(): string;
    toggleSection(sectionId: string): void;
    isSectionExpanded(id: string): boolean;
    selectItem(itemId: string): void;
    getAgentTreeItems(): any[];
    getTaskTreeItems(): any[];
    getSectionItems(): any[];
    subscribe(callback: () => void): vscode.Disposable;
    dispose(): void;
}

// Task State Machine interface for formal state management
export interface ITaskStateMachine {
    validateTransition(currentState: TaskStatus, nextState: TaskStatus): boolean;
    transition(task: Task, nextState: TaskStatus): TaskValidationError[];
    getValidTransitions(currentState: TaskStatus): TaskStatus[];
    isTerminalState(state: TaskStatus): boolean;
    setTaskReader(taskReader: ITaskReader): void;
    dispose(): void;
}

// Priority Task Queue interface for efficient task ordering
export interface IPriorityTaskQueue {
    enqueue(task: Task): void;
    dequeue(): Task | null;
    dequeueReady(): Task | null;
    peek(): Task | null;
    remove(taskId: string): boolean;
    contains(taskId: string): boolean;
    reorder(): void;
    recomputePriority(task: Task): void;
    calculateSoftDependencyAdjustmentWithTasks(task: Task, allTasks: Task[]): number;
    computeEffectivePriority(task: Task, allTasks: Task[]): number;
    moveToReady(task: Task): void;
    updatePriority(taskId: string, newPriority: number): boolean;
    enqueueMany(tasks: Task[]): void;
    getStats(): {
        size: number;
        averagePriority: number;
        oldestTask?: Task;
        newestTask?: Task;
        averageWaitMs: number;
        depthHistory: number[];
    };
    size(): number;
    isEmpty(): boolean;
    toArray(): Task[];
    dispose(): void;
}

// Capability Matcher interface for sophisticated agent-task matching
export interface ICapabilityMatcher {
    scoreAgent(agent: Agent, task: Task): number;
    findBestAgent(agents: Agent[], task: Task): Agent | null;
    rankAgents(agents: Agent[], task: Task): Array<{ agent: Agent; score: number }>;
    calculateCapabilityMatch(agentCapabilities: string[], requiredCapabilities: string[]): number;
    calculateMatchScore(agentCapabilities: string[], requiredCapabilities: string[]): number; // Added for TaskQueue
    getMatchExplanation(agent: Agent, task: Task): string;
    getCustomAgentThreshold(): number;
    getBestAgentScore(agents: Agent[], task: Task): number;
    shouldCreateCustomAgent(agents: Agent[], task: Task): boolean;
    dispose(): void;
}

// Task Queue interface for task management operations
export interface ITaskManager extends ISimpleTaskManager {
    // Core task operations
    addTask(config: TaskConfig): Task;
    getTask(taskId: string): Task | undefined;
    getTasks(): Task[];
    getAllTasks(): Task[];
    getPendingTasks(): Task[];
    getActiveTasks(): Task[];
    getActiveOrAssignedTasks(): Task[];
    getQueuedTasks(): Task[];
    getTasksForAgent(agentId: string): Task[];
    getBlockedTasks(): Task[];
    getDependentTasks(taskId: string): Task[];

    // Task lifecycle operations
    assignNextTask(): boolean;
    assignTask(taskId: string, agentId: string): Promise<boolean>;
    completeTask(taskId: string): boolean;
    failTask(taskId: string, reason?: string): void;

    // Task management operations
    clearCompleted(): void;
    clearAllTasks(): void;

    // Dependency operations
    addTaskDependency(taskId: string, dependsOnTaskId: string): boolean;
    removeTaskDependency(taskId: string, dependsOnTaskId: string): boolean;

    // Conflict resolution
    resolveConflict(taskId: string, resolution: 'block' | 'allow' | 'merge'): boolean;

    // Validation
    validateTask(config: TaskConfig): TaskValidationError[];

    // Statistics
    getTaskStats(): {
        total: number;
        queued: number;
        ready: number;
        assigned: number;
        inProgress: number;
        completed: number;
        failed: number;
        blocked: number;
        validated: number;
    };

    // Event handling
    readonly onTaskUpdate: vscode.Event<void>;

    dispose(): void;
}

// Task Dependency Manager interface for dependency and conflict management
export interface ITaskDependencyManager {
    addDependency(taskId: string, dependsOnTaskId: string): boolean;
    removeDependency(taskId: string, dependsOnTaskId: string): void;
    addSoftDependency(taskId: string, prefersTaskId: string): boolean;
    removeSoftDependency(taskId: string, prefersTaskId: string): void;
    validateDependencies(task: Task, allTasks?: Task[]): TaskValidationError[];
    getReadyTasks(allTasks: Task[]): Task[];
    detectCycles(tasks: Task[]): string[][];
    checkConflicts(task: Task, activeTasks: Task[]): string[];
    resolveConflict(taskId: string, resolution: 'block' | 'allow' | 'merge', task?: Task): boolean;
    getDependentTasks(taskId: string): string[];
    getSoftDependents(taskId: string, allTasks?: Task[]): string[];
    getDependencyGraph(): Record<string, string[]>;
    getSoftDependencyGraph(): Record<string, string[]>;
    getConflicts(): { taskId: string; conflictingTasks: string[]; reason: string }[];
    dispose(): void;
}

// Connection metadata for WebSocket connections
export interface ConnectionMetadata {
    clientId: string;
    userAgent?: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    messageCount: number;
    isAgent: boolean;
}

// Managed connection with WebSocket and metadata
export interface ManagedConnection {
    ws: any; // WebSocket instance
    metadata: ConnectionMetadata;
    lastHeartbeat: Date;
    messageCount: number;
}

// Validation result for message validation
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    result?: any; // Parsed message if valid
}

// Connection Pool Service interface for WebSocket connection management
export interface IConnectionPoolService {
    addConnection(ws: any, clientId: string, metadata: Partial<ConnectionMetadata>): void;
    removeConnection(clientId: string): void;
    getConnection(clientId: string): ManagedConnection | undefined;
    getAllConnections(): Map<string, ManagedConnection>;
    broadcast(message: any, excludeIds?: string[]): void;
    sendToClient(clientId: string, message: any): boolean;
    sendToLogical(logicalId: string, message: any): boolean;
    registerLogicalId(clientId: string, logicalId: string): void;
    resolveLogicalId(logicalId: string): string | undefined;
    unregisterLogicalId(logicalId: string): void;
    getConnectionSummaries(): Array<{
        clientId: string;
        isAgent: boolean;
        connectedAt: string;
        lastHeartbeat: string;
        messageCount: number;
        userAgent?: string;
    }>;
    startHeartbeat(): void;
    stopHeartbeat(): void;
    dispose(): void;
}

// Message Router interface for message distribution
export interface IMessageRouter {
    route(message: any): Promise<void>;
    validateDestination(to: string): boolean;
    handleAcknowledgment(clientId: string, messageId: string): void;
    replayToClient(target: string, filter?: MessageFilter): Promise<void>;
    setDashboardCallback(callback: ((message: any) => void) | undefined): void;
    dispose(): void;
}

// Message Validator interface for message validation
export interface IMessageValidator {
    validate(rawMessage: string): ValidationResult;
    validatePayload(type: string, payload: any): ValidationResult;
    createErrorResponse(error: string, clientId: string): any;
    dispose(): void;
}

// Message filter interface for advanced filtering and pagination
export interface MessageFilter {
    clientId?: string;
    type?: string;
    timeRange?: {
        from?: Date;
        to?: Date;
    };
    offset?: number;
    limit?: number;
}

// Message Persistence Service interface for message storage
export interface IMessagePersistenceService {
    save(message: any): Promise<void>;
    load(offset?: number, limit?: number): Promise<any[]>;
    getHistory(clientId?: string, messageType?: string): Promise<any[]>;
    getHistory(filter?: MessageFilter): Promise<any[]>;
    clear(): Promise<void>;
    getStats(): Promise<{ totalMessages: number; oldestMessage: Date }>;
    dispose(): void;
}

// Validation error interface
export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

// Configuration Validator interface for schema-based validation
export interface IConfigurationValidator {
    validateConfiguration(config: Record<string, any>): { isValid: boolean; errors: ValidationError[] };
    validateConfigurationKey(key: string, value: any): { isValid: boolean; errors: ValidationError[] };
    validateNofXConfiguration(config: Record<string, any>): { isValid: boolean; errors: ValidationError[] };
    getValidationSchema(): any;
    getValidationErrors(): ValidationError[];
    dispose(): void;
}

// Task Tool Bridge interface for sub-agent management
export interface ITaskToolBridge {
    executeTaskForAgent(
        parentAgentId: string,
        type: string,
        description: string,
        prompt: string,
        options?: {
            priority?: number;
            timeout?: number;
            context?: Record<string, any>;
        }
    ): Promise<any>;

    cancelTask(taskId: string): Promise<void>;
    cancelAgentTasks(parentAgentId: string): Promise<void>;
    getAgentTasks(parentAgentId: string): any[];
    getQueuedTasks(parentAgentId: string): any[];
    getStats(): any;
    getAgentStats(parentAgentId: string): any;
    getStatistics(): any;
    dispose(): void;
}

// Message Router Service interface for handling message routing
export interface IMessageRouter {
    route(message: any): Promise<void>;
    setDashboardCallback(callback?: (message: any) => void): void;
    clearDashboardCallback(): void;
    getDeliveryStats(): any;
    dispose(): void;
}

// Session Persistence Service interface for managing agent sessions
export interface IPersistenceService {
    createSession(agent: any, workingDirectory?: string): Promise<any>;
    restoreSession(sessionId: string, options: any): Promise<any | null>;
    archiveSession(sessionId: string): Promise<void>;
    getSessionSummaries(): Promise<any[]>;
    getActiveSession(agentId: string): Promise<any | null>;
    updateSession(sessionId: string, updates: Partial<any>): Promise<void>;
    dispose(): void;
}

// Unified persistence service interface
export interface IPersistenceService {
    // Agent lifecycle
    saveAgent(agent: any): Promise<void>;
    loadAgents(): Promise<any[]>;
    removeAgent(agentId: string): Promise<void>;

    // Session management
    createSession(agent: any): Promise<any>;
    addMessage(sessionId: string, message: any): Promise<void>;
    startTask(sessionId: string, task: any): Promise<string>;
    completeTask(sessionId: string, taskId: string, success?: boolean): Promise<void>;
    archiveSession(sessionId: string): Promise<void>;
    getActiveSessions(): Promise<any[]>;

    // Utility
    clearAllData(): Promise<void>;
    getStorageStats(): Promise<{ agents: number; sessions: number; storageVersion: string }>;
    dispose(): void;
}
