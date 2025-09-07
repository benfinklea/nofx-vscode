import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { TerminalOutputMonitor, TerminalActivity } from './TerminalOutputMonitor';
import { InactivityMonitor, InactivityStatus } from './InactivityMonitor';
import { Agent } from '../types/agent';

export interface ActivityMetrics {
    agentId: string;
    lastActiveTimestamp: Date;
    outputLinesPerMinute: number;
    idleTimeSeconds: number;
    permissionRequestCount: number;
    taskCompletionCount: number;
    errorCount: number;
    totalActiveTime: number;
}

export interface MonitoringEvent {
    type: 'activity' | 'inactivity' | 'permission' | 'completion' | 'error' | 'status-change';
    agentId: string;
    data: any;
    timestamp: Date;
}

export type AgentActivityStatus =
    | 'active'      // 🟢 Currently working (output detected)
    | 'waiting'     // 🟡 Awaiting user input/permission
    | 'thinking'    // 🔵 No output but recently active
    | 'inactive'    // 🟠 No activity for 30+ seconds
    | 'stuck'       // 🔴 Needs immediate attention (2+ minutes)
    | 'permission'  // ⚠️ Claude asking for permission
    | 'completed'   // ✅ Task completed
    | 'error';      // ❌ Error detected

export class ActivityMonitor extends EventEmitter {
    private terminalMonitor: TerminalOutputMonitor;
    private inactivityMonitor: InactivityMonitor;
    private agentTerminals: Map<string, vscode.Terminal> = new Map();
    private agentMetrics: Map<string, ActivityMetrics> = new Map();
    private agentStatus: Map<string, AgentActivityStatus> = new Map();
    private activityLog: MonitoringEvent[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        super();
        this.terminalMonitor = new TerminalOutputMonitor();
        this.inactivityMonitor = new InactivityMonitor(this.getMonitoringConfig());
        this.setupEventListeners();
    }

    /**
     * Start monitoring an agent
     */
    public startMonitoring(agent: Agent, terminal: vscode.Terminal): void {
        const agentId = agent.id;

        // Store terminal reference
        this.agentTerminals.set(agentId, terminal);

        // Initialize metrics
        this.initializeMetrics(agentId);

        // Start terminal output monitoring
        this.terminalMonitor.monitorTerminal(terminal, agentId);

        // Start inactivity monitoring
        this.inactivityMonitor.startMonitoring(agentId);

        // Set initial status
        this.updateAgentStatus(agentId, 'active');

        console.log(`[ActivityMonitor] Started monitoring agent ${agent.name} (${agentId})`);

        // Emit monitoring started event
        this.emitMonitoringEvent({
            type: 'status-change',
            agentId,
            data: { status: 'active', message: 'Monitoring started' },
            timestamp: new Date()
        });
    }

    /**
     * Setup event listeners for terminal and inactivity monitors
     */
    private setupEventListeners(): void {
        // Terminal output pattern events
        this.terminalMonitor.on('pattern:completion', (activity: TerminalActivity) => {
            this.handleTaskCompletion(activity);
        });

        this.terminalMonitor.on('pattern:permission', (activity: TerminalActivity) => {
            this.handlePermissionRequest(activity);
        });

        this.terminalMonitor.on('pattern:error', (activity: TerminalActivity) => {
            this.handleError(activity);
        });

        this.terminalMonitor.on('pattern:waiting', (activity: TerminalActivity) => {
            this.handleWaiting(activity);
        });

        this.terminalMonitor.on('pattern:thinking', (activity: TerminalActivity) => {
            this.handleThinking(activity);
        });

        this.terminalMonitor.on('activity', (activity: TerminalActivity) => {
            // Record any activity
            this.inactivityMonitor.recordActivity(activity.agentId, activity.pattern);
            this.updateMetrics(activity.agentId, 'activity');
        });

        // Inactivity monitor events
        this.inactivityMonitor.on('warning', (data: any) => {
            this.handleInactivityWarning(data);
        });

        this.inactivityMonitor.on('alert', (data: any) => {
            this.handleInactivityAlert(data);
        });

        this.inactivityMonitor.on('status-change', (data: any) => {
            this.handleStatusChange(data);
        });

        this.inactivityMonitor.on('heartbeat', (status: InactivityStatus) => {
            // Update metrics on heartbeat
            this.updateMetrics(status.agentId, 'heartbeat');
        });
    }

