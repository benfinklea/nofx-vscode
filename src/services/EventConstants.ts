/**
 * Unified Event System for NofX VS Code Extension
 * Single namespace for all events with proper typing and metrics support
 */

// Unified event constants - all events in one namespace
export const EVENTS = {
    // Agent events
    AGENT_CREATED: 'agent.created',
    AGENT_REMOVED: 'agent.removed',
    AGENT_STATUS_CHANGED: 'agent.status.changed',
    AGENT_TERMINATED: 'agent.terminated',
    AGENT_FAILED: 'agent.failed',
    AGENT_RECOVERY_STARTED: 'agent.recovery.started',
    AGENT_RECOVERY_COMPLETED: 'agent.recovery.completed',
    AGENT_ALL_TERMINATED: 'agent.all.terminated',
    AGENT_SAVED: 'agent.saved',

    // Agent spawn events (batch operations)
    AGENT_SPAWN_REQUESTED: 'agent.spawn.requested',
    AGENT_SPAWN_SUCCESS: 'agent.spawn.success',
    AGENT_SPAWN_FAILED: 'agent.spawn.failed',
    AGENT_SPAWN_BATCH_COMPLETE: 'agent.spawn.batch.complete',

    // Task events
    TASK_CREATED: 'task.created',
    TASK_ASSIGNED: 'task.assigned',
    TASK_COMPLETED: 'task.completed',
    TASK_FAILED: 'task.failed',
    TASK_STATE_CHANGED: 'task.state.changed',
    TASK_BLOCKED: 'task.blocked',
    TASK_READY: 'task.ready',
    TASK_WAITING: 'task.waiting',
    TASK_ADDED: 'task.added',
    TASK_PROGRESS: 'task.progress',
    TASK_DEPENDENCY_ADDED: 'task.dependency.added',
    TASK_DEPENDENCY_REMOVED: 'task.dependency.removed',
    TASK_DEPENDENCY_RESOLVED: 'task.dependency.resolved',
    TASK_SOFT_DEPENDENCY_ADDED: 'task.soft-dependency.added',
    TASK_SOFT_DEPENDENCY_REMOVED: 'task.soft-dependency.removed',
    TASK_SOFT_DEPENDENCY_SATISFIED: 'task.soft-dependency.satisfied',
    TASK_PRIORITY_UPDATED: 'task.priority.updated',
    TASK_CONFLICT_DETECTED: 'task.conflict.detected',
    TASK_CONFLICT_RESOLVED: 'task.conflict.resolved',
    TASK_CONFLICT_DECISION: 'task.conflict.decision',
    TASK_MATCH_SCORE: 'task.match.score',

    // Agent task events
    AGENT_TASK_ASSIGNED: 'agent.task.assigned',
    AGENT_TASK_COMPLETED: 'agent.task.completed',
    AGENT_TASK_INTERRUPTED: 'agent.task.interrupted',

    // Worktree events
    WORKTREE_CREATED: 'worktree.created',
    WORKTREE_REMOVED: 'worktree.removed',
    WORKTREE_MERGED: 'worktree.merged',
    WORKTREE_OPERATION_COMPLETE: 'worktree.operation.complete',

    // Terminal events
    TERMINAL_CREATED: 'terminal.created',
    TERMINAL_CLOSED: 'terminal.closed',
    TERMINAL_DISPOSED: 'terminal.disposed',

    // Configuration events
    CONFIG_CHANGED: 'config.changed',
    CONFIG_UPDATED: 'config.updated',
    CONFIG_VALIDATION_FAILED: 'config.validation.failed',
    CONFIG_API_ERROR: 'config.api.error',
    CONFIG_UPDATE_FAILED: 'config.update.failed',
    CONFIG_BACKED_UP: 'config.backed.up',
    CONFIG_RESTORED: 'config.restored',

    // Orchestration events (keep only used ones)
    ORCH_MESSAGE_RECEIVED: 'orchestration.message.received',
    ORCH_CLIENT_CONNECTED: 'orchestration.client.connected',
    ORCH_CLIENT_DISCONNECTED: 'orchestration.client.disconnected',
    ORCH_SERVER_STARTED: 'orchestration.server.started',
    ORCH_SERVER_STOPPED: 'orchestration.server.stopped',
    ORCH_SERVICE_STARTED: 'orchestration.service.started',
    ORCH_SERVICE_STOPPED: 'orchestration.service.stopped',
    ORCH_CONNECTION_ESTABLISHED: 'orchestration.connection.established',
    ORCH_CONNECTION_CLOSED: 'orchestration.connection.closed',
    ORCH_LOGICAL_ID_REGISTERED: 'orchestration.logical_id.registered',
    ORCH_LOGICAL_ID_UNREGISTERED: 'orchestration.logical_id.unregistered',
    ORCH_MESSAGE_ROUTED: 'orchestration.message.routed',
    ORCH_MESSAGE_ACKNOWLEDGED: 'orchestration.message.acknowledged',
    ORCH_MESSAGE_DELIVERED: 'orchestration.message.delivered',
    ORCH_MESSAGE_DELIVERY_FAILED: 'orchestration.message.delivery_failed',
    ORCH_HEARTBEAT_SENT: 'orchestration.heartbeat.sent',
    ORCH_HEARTBEAT_RECEIVED: 'orchestration.heartbeat.received',
    ORCH_CONNECTION_TIMEOUT: 'orchestration.connection.timeout',
    ORCH_CONNECTION_WELCOME_SENT: 'orchestration.connection.welcome_sent',
    ORCH_MESSAGE_TO_DASHBOARD: 'orchestration.message.to_dashboard',
    ORCH_MESSAGE_TO_AGENTS: 'orchestration.message.to_agents',
    ORCH_MESSAGE_BROADCASTED: 'orchestration.message.broadcasted',
    ORCH_MESSAGE_VALIDATION_FAILED: 'orchestration.message.validation.failed',
    ORCH_MESSAGE_PERSISTENCE_FAILED: 'orchestration.message.persistence_failed',
    ORCH_MESSAGE_PERSISTED: 'orchestration.message.persisted',
    ORCH_MESSAGE_STORAGE_CLEANUP: 'orchestration.message.storage.cleanup',
    ORCH_AGENT_SPAWN_REQUESTED: 'orchestration.agent.spawn.requested',
    ORCH_TASK_ASSIGNMENT_REQUESTED: 'orchestration.task.assignment.requested',
    ORCH_AGENT_TERMINATION_REQUESTED: 'orchestration.agent.termination.requested',
    ORCH_STATUS_QUERY_REQUESTED: 'orchestration.status.query.requested',
    ORCH_AGENT_SPAWNED: 'orchestration.agent.spawned',
    ORCH_AGENT_TERMINATED: 'orchestration.agent.terminated',

    // UI events
    UI_STATE_CHANGED: 'ui.state.changed',
    DASHBOARD_STATE_CHANGED: 'ui.dashboard.state.changed',
    TREE_STATE_CHANGED: 'ui.tree.state.changed',
    VIEW_OPENED: 'ui.view.opened',
    VIEW_CLOSED: 'ui.view.closed',
    VIEW_FOCUSED: 'ui.view.focused',
    PANEL_CREATED: 'ui.panel.created',
    PANEL_DISPOSED: 'ui.panel.disposed',
    WEBVIEW_MESSAGE_RECEIVED: 'ui.webview.message.received',
    WEBVIEW_MESSAGE_SENT: 'ui.webview.message.sent',
    TREE_ITEM_SELECTED: 'ui.tree.item.selected',
    TREE_ITEM_EXPANDED: 'ui.tree.item.expanded',
    TREE_ITEM_COLLAPSED: 'ui.tree.item.collapsed',
    TREE_REFRESH_REQUESTED: 'ui.tree.refresh.requested',

    // Theme events
    THEME_CHANGED: 'theme.changed',

    // Message events
    MESSAGE_RECEIVED: 'message.received',
    CONNECTION_ESTABLISHED: 'connection.established',
    CONNECTION_LOST: 'connection.lost',

    // Session management events (deprecated but still used)
    SESSION_CREATED: 'session.created',
    SESSION_ARCHIVED: 'session.archived',
    SESSION_RESTORED: 'session.restored',
    SESSION_EXPIRED: 'session.expired',
    SESSION_EXPIRY_WARNING: 'session.expiry.warning',
    SESSION_TASK_STARTED: 'session.task.started',
    SESSION_TASK_COMPLETED: 'session.task.completed',

    // Persistence events
    PERSISTENCE_OPERATION_COMPLETE: 'persistence.operation.complete',

    // Dashboard events
    DASHBOARD_COMMAND: 'dashboard.command',

    // System events
    SYSTEM_ERROR: 'system.error',

    // Metrics events
    METRICS_UPDATED: 'metrics.updated',

    // Load balancing events
    LOAD_BALANCING_EVENT: 'load.balancing.event'
} as const;

