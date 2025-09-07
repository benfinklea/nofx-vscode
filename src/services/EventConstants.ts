/**
 * Event constants for UI and domain events
 * Centralizes event names to prevent mismatches and typos
 */

// Domain events - business logic events
export const DOMAIN_EVENTS = {
    // Agent events
    AGENT_CREATED: 'agent.created',
    AGENT_REMOVED: 'agent.removed',
    AGENT_STATUS_CHANGED: 'agent.status.changed',

    // Agent lifecycle events
    AGENT_LIFECYCLE_SPAWNING: 'agent.lifecycle.spawning',
    AGENT_LIFECYCLE_SPAWNED: 'agent.lifecycle.spawned',
    AGENT_LIFECYCLE_REMOVING: 'agent.lifecycle.removing',
    AGENT_LIFECYCLE_REMOVED: 'agent.lifecycle.removed',

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

    // Theme events
    THEME_CHANGED: 'theme.changed',

    // Orchestration events
    MESSAGE_RECEIVED: 'message.received',
    CONNECTION_ESTABLISHED: 'connection.established',
    CONNECTION_LOST: 'connection.lost',

    // Worktree events
    WORKTREE_CREATED: 'worktree.created',
    WORKTREE_REMOVED: 'worktree.removed',
    WORKTREE_MERGED: 'worktree.merged',

    // Terminal events
    TERMINAL_CREATED: 'terminal.created',
    TERMINAL_CLOSED: 'terminal.closed',
    TERMINAL_DISPOSED: 'terminal.disposed',

    // Agent task events
    AGENT_TASK_ASSIGNED: 'agent.task.assigned',
    AGENT_TASK_COMPLETED: 'agent.task.completed',
    AGENT_TASK_INTERRUPTED: 'agent.task.interrupted'
} as const;

// Configuration events
export const CONFIG_EVENTS = {
    CONFIG_CHANGED: 'configuration.changed',
    CONFIG_UPDATED: 'configuration.updated',
    CONFIG_VALIDATION_FAILED: 'configuration.validation.failed',
    CONFIG_API_ERROR: 'configuration.api.error',
    CONFIG_UPDATE_FAILED: 'configuration.update.failed',
    CONFIG_BACKED_UP: 'configuration.backed.up',
    CONFIG_RESTORED: 'configuration.restored'
} as const;

// Orchestration events - specific to orchestration server
export const ORCH_EVENTS = {
    MESSAGE_RECEIVED: 'orchestration.message.received',
    CLIENT_CONNECTED: 'orchestration.client.connected',
    CLIENT_DISCONNECTED: 'orchestration.client.disconnected',
    SERVER_STARTED: 'orchestration.server.started',
    SERVER_STOPPED: 'orchestration.server.stopped',
    // Heartbeat events
    HEARTBEAT_SENT: 'orchestration.heartbeat.sent',
    HEARTBEAT_RECEIVED: 'orchestration.heartbeat.received',
    CONNECTION_TIMEOUT: 'orchestration.connection.timeout',
    // Routing events
    MESSAGE_BROADCASTED: 'orchestration.message.broadcasted',
    MESSAGE_TO_DASHBOARD: 'orchestration.message.to_dashboard',
    MESSAGE_DELIVERED: 'orchestration.message.delivered',
    MESSAGE_DELIVERY_FAILED: 'orchestration.message.delivery_failed',
    MESSAGE_TO_AGENTS: 'orchestration.message.to_agents',
    MESSAGE_ACKNOWLEDGED: 'orchestration.message.acknowledged',
    // Connection events
    CONNECTION_WELCOME_SENT: 'orchestration.connection.welcome_sent',
    // Logical ID events
    LOGICAL_ID_REGISTERED: 'orchestration.logical_id.registered',
    LOGICAL_ID_UNREGISTERED: 'orchestration.logical_id.unregistered',
    LOGICAL_ID_REASSIGNED: 'orchestration.logical_id.reassigned',
    // Message persistence events
    MESSAGE_PERSISTED: 'orchestration.message.persisted',
    MESSAGE_PERSISTENCE_FAILED: 'orchestration.message.persistence_failed',
    MESSAGE_STORAGE_ROLLED: 'orchestration.message.storage.rolled',
    MESSAGE_STORAGE_CLEANUP: 'orchestration.message.storage.cleanup',
    // Message routing events
    MESSAGE_ROUTED: 'orchestration.message.routed',
    // Message validation events
    MESSAGE_VALIDATION_FAILED: 'orchestration.message.validation.failed'
} as const;

// UI events - user interface events
export const UI_EVENTS = {
    // State change events
    UI_STATE_CHANGED: 'ui.state.changed',
    DASHBOARD_STATE_CHANGED: 'dashboard.state.changed',
    TREE_STATE_CHANGED: 'tree.state.changed',

    // View events
    VIEW_OPENED: 'view.opened',
    VIEW_CLOSED: 'view.closed',
    VIEW_FOCUSED: 'view.focused',

    // Panel events
    PANEL_CREATED: 'panel.created',
    PANEL_DISPOSED: 'panel.disposed',

    // Webview events
    WEBVIEW_MESSAGE_RECEIVED: 'webview.message.received',
    WEBVIEW_MESSAGE_SENT: 'webview.message.sent',

    // Tree view events
    TREE_ITEM_SELECTED: 'tree.item.selected',
    TREE_ITEM_EXPANDED: 'tree.item.expanded',
    TREE_ITEM_COLLAPSED: 'tree.item.collapsed',
    TREE_REFRESH_REQUESTED: 'tree.refresh.requested'
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

// Type helpers for event names
export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
export type OrchEventName = (typeof ORCH_EVENTS)[keyof typeof ORCH_EVENTS];
export type UIEventName = (typeof UI_EVENTS)[keyof typeof UI_EVENTS];
export type EventName = DomainEventName | OrchEventName | UIEventName;