    /**
     * Handle task completion detection
     */
    private handleTaskCompletion(activity: TerminalActivity): void {
        const { agentId } = activity;

        this.updateAgentStatus(agentId, 'completed');
        this.updateMetrics(agentId, 'completion');

        this.emitMonitoringEvent({
            type: 'completion',
            agentId,
            data: {
                message: activity.match,
                pattern: 'completion'
            },
            timestamp: activity.timestamp
        });

        // Auto-transition back to active after a brief period
        setTimeout(() => {
            if (this.agentStatus.get(agentId) === 'completed') {
                this.updateAgentStatus(agentId, 'active');
            }
        }, 5000);
    }

    /**
     * Handle permission request detection
     */
    private handlePermissionRequest(activity: TerminalActivity): void {
        const { agentId } = activity;

        this.updateAgentStatus(agentId, 'permission');
        this.updateMetrics(agentId, 'permission');

        this.emitMonitoringEvent({
            type: 'permission',
            agentId,
            data: {
                message: activity.match,
                pattern: 'permission',
                requiresUserAction: true
            },
            timestamp: activity.timestamp
        });
    }

    /**
     * Handle error detection
     */
    private handleError(activity: TerminalActivity): void {
        const { agentId } = activity;

        this.updateAgentStatus(agentId, 'error');
        this.updateMetrics(agentId, 'error');

        this.emitMonitoringEvent({
            type: 'error',
            agentId,
            data: {
                message: activity.match,
                pattern: 'error',
                severity: this.determineErrorSeverity(activity.match)
            },
            timestamp: activity.timestamp
        });
    }

    /**
     * Handle waiting state
     */
    private handleWaiting(activity: TerminalActivity): void {
        const { agentId } = activity;

        this.updateAgentStatus(agentId, 'waiting');

        this.emitMonitoringEvent({
            type: 'activity',
            agentId,
            data: {
                message: activity.match,
                pattern: 'waiting',
                requiresUserAction: true
            },
            timestamp: activity.timestamp
        });
    }

    /**
     * Handle thinking state
     */
    private handleThinking(activity: TerminalActivity): void {
        const { agentId } = activity;

        this.updateAgentStatus(agentId, 'thinking');

        this.emitMonitoringEvent({
            type: 'activity',
            agentId,
            data: {
                message: activity.match,
                pattern: 'thinking'
            },
            timestamp: activity.timestamp
        });
    }

    /**
     * Handle inactivity warning (30 seconds)
     */
    private handleInactivityWarning(data: any): void {
        const { agentId } = data;

        this.updateAgentStatus(agentId, 'inactive');

        this.emitMonitoringEvent({
            type: 'inactivity',
            agentId,
            data: {
                level: 'warning',
                inactiveSeconds: 30,
                message: data.message
            },
            timestamp: new Date()
        });
    }

    /**
     * Handle inactivity alert (2 minutes)
     */
    private handleInactivityAlert(data: any): void {
        const { agentId } = data;

        this.updateAgentStatus(agentId, 'stuck');

        this.emitMonitoringEvent({
            type: 'inactivity',
            agentId,
            data: {
                level: 'alert',
                inactiveSeconds: 120,
                message: data.message,
                requiresImmediateAttention: true
            },
            timestamp: new Date()
        });
    }

    /**
     * Handle status change from inactivity monitor
     */
    private handleStatusChange(data: any): void {
        const { agentId, newStatus } = data;

        // Map inactivity status to activity status
        const statusMap: { [key: string]: AgentActivityStatus } = {
            'active': 'active',
            'thinking': 'thinking',
            'inactive': 'inactive',
            'stuck': 'stuck',
            'waiting': 'waiting'
        };

        const mappedStatus = statusMap[newStatus] || 'active';
        this.updateAgentStatus(agentId, mappedStatus);
    }

    /**
     * Update agent status
     */
    private updateAgentStatus(agentId: string, status: AgentActivityStatus): void {
        const previousStatus = this.agentStatus.get(agentId);

        if (previousStatus !== status) {
            this.agentStatus.set(agentId, status);

            // Emit status change event
            this.emit('agent-status-changed', {
                agentId,
                previousStatus,
                newStatus: status,
                timestamp: new Date()
            });

            console.log(`[ActivityMonitor] Agent ${agentId} status changed: ${previousStatus} → ${status}`);
        }
    }

