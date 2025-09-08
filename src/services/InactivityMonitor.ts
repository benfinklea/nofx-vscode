import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export interface InactivityConfig {
    warningThreshold: number; // seconds (default: 30)
    alertThreshold: number; // seconds (default: 120)
    heartbeatInterval: number; // seconds (default: 15)
}

export interface InactivityStatus {
    agentId: string;
    lastActivity: Date;
    status: 'idle' | 'working' | 'thinking' | 'inactive' | 'stuck' | 'waiting';
    inactiveSeconds: number;
    isWorkingOnTask: boolean;
}

export class InactivityMonitor extends EventEmitter {
    private lastActivity: Map<string, Date> = new Map();
    private warningTimers: Map<string, NodeJS.Timeout> = new Map();
    private alertTimers: Map<string, NodeJS.Timeout> = new Map();
    private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
    private agentStatus: Map<string, InactivityStatus['status']> = new Map();
    private agentTaskStatus: Map<string, boolean> = new Map(); // Track if agent is working on a task

    private config: InactivityConfig = {
        warningThreshold: 30,
        alertThreshold: 120,
        heartbeatInterval: 15
    };

    constructor(config?: Partial<InactivityConfig>) {
        super();
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }

    /**
     * Start monitoring inactivity for an agent (agent is idle by default)
     */
    public startMonitoring(agentId: string): void {
        // Initialize activity timestamp
        this.lastActivity.set(agentId, new Date());
        this.agentStatus.set(agentId, 'idle'); // Start as idle, not active
        this.agentTaskStatus.set(agentId, false); // Not working on a task initially

        // Don't set up timers for idle agents - they should be allowed to be inactive
        // Timers will be set up when a task is assigned

        // Set up heartbeat check for status reporting
        this.setupHeartbeat(agentId);

        console.log(`[InactivityMonitor] Started monitoring agent ${agentId} (idle)`);
    }

    /**
     * Start task monitoring for an agent (called when task is assigned)
     */
    public startTaskMonitoring(agentId: string): void {
        if (!this.lastActivity.has(agentId)) {
            console.log(`[InactivityMonitor] Warning: Agent ${agentId} not initialized, initializing now`);
            this.startMonitoring(agentId);
        }

        // Mark as working on a task
        this.agentTaskStatus.set(agentId, true);
        this.updateStatus(agentId, 'working');

        // Reset activity timestamp
        this.lastActivity.set(agentId, new Date());

        // Now set up alert timers since the agent should be active
        this.resetTimers(agentId);
        this.setupWarningTimer(agentId);
        this.setupAlertTimer(agentId);

        console.log(`[InactivityMonitor] Started task monitoring for agent ${agentId}`);
    }

    /**
     * Stop task monitoring for an agent (called when task is completed/failed)
     */
    public stopTaskMonitoring(agentId: string): void {
        if (!this.lastActivity.has(agentId)) {
            return;
        }

        // Mark as not working on a task
        this.agentTaskStatus.set(agentId, false);
        this.updateStatus(agentId, 'idle');

        // Clear alert timers since idle agents shouldn't be alerted
        this.resetTimers(agentId);

        console.log(`[InactivityMonitor] Stopped task monitoring for agent ${agentId} (now idle)`);
    }

    /**
     * Record activity for an agent
     */
    public recordActivity(agentId: string, activityType?: string): void {
        const now = new Date();
        this.lastActivity.set(agentId, now);

        const isWorkingOnTask = this.agentTaskStatus.get(agentId) || false;

        // Only reset timers and update status if the agent is working on a task
        if (isWorkingOnTask) {
            // Reset timers
            this.resetTimers(agentId);

            // Update status based on activity type
            const currentStatus = this.agentStatus.get(agentId);
            if (currentStatus === 'inactive' || currentStatus === 'stuck') {
                this.updateStatus(agentId, 'working');
            }

            // Re-setup timers
            this.setupWarningTimer(agentId);
            this.setupAlertTimer(agentId);

            console.log(
                `[InactivityMonitor] Activity recorded for working agent ${agentId}: ${activityType || 'general'}`
            );
        } else {
            // Just log activity for idle agents, no alerts needed
            console.log(
                `[InactivityMonitor] Activity recorded for idle agent ${agentId}: ${activityType || 'general'} (no alerts)`
            );
        }
    }

    /**
     * Set up warning timer (30 seconds of inactivity) - only for agents working on tasks
     */
    private setupWarningTimer(agentId: string): void {
        const timer = setTimeout(() => {
            const isWorkingOnTask = this.agentTaskStatus.get(agentId) || false;
            const status = this.getInactivityStatus(agentId);

            // Only emit warning if agent is working on a task
            if (isWorkingOnTask && status && status.inactiveSeconds >= this.config.warningThreshold) {
                this.updateStatus(agentId, 'inactive');
                this.emit('warning', {
                    agentId,
                    message: `Agent ${agentId} working on task has been inactive for ${this.config.warningThreshold} seconds`,
                    status
                });
            }
        }, this.config.warningThreshold * 1000);

        this.warningTimers.set(agentId, timer);
    }