// Event payload types
export interface MessageReceivedPayload {
    message: any; // OrchestratorMessage
}

export interface ClientConnectedPayload {
    clientId: string;
    metadata: any; // ConnectionMetadata
}

export interface ClientDisconnectedPayload {
    clientId: string;
    metadata: any; // ConnectionMetadata
}

export interface ServerStartedPayload {
    port: number;
}

export interface ServerStoppedPayload {
    // Empty payload
}

export interface LogicalIdRegisteredPayload {
    clientId: string;
    logicalId: string;
    timestamp: string;
}

export interface LogicalIdUnregisteredPayload {
    clientId: string;
    logicalId: string;
    timestamp: string;
}

export interface LogicalIdReassignedPayload {
    logicalId: string;
    previousClientId: string;
    newClientId: string;
    timestamp: string;
}

export interface MessagePersistenceFailedPayload {
    messageId: string;
    error: string;
    failureCount: number;
    lastFailure: Date;
}

export interface HeartbeatSentPayload {
    clientId: string;
    timestamp: string;
}

export interface HeartbeatReceivedPayload {
    clientId: string;
    timestamp: string;
}

export interface ConnectionTimeoutPayload {
    clientId: string;
    lastHeartbeat: string;
    timeoutMs: number;
}

export interface MessageBroadcastedPayload {
    messageId: string;
    sender: string;
    sentCount: number;
    failedCount: number;
    excludedCount: number;
    timestamp: string;
}

