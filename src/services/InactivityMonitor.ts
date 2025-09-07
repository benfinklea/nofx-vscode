import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export interface InactivityConfig {
    warningThreshold: number;  // seconds (default: 30)
    alertThreshold: number;    // seconds (default: 120)
    heartbeatInterval: number; // seconds (default: 15)
}

export interface InactivityStatus {
    agentId: string;
    lastActivity: Date;
    status: 'active' | 'thinking' | 'inactive' | 'stuck' | 'waiting';
    inactiveSeconds: number;
}

export class InactivityMonitor extends EventEmitter {
    private lastActivity: Map<string, Date> = new Map();
    private warningTimers: Map<string, NodeJS.Timeout> = new Map();
    private alertTimers: Map<string, NodeJS.Timeout> = new Map();
    private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
    private agentStatus: Map<string, InactivityStatus['status']> = new Map();
    
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
     * Start monitoring inactivity for an agent
     */
    public startMonitoring(agentId: string): void {
        // Initialize activity timestamp
        this.lastActivity.set(agentId, new Date());
        this.agentStatus.set(agentId, 'active');

        // Set up warning timer (30 seconds)
        this.setupWarningTimer(agentId);

        // Set up alert timer (2 minutes)
        this.setupAlertTimer(agentId);

        // Set up heartbeat check
        this.setupHeartbeat(agentId);

        console.log(`[InactivityMonitor] Started monitoring agent ${agentId}`);
    }

    /**
     * Record activity for an agent
     */
    public recordActivity(agentId: string, activityType?: string): void {
        const now = new Date();
        this.lastActivity.set(agentId, now);

        // Reset timers
        this.resetTimers(agentId);

        // Update status based on activity type
        const currentStatus = this.agentStatus.get(agentId);
        if (currentStatus === 'inactive' || currentStatus === 'stuck') {
            this.updateStatus(agentId, 'active');
        }

        // Re-setup timers
        this.setupWarningTimer(agentId);
        this.setupAlertTimer(agentId);

        console.log(`[InactivityMonitor] Activity recorded for agent ${agentId}: ${activityType || 'general'}`);
    }

    /**
     * Set up warning timer (30 seconds of inactivity)
     */
    private setupWarningTimer(agentId: string): void {
        const timer = setTimeout(() => {
            const status = this.getInactivityStatus(agentId);
            if (status && status.inactiveSeconds >= this.config.warningThreshold) {
                this.updateStatus(agentId, 'inactive');
                this.emit('warning', {
                    agentId,
                    message: `Agent ${agentId} has been inactive for ${this.config.warningThreshold} seconds`,
                    status
                });
            }
        }, this.config.warningThreshold * 1000);

        this.warningTimers.set(agentId, timer);
    }

    /**
     * Set up alert timer (2 minutes of inactivity)
     */
    private setupAlertTimer(agentId: string): void {
        const timer = setTimeout(() => {
            const status = this.getInactivityStatus(agentId);
            if (status && status.inactiveSeconds >= this.config.alertThreshold) {
                this.updateStatus(agentId, 'stuck');
                this.emit('alert', {
                    agentId,
                    message: `Agent ${agentId} needs immediate attention - inactive for ${this.config.alertThreshold} seconds`,
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

                // Check for state transitions
                if (status.inactiveSeconds < 5) {
                    this.updateStatus(agentId, 'active');
                } else if (status.inactiveSeconds < 30) {
                    this.updateStatus(agentId, 'thinking');
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
        const status = this.agentStatus.get(agentId) || 'active';

        return {
            agentId,
            lastActivity,
            status,
            inactiveSeconds
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

        // Remove all listeners
        this.removeAllListeners();
    }
}