    /**
     * Set up alert timer (2 minutes of inactivity) - only for agents working on tasks
     */
    private setupAlertTimer(agentId: string): void {
        const timer = setTimeout(() => {
            const isWorkingOnTask = this.agentTaskStatus.get(agentId) || false;
            const status = this.getInactivityStatus(agentId);

            // Only emit alert if agent is working on a task
            if (isWorkingOnTask && status && status.inactiveSeconds >= this.config.alertThreshold) {
                this.updateStatus(agentId, 'stuck');
                this.emit('alert', {
                    agentId,
                    message: `Agent ${agentId} working on task needs immediate attention - inactive for ${this.config.alertThreshold} seconds`,
                    status
                });
            }
        }, this.config.alertThreshold * 1000);

        this.alertTimers.set(agentId, timer);
    }

    /**
     * Set up heartbeat check
     */
    private setupHeartbeat(agentId: string): void {
        const timer = setInterval(() => {
            const status = this.getInactivityStatus(agentId);
            if (status) {
                this.emit('heartbeat', status);

                const isWorkingOnTask = this.agentTaskStatus.get(agentId) || false;

                // Check for state transitions based on whether agent is working on task
                if (isWorkingOnTask) {
                    if (status.inactiveSeconds < 5) {
                        this.updateStatus(agentId, 'working');
                    } else if (status.inactiveSeconds < 30) {
                        this.updateStatus(agentId, 'thinking');
                    }
                } else {
                    // Idle agents stay idle regardless of activity timing
                    this.updateStatus(agentId, 'idle');
                }
            }
        }, this.config.heartbeatInterval * 1000);

        this.heartbeatTimers.set(agentId, timer);
    }

    /**
     * Update agent status
     */
    private updateStatus(agentId: string, status: InactivityStatus['status']): void {
        const previousStatus = this.agentStatus.get(agentId);
        if (previousStatus !== status) {
            this.agentStatus.set(agentId, status);
            this.emit('status-change', {
                agentId,
                previousStatus,
                newStatus: status,
                timestamp: new Date()
            });
        }
    }

    /**
     * Get current inactivity status for an agent
     */
    public getInactivityStatus(agentId: string): InactivityStatus | null {
        const lastActivity = this.lastActivity.get(agentId);
        if (!lastActivity) {
            return null;
        }

        const now = new Date();
        const inactiveSeconds = Math.floor((now.getTime() - lastActivity.getTime()) / 1000);
        const status = this.agentStatus.get(agentId) || 'idle';
        const isWorkingOnTask = this.agentTaskStatus.get(agentId) || false;

        return {
            agentId,
            lastActivity,
            status,
            inactiveSeconds,
            isWorkingOnTask
        };
    }

    /**
     * Get all monitored agents' status
     */
    public getAllStatus(): InactivityStatus[] {
        const statuses: InactivityStatus[] = [];
        for (const agentId of this.lastActivity.keys()) {
            const status = this.getInactivityStatus(agentId);
            if (status) {
                statuses.push(status);
            }
        }
        return statuses;
    }

    /**
     * Reset timers for an agent
     */
    private resetTimers(agentId: string): void {
        // Clear warning timer
        const warningTimer = this.warningTimers.get(agentId);
        if (warningTimer) {
            clearTimeout(warningTimer);
            this.warningTimers.delete(agentId);
        }

        // Clear alert timer
        const alertTimer = this.alertTimers.get(agentId);
        if (alertTimer) {
            clearTimeout(alertTimer);
            this.alertTimers.delete(agentId);
        }
    }

    /**
     * Stop monitoring an agent
     */
    public stopMonitoring(agentId: string): void {
        // Clear all timers
        this.resetTimers(agentId);

        // Clear heartbeat
        const heartbeatTimer = this.heartbeatTimers.get(agentId);
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            this.heartbeatTimers.delete(agentId);
        }

        // Remove from maps
        this.lastActivity.delete(agentId);
        this.agentStatus.delete(agentId);
        this.agentTaskStatus.delete(agentId);

        console.log(`[InactivityMonitor] Stopped monitoring agent ${agentId}`);
    }

    /**
     * Update configuration
     */
    public updateConfig(config: Partial<InactivityConfig>): void {
        this.config = { ...this.config, ...config };

        // Restart monitoring with new config
        const agentIds = Array.from(this.lastActivity.keys());
        agentIds.forEach(agentId => {
            this.stopMonitoring(agentId);
            this.startMonitoring(agentId);
        });
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        // Clear all timers
        this.warningTimers.forEach(timer => clearTimeout(timer));
        this.alertTimers.forEach(timer => clearTimeout(timer));
        this.heartbeatTimers.forEach(timer => clearInterval(timer));

        // Clear maps
        this.warningTimers.clear();
        this.alertTimers.clear();
        this.heartbeatTimers.clear();
        this.lastActivity.clear();
        this.agentStatus.clear();
        this.agentTaskStatus.clear();

        // Remove all listeners
        this.removeAllListeners();
    }
}