export interface MessageToDashboardPayload {
    messageId: string;
    sender: string;
    timestamp: string;
}

export interface MessageDeliveredPayload {
    messageId: string;
    from: string;
    to: string;
    resolvedTo: string;
    timestamp: string;
}

export interface MessageDeliveryFailedPayload {
    messageId: string;
    from: string;
    to: string;
    resolvedTo?: string;
    reason: string;
}

export interface MessageToAgentsPayload {
    messageId: string;
    sender: string;
    agentCount: number;
    successCount: number;
    timestamp: string;
}

export interface MessageAcknowledgedPayload {
    clientId: string;
    messageId: string;
    timestamp: string;
}

export interface ConnectionWelcomeSentPayload {
    clientId: string;
}

export interface MessageRoutedPayload {
    messageId: string;
    destination: string;
    success: boolean;
    requiresAck?: boolean;
}

export interface MessageValidationFailedPayload {
    messageId: string;
    errors: string[];
    warnings: string[];
    messageType: string;
}

// Event metrics and subscription tracking
export interface EventMetrics {
    publishCount: number;
    subscriberCount: number;
    lastPublished: Date | null;
    avgFrequency: number;
    hasSubscribers: boolean;
}

// Event subscription info
export interface EventSubscription {
    event: string;
    handler: (...args: any[]) => void;
    disposable: { dispose(): void };
    subscribedAt: Date;
}