    /**
     * Initialize metrics for an agent
     */
    private initializeMetrics(agentId: string): void {
        this.agentMetrics.set(agentId, {
            agentId,
            lastActiveTimestamp: new Date(),
            outputLinesPerMinute: 0,
            idleTimeSeconds: 0,
            permissionRequestCount: 0,
            taskCompletionCount: 0,
            errorCount: 0,
            totalActiveTime: 0
        });
    }

    /**
     * Update metrics for an agent
     */
    private updateMetrics(agentId: string, eventType: string): void {
        const metrics = this.agentMetrics.get(agentId);
        if (!metrics) return;

        const now = new Date();

        switch (eventType) {
            case 'activity':
                metrics.lastActiveTimestamp = now;
                metrics.outputLinesPerMinute = this.calculateOutputRate(agentId);
                break;
            case 'permission':
                metrics.permissionRequestCount++;
                break;
            case 'completion':
                metrics.taskCompletionCount++;
                break;
            case 'error':
                metrics.errorCount++;
                break;
            case 'heartbeat':
                const idleTime = (now.getTime() - metrics.lastActiveTimestamp.getTime()) / 1000;
                metrics.idleTimeSeconds = Math.floor(idleTime);
                break;
        }

        this.agentMetrics.set(agentId, metrics);
    }

    /**
     * Calculate output rate for an agent
     */
    private calculateOutputRate(agentId: string): number {
        // This would need to track output over time
        // For now, return a placeholder
        return 10; // lines per minute
    }

    /**
     * Determine error severity
     */
    private determineErrorSeverity(errorMessage: string): 'low' | 'medium' | 'high' | 'critical' {
        if (errorMessage.toLowerCase().includes('permission denied')) {
            return 'high';
        }
        if (errorMessage.toLowerCase().includes('exception') || errorMessage.toLowerCase().includes('crash')) {
            return 'critical';
        }
        if (errorMessage.toLowerCase().includes('failed')) {
            return 'medium';
        }
        return 'low';
    }

    /**
     * Emit monitoring event
     */
    private emitMonitoringEvent(event: MonitoringEvent): void {
        // Add to log
        this.activityLog.push(event);

        // Limit log size
        if (this.activityLog.length > 1000) {
            this.activityLog = this.activityLog.slice(-500);
        }

        // Emit the event
        this.emit('monitoring-event', event);
    }

    /**
     * Get monitoring configuration from VS Code settings
     */
    private getMonitoringConfig(): any {
        const config = vscode.workspace.getConfiguration('nofx.monitoring');
        return {
            warningThreshold: config.get<number>('inactivityWarning', 30),
            alertThreshold: config.get<number>('inactivityAlert', 120),
            heartbeatInterval: 15
        };
    }

    /**
     * Get current status for an agent
     */
    public getAgentStatus(agentId: string): AgentActivityStatus | undefined {
        return this.agentStatus.get(agentId);
    }

    /**
     * Get metrics for an agent
     */
    public getAgentMetrics(agentId: string): ActivityMetrics | undefined {
        return this.agentMetrics.get(agentId);
    }

    /**
     * Get all agent statuses
     */
    public getAllAgentStatuses(): Map<string, AgentActivityStatus> {
        return new Map(this.agentStatus);
    }

    /**
     * Get activity log
     */
    public getActivityLog(agentId?: string): MonitoringEvent[] {
        if (agentId) {
            return this.activityLog.filter(event => event.agentId === agentId);
        }
        return [...this.activityLog];
    }

    /**
     * Stop monitoring an agent
     */
    public stopMonitoring(agentId: string): void {
        // Stop terminal monitoring
        const terminal = this.agentTerminals.get(agentId);
        if (terminal) {
            this.terminalMonitor.stopMonitoring(terminal);
            this.agentTerminals.delete(agentId);
        }

        // Stop inactivity monitoring
        this.inactivityMonitor.stopMonitoring(agentId);

        // Clear data
        this.agentStatus.delete(agentId);
        this.agentMetrics.delete(agentId);

        console.log(`[ActivityMonitor] Stopped monitoring agent ${agentId}`);
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        this.terminalMonitor.dispose();
        this.inactivityMonitor.dispose();
        this.disposables.forEach(d => d.dispose());
        this.agentTerminals.clear();
        this.agentStatus.clear();
        this.agentMetrics.clear();
        this.activityLog = [];
        this.removeAllListeners();
    }
}
