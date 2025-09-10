/**
 * Simple Monitoring Service
 * Lightweight performance and health monitoring
 */

import * as vscode from 'vscode';

export class MonitoringService {
    private static instance: MonitoringService;
    private metrics = new Map<string, number>();
    private startTimes = new Map<string, number>();

    static getInstance(): MonitoringService {
        if (!this.instance) {
            this.instance = new MonitoringService();
        }
        return this.instance;
    }

    startTimer(name: string): void {
        this.startTimes.set(name, Date.now());
    }

    endTimer(name: string): number {
        const start = this.startTimes.get(name);
        if (!start) return 0;

        const duration = Date.now() - start;
        this.metrics.set(name, duration);
        this.startTimes.delete(name);
        return duration;
    }

    recordMetric(name: string, value: number): void {
        this.metrics.set(name, value);
    }

    getMetric(name: string): number | undefined {
        return this.metrics.get(name);
    }

    getAllMetrics(): Map<string, number> {
        return new Map(this.metrics);
    }

    reset(): void {
        this.metrics.clear();
        this.startTimes.clear();
    }

    // Adapter methods for agent monitoring (backward compatibility)
    startMonitoring(agentId: string): void {
        this.startTimer(`agent_${agentId}`);
        this.recordMetric(`agent_${agentId}_started`, Date.now());
    }

    stopMonitoring(agentId: string): void {
        const duration = this.endTimer(`agent_${agentId}`);
        this.recordMetric(`agent_${agentId}_duration`, duration);
    }

    getAgentStatus(agentId: string): any {
        return {
            started: this.getMetric(`agent_${agentId}_started`),
            duration: this.getMetric(`agent_${agentId}_duration`),
            isActive: this.startTimes.has(`agent_${agentId}`)
        };
    }
}

// Export singleton instance for backward compatibility
export const monitoringService = MonitoringService.getInstance();