// Type helpers for event names
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// Backward compatibility - DEPRECATED (use EVENTS instead)
/** @deprecated Use EVENTS instead */
export const DOMAIN_EVENTS = EVENTS;
/** @deprecated Use EVENTS instead */
export const AGENT_EVENTS = {
    AGENT_CREATED: EVENTS.AGENT_CREATED,
    AGENT_TERMINATED: EVENTS.AGENT_TERMINATED,
    ALL_TERMINATED: EVENTS.AGENT_ALL_TERMINATED
} as const;
/** @deprecated Use EVENTS instead */
export const TASK_EVENTS = {
    TASK_CREATED: EVENTS.TASK_CREATED,
    TASK_ASSIGNED: EVENTS.TASK_ASSIGNED,
    TASK_COMPLETED: EVENTS.TASK_COMPLETED,
    TASK_FAILED: EVENTS.TASK_FAILED
} as const;
/** @deprecated Use EVENTS instead */
export const CONFIG_EVENTS = {
    CONFIG_CHANGED: EVENTS.CONFIG_CHANGED,
    CONFIG_UPDATED: EVENTS.CONFIG_UPDATED,
    CONFIG_VALIDATION_FAILED: EVENTS.CONFIG_VALIDATION_FAILED,
    CONFIG_API_ERROR: EVENTS.CONFIG_API_ERROR,
    CONFIG_UPDATE_FAILED: EVENTS.CONFIG_UPDATE_FAILED,
    CONFIG_BACKED_UP: EVENTS.CONFIG_BACKED_UP,
    CONFIG_RESTORED: EVENTS.CONFIG_RESTORED
} as const;
/** @deprecated Use EVENTS instead */
export const ORCH_EVENTS = {
    MESSAGE_RECEIVED: EVENTS.ORCH_MESSAGE_RECEIVED,
    CLIENT_CONNECTED: EVENTS.ORCH_CLIENT_CONNECTED,
    CLIENT_DISCONNECTED: EVENTS.ORCH_CLIENT_DISCONNECTED,
    SERVER_STARTED: EVENTS.ORCH_SERVER_STARTED,
    SERVER_STOPPED: EVENTS.ORCH_SERVER_STOPPED,
    SERVICE_STARTED: EVENTS.ORCH_SERVICE_STARTED,
    SERVICE_STOPPED: EVENTS.ORCH_SERVICE_STOPPED,
    CONNECTION_ESTABLISHED: EVENTS.ORCH_CONNECTION_ESTABLISHED,
    CONNECTION_CLOSED: EVENTS.ORCH_CONNECTION_CLOSED,
    LOGICAL_ID_REGISTERED: EVENTS.ORCH_LOGICAL_ID_REGISTERED,
    LOGICAL_ID_UNREGISTERED: EVENTS.ORCH_LOGICAL_ID_UNREGISTERED,
    MESSAGE_ROUTED: EVENTS.ORCH_MESSAGE_ROUTED,
    MESSAGE_ACKNOWLEDGED: EVENTS.ORCH_MESSAGE_ACKNOWLEDGED,
    MESSAGE_DELIVERED: EVENTS.ORCH_MESSAGE_DELIVERED,
    MESSAGE_DELIVERY_FAILED: EVENTS.ORCH_MESSAGE_DELIVERY_FAILED,
    MESSAGE_TO_DASHBOARD: EVENTS.ORCH_MESSAGE_TO_DASHBOARD,
    MESSAGE_TO_AGENTS: EVENTS.ORCH_MESSAGE_TO_AGENTS,
    MESSAGE_BROADCASTED: EVENTS.ORCH_MESSAGE_BROADCASTED,
    MESSAGE_VALIDATION_FAILED: EVENTS.ORCH_MESSAGE_VALIDATION_FAILED,
    MESSAGE_PERSISTENCE_FAILED: EVENTS.ORCH_MESSAGE_PERSISTENCE_FAILED,
    MESSAGE_PERSISTED: EVENTS.ORCH_MESSAGE_PERSISTED,
    MESSAGE_STORAGE_CLEANUP: EVENTS.ORCH_MESSAGE_STORAGE_CLEANUP,
    AGENT_SPAWN_REQUESTED: EVENTS.ORCH_AGENT_SPAWN_REQUESTED,
    TASK_ASSIGNMENT_REQUESTED: EVENTS.ORCH_TASK_ASSIGNMENT_REQUESTED,
    AGENT_TERMINATION_REQUESTED: EVENTS.ORCH_AGENT_TERMINATION_REQUESTED,
    STATUS_QUERY_REQUESTED: EVENTS.ORCH_STATUS_QUERY_REQUESTED,
    AGENT_SPAWNED: EVENTS.ORCH_AGENT_SPAWNED,
    AGENT_TERMINATED: EVENTS.ORCH_AGENT_TERMINATED
} as const;
/** @deprecated Use EVENTS instead */
export const UI_EVENTS = {
    UI_STATE_CHANGED: EVENTS.UI_STATE_CHANGED,
    DASHBOARD_STATE_CHANGED: EVENTS.DASHBOARD_STATE_CHANGED,
    TREE_STATE_CHANGED: EVENTS.TREE_STATE_CHANGED,
    VIEW_OPENED: EVENTS.VIEW_OPENED,
    VIEW_CLOSED: EVENTS.VIEW_CLOSED,
    VIEW_FOCUSED: EVENTS.VIEW_FOCUSED,
    PANEL_CREATED: EVENTS.PANEL_CREATED,
    PANEL_DISPOSED: EVENTS.PANEL_DISPOSED,
    WEBVIEW_MESSAGE_RECEIVED: EVENTS.WEBVIEW_MESSAGE_RECEIVED,
    WEBVIEW_MESSAGE_SENT: EVENTS.WEBVIEW_MESSAGE_SENT,
    TREE_ITEM_SELECTED: EVENTS.TREE_ITEM_SELECTED,
    TREE_ITEM_EXPANDED: EVENTS.TREE_ITEM_EXPANDED,
    TREE_ITEM_COLLAPSED: EVENTS.TREE_ITEM_COLLAPSED,
    TREE_REFRESH_REQUESTED: EVENTS.TREE_REFRESH_REQUESTED
} as const;

// Legacy type aliases for backward compatibility
/** @deprecated Use EventName instead */
export type DomainEventName = EventName;
/** @deprecated Use EventName instead */
export type OrchEventName = EventName;
/** @deprecated Use EventName instead */
export type UIEventName = EventName;
