/**
 * Performance Testing Framework for NofX VS Code Extension
 *
 * Provides comprehensive performance testing capabilities including:
 * - Load testing with user simulation
 * - Response time and throughput measurement
 * - Stress testing and breaking point analysis
 * - Resource utilization monitoring
 * - Scalability testing scenarios
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export interface PerformanceTestConfig {
    id: string;
    name: string;
    description: string;
    scenario: TestScenario;
    duration: number; // milliseconds
    warmupTime?: number; // milliseconds
    cooldownTime?: number; // milliseconds
    targetMetrics: PerformanceTargets;
    environment?: string;
}

export interface TestScenario {
    type: ScenarioType;
    users: number;
    rampUpTime: number; // milliseconds
    sustainTime: number; // milliseconds
    rampDownTime?: number; // milliseconds
    operations: OperationConfig[];
}

export enum ScenarioType {
    BASELINE = 'baseline',
    LOAD = 'load',
    STRESS = 'stress',
    SPIKE = 'spike',
    ENDURANCE = 'endurance',
    VOLUME = 'volume'
}

export interface OperationConfig {
    name: string;
    type: OperationType;
    weight: number; // percentage of operations
    parameters: Record<string, any>;
    expectedResponseTime: number; // milliseconds
}

export enum OperationType {
    AGENT_SPAWN = 'agent_spawn',
    AGENT_TERMINATE = 'agent_terminate',
    MESSAGE_SEND = 'message_send',
    TASK_ASSIGN = 'task_assign',
    CONDUCTOR_COMMAND = 'conductor_command',
    FILE_OPERATION = 'file_operation',
    WEBSOCKET_CONNECTION = 'websocket_connection',
    CONFIGURATION_UPDATE = 'configuration_update',
    SESSION_MANAGEMENT = 'session_management',
    TEMPLATE_PROCESSING = 'template_processing'
}

export interface PerformanceTargets {
    maxResponseTime: number; // milliseconds
    avgResponseTime: number; // milliseconds
    p95ResponseTime: number; // milliseconds
    p99ResponseTime: number; // milliseconds
    minThroughput: number; // operations per second
    maxErrorRate: number; // percentage (0-1)
    maxCpuUsage: number; // percentage (0-1)
    maxMemoryUsage: number; // bytes
    maxMemoryGrowth: number; // bytes per minute
}

export interface PerformanceMetrics {
    testId: string;
    startTime: Date;
    endTime: Date;
    duration: number; // milliseconds
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    errorRate: number; // percentage (0-1)

    // Response Time Metrics
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p50ResponseTime: number;
    p75ResponseTime: number;
    p90ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;

    // Throughput Metrics
    operationsPerSecond: number;
    requestsPerSecond: number;
    messagesPerSecond: number;

    // Resource Utilization
    peakCpuUsage: number;
    avgCpuUsage: number;
    peakMemoryUsage: number;
    avgMemoryUsage: number;
    memoryGrowthRate: number; // bytes per minute

    // System Metrics
    activeConnections: number;
    peakConnections: number;
    gcCount: number;
    gcTotalTime: number;

    // Operation-specific metrics
    operationMetrics: Map<string, OperationMetrics>;

    // Target compliance
    targetsAchieved: boolean;
    targetViolations: string[];
}

export interface OperationMetrics {
    operationType: OperationType;
    totalCount: number;
    successCount: number;
    failureCount: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    throughput: number;
    errorDetails: ErrorSummary[];
}

export interface ErrorSummary {
    errorType: string;
    count: number;
    percentage: number;
    sampleMessage: string;
}

export interface ResourceSnapshot {
    timestamp: Date;
    cpuUsage: number;
    memoryUsage: number;
    memoryRss: number;
    memoryHeapUsed: number;
    memoryHeapTotal: number;
    activeHandles: number;
    activeRequests: number;
    uptime: number;
}

export class PerformanceTestFramework extends EventEmitter {
    private activeTests = new Map<string, PerformanceTestConfig>();
    private testResults = new Map<string, PerformanceMetrics>();
    private resourceMonitor: ResourceMonitor;
    private operationTimings = new Map<string, number[]>();
    private testStartTime: Date;
    private testEndTime: Date;

    constructor() {
        super();
        this.resourceMonitor = new ResourceMonitor();
    }

    async runPerformanceTest(config: PerformanceTestConfig): Promise<PerformanceMetrics> {
        console.log(`Starting performance test: ${config.name}`);

        this.emit('testStarted', config);
        this.activeTests.set(config.id, config);
        this.testStartTime = new Date();

        try {
            // Warmup phase
            if (config.warmupTime) {
                await this.warmupPhase(config);
            }

            // Start resource monitoring
            this.resourceMonitor.startMonitoring();

            // Execute test scenario
            const metrics = await this.executeScenario(config);

            // Stop resource monitoring
            const resourceMetrics = this.resourceMonitor.stopMonitoring();

            // Merge resource metrics
            this.mergeResourceMetrics(metrics, resourceMetrics);

            // Cooldown phase
            if (config.cooldownTime) {
                await this.cooldownPhase(config);
            }

            // Validate against targets
            this.validateTargets(metrics, config.targetMetrics);

            this.testEndTime = new Date();
            metrics.endTime = this.testEndTime;
            metrics.duration = this.testEndTime.getTime() - this.testStartTime.getTime();

            this.testResults.set(config.id, metrics);
            this.emit('testCompleted', metrics);

            return metrics;
        } catch (error) {
            this.emit('testFailed', { config, error });
            throw error;
        } finally {
            this.activeTests.delete(config.id);
            this.resourceMonitor.stopMonitoring();
        }
    }

    private async warmupPhase(config: PerformanceTestConfig): Promise<void> {
        console.log(`Warmup phase: ${config.warmupTime}ms`);

        // Execute light load to warm up the system
        const warmupConfig: PerformanceTestConfig = {
            ...config,
            id: `${config.id}-warmup`,
            scenario: {
                ...config.scenario,
                users: Math.max(1, Math.floor(config.scenario.users * 0.1)),
                rampUpTime: config.warmupTime! * 0.3,
                sustainTime: config.warmupTime! * 0.4,
                rampDownTime: config.warmupTime! * 0.3
            }
        };

        await this.executeScenario(warmupConfig);

        // Allow system to stabilize
        await this.sleep(2000);
    }

    private async cooldownPhase(config: PerformanceTestConfig): Promise<void> {
        console.log(`Cooldown phase: ${config.cooldownTime}ms`);
        await this.sleep(config.cooldownTime!);
    }

    private async executeScenario(config: PerformanceTestConfig): Promise<PerformanceMetrics> {
        const scenario = config.scenario;
        const metrics: PerformanceMetrics = this.initializeMetrics(config.id);

        console.log(`Executing ${scenario.type} scenario with ${scenario.users} users`);

        // Create user simulation workers
        const workers: UserSimulator[] = [];
        const operationsPerUser = this.calculateOperationsPerUser(scenario);

        // Ramp-up phase
        const rampUpInterval = scenario.rampUpTime / scenario.users;

        for (let i = 0; i < scenario.users; i++) {
            const worker = new UserSimulator(`user-${i}`, scenario.operations, operationsPerUser, this);
            workers.push(worker);

            // Start worker with delay for ramp-up
            setTimeout(() => {
                worker.start();
            }, i * rampUpInterval);
        }

        // Sustain phase
        await this.sleep(scenario.sustainTime);

        // Ramp-down phase (gradual termination)
        if (scenario.rampDownTime) {
            const rampDownInterval = scenario.rampDownTime / scenario.users;
            for (let i = 0; i < workers.length; i++) {
                setTimeout(() => {
                    workers[i].stop();
                }, i * rampDownInterval);
            }
            await this.sleep(scenario.rampDownTime);
        } else {
            // Stop all workers immediately
            workers.forEach(worker => worker.stop());
        }

        // Wait for all workers to complete
        await Promise.all(workers.map(worker => worker.waitForCompletion()));

        // Calculate final metrics
        this.calculateFinalMetrics(metrics, workers);

        return metrics;
    }

    private calculateOperationsPerUser(scenario: TestScenario): number {
        const totalDuration = scenario.rampUpTime + scenario.sustainTime + (scenario.rampDownTime || 0);
        const operationsPerSecond = scenario.operations.reduce((sum, op) => sum + op.weight / 100, 0);
        return Math.floor((totalDuration / 1000) * operationsPerSecond);
    }

    private initializeMetrics(testId: string): PerformanceMetrics {
        return {
            testId,
            startTime: new Date(),
            endTime: new Date(),
            duration: 0,
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            errorRate: 0,
            avgResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            p50ResponseTime: 0,
            p75ResponseTime: 0,
            p90ResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            operationsPerSecond: 0,
            requestsPerSecond: 0,
            messagesPerSecond: 0,
            peakCpuUsage: 0,
            avgCpuUsage: 0,
            peakMemoryUsage: 0,
            avgMemoryUsage: 0,
            memoryGrowthRate: 0,
            activeConnections: 0,
            peakConnections: 0,
            gcCount: 0,
            gcTotalTime: 0,
            operationMetrics: new Map(),
            targetsAchieved: false,
            targetViolations: []
        };
    }

    private calculateFinalMetrics(metrics: PerformanceMetrics, workers: UserSimulator[]): void {
        const allTimings: number[] = [];
        const operationStats = new Map<OperationType, OperationMetrics>();

        workers.forEach(worker => {
            const workerMetrics = worker.getMetrics();
            metrics.totalOperations += workerMetrics.totalOperations;
            metrics.successfulOperations += workerMetrics.successfulOperations;
            metrics.failedOperations += workerMetrics.failedOperations;

            allTimings.push(...workerMetrics.responseTimes);

            // Aggregate operation-specific metrics
            workerMetrics.operationMetrics.forEach((opMetrics, opType) => {
                if (!operationStats.has(opType)) {
                    operationStats.set(opType, {
                        operationType: opType,
                        totalCount: 0,
                        successCount: 0,
                        failureCount: 0,
                        avgResponseTime: 0,
                        p95ResponseTime: 0,
                        throughput: 0,
                        errorDetails: []
                    });
                }

                const existing = operationStats.get(opType)!;
                existing.totalCount += opMetrics.totalCount;
                existing.successCount += opMetrics.successCount;
                existing.failureCount += opMetrics.failureCount;
            });
        });

        // Calculate response time percentiles
        if (allTimings.length > 0) {
            allTimings.sort((a, b) => a - b);
            metrics.minResponseTime = allTimings[0];
            metrics.maxResponseTime = allTimings[allTimings.length - 1];
            metrics.avgResponseTime = allTimings.reduce((sum, time) => sum + time, 0) / allTimings.length;

            metrics.p50ResponseTime = this.calculatePercentile(allTimings, 0.5);
            metrics.p75ResponseTime = this.calculatePercentile(allTimings, 0.75);
            metrics.p90ResponseTime = this.calculatePercentile(allTimings, 0.9);
            metrics.p95ResponseTime = this.calculatePercentile(allTimings, 0.95);
            metrics.p99ResponseTime = this.calculatePercentile(allTimings, 0.99);
        }

        // Calculate error rate
        metrics.errorRate = metrics.totalOperations > 0 ? metrics.failedOperations / metrics.totalOperations : 0;

        // Calculate throughput
        const durationSeconds = metrics.duration / 1000;
        metrics.operationsPerSecond = metrics.totalOperations / durationSeconds;
        metrics.requestsPerSecond = metrics.operationsPerSecond;

        metrics.operationMetrics = operationStats;
    }

    private calculatePercentile(sortedArray: number[], percentile: number): number {
        const index = Math.ceil(sortedArray.length * percentile) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }

    private mergeResourceMetrics(metrics: PerformanceMetrics, resourceMetrics: ResourceSnapshot[]): void {
        if (resourceMetrics.length === 0) return;

        const cpuValues = resourceMetrics.map(r => r.cpuUsage);
        const memoryValues = resourceMetrics.map(r => r.memoryUsage);

        metrics.peakCpuUsage = Math.max(...cpuValues);
        metrics.avgCpuUsage = cpuValues.reduce((sum, val) => sum + val, 0) / cpuValues.length;

        metrics.peakMemoryUsage = Math.max(...memoryValues);
        metrics.avgMemoryUsage = memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length;

        // Calculate memory growth rate
        if (resourceMetrics.length > 1) {
            const firstMemory = resourceMetrics[0].memoryUsage;
            const lastMemory = resourceMetrics[resourceMetrics.length - 1].memoryUsage;
            const timeSpan =
                resourceMetrics[resourceMetrics.length - 1].timestamp.getTime() -
                resourceMetrics[0].timestamp.getTime();

            metrics.memoryGrowthRate = ((lastMemory - firstMemory) / timeSpan) * 60000; // bytes per minute
        }
    }

    private validateTargets(metrics: PerformanceMetrics, targets: PerformanceTargets): void {
        const violations: string[] = [];

        if (metrics.avgResponseTime > targets.avgResponseTime) {
            violations.push(
                `Average response time ${metrics.avgResponseTime}ms exceeds target ${targets.avgResponseTime}ms`
            );
        }

        if (metrics.maxResponseTime > targets.maxResponseTime) {
            violations.push(
                `Max response time ${metrics.maxResponseTime}ms exceeds target ${targets.maxResponseTime}ms`
            );
        }

        if (metrics.p95ResponseTime > targets.p95ResponseTime) {
            violations.push(
                `P95 response time ${metrics.p95ResponseTime}ms exceeds target ${targets.p95ResponseTime}ms`
            );
        }

        if (metrics.p99ResponseTime > targets.p99ResponseTime) {
            violations.push(
                `P99 response time ${metrics.p99ResponseTime}ms exceeds target ${targets.p99ResponseTime}ms`
            );
        }

        if (metrics.operationsPerSecond < targets.minThroughput) {
            violations.push(
                `Throughput ${metrics.operationsPerSecond} ops/s below target ${targets.minThroughput} ops/s`
            );
        }

        if (metrics.errorRate > targets.maxErrorRate) {
            violations.push(
                `Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds target ${(targets.maxErrorRate * 100).toFixed(2)}%`
            );
        }

        if (metrics.peakCpuUsage > targets.maxCpuUsage) {
            violations.push(
                `Peak CPU usage ${(metrics.peakCpuUsage * 100).toFixed(2)}% exceeds target ${(targets.maxCpuUsage * 100).toFixed(2)}%`
            );
        }

        if (metrics.peakMemoryUsage > targets.maxMemoryUsage) {
            violations.push(
                `Peak memory usage ${metrics.peakMemoryUsage} bytes exceeds target ${targets.maxMemoryUsage} bytes`
            );
        }

        if (metrics.memoryGrowthRate > targets.maxMemoryGrowth) {
            violations.push(
                `Memory growth rate ${metrics.memoryGrowthRate} bytes/min exceeds target ${targets.maxMemoryGrowth} bytes/min`
            );
        }

        metrics.targetsAchieved = violations.length === 0;
        metrics.targetViolations = violations;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getTestResults(): Map<string, PerformanceMetrics> {
        return new Map(this.testResults);
    }

    exportResults(format: 'json' | 'csv' | 'html' = 'json'): string {
        const results = Array.from(this.testResults.values());

        switch (format) {
            case 'json':
                return JSON.stringify(results, null, 2);
            case 'csv':
                return this.exportToCsv(results);
            case 'html':
                return this.exportToHtml(results);
            default:
                return JSON.stringify(results, null, 2);
        }
    }

    private exportToCsv(results: PerformanceMetrics[]): string {
        const headers = [
            'testId',
            'duration',
            'totalOperations',
            'successfulOperations',
            'failedOperations',
            'errorRate',
            'avgResponseTime',
            'p95ResponseTime',
            'p99ResponseTime',
            'operationsPerSecond',
            'peakCpuUsage',
            'avgCpuUsage',
            'peakMemoryUsage',
            'avgMemoryUsage',
            'targetsAchieved'
        ];

        const csvRows = [headers.join(',')];

        results.forEach(result => {
            const row = [
                result.testId,
                result.duration,
                result.totalOperations,
                result.successfulOperations,
                result.failedOperations,
                (result.errorRate * 100).toFixed(2),
                result.avgResponseTime.toFixed(2),
                result.p95ResponseTime.toFixed(2),
                result.p99ResponseTime.toFixed(2),
                result.operationsPerSecond.toFixed(2),
                (result.peakCpuUsage * 100).toFixed(2),
                (result.avgCpuUsage * 100).toFixed(2),
                result.peakMemoryUsage,
                result.avgMemoryUsage,
                result.targetsAchieved
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    private exportToHtml(results: PerformanceMetrics[]): string {
        // Implementation for HTML export would go here
        return `<html><body><h1>Performance Test Results</h1><pre>${JSON.stringify(results, null, 2)}</pre></body></html>`;
    }
}

class ResourceMonitor {
    private monitoring = false;
    private snapshots: ResourceSnapshot[] = [];
    private intervalId: NodeJS.Timeout | null = null;
    private readonly sampleInterval = 1000; // 1 second

    startMonitoring(): void {
        if (this.monitoring) return;

        this.monitoring = true;
        this.snapshots = [];

        this.intervalId = setInterval(() => {
            this.takeSnapshot();
        }, this.sampleInterval);
    }

    stopMonitoring(): ResourceSnapshot[] {
        if (!this.monitoring) return [];

        this.monitoring = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        return [...this.snapshots];
    }

    private takeSnapshot(): void {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        const snapshot: ResourceSnapshot = {
            timestamp: new Date(),
            cpuUsage: this.calculateCpuPercentage(cpuUsage),
            memoryUsage: memUsage.rss,
            memoryRss: memUsage.rss,
            memoryHeapUsed: memUsage.heapUsed,
            memoryHeapTotal: memUsage.heapTotal,
            activeHandles: (process as any)._getActiveHandles().length,
            activeRequests: (process as any)._getActiveRequests().length,
            uptime: process.uptime()
        };

        this.snapshots.push(snapshot);
    }

    private calculateCpuPercentage(cpuUsage: NodeJS.CpuUsage): number {
        // This is a simplified CPU calculation
        // In a real implementation, you'd want to calculate the percentage
        // based on time intervals and system CPU count
        const total = cpuUsage.user + cpuUsage.system;
        return Math.min(total / 1000000 / os.cpus().length, 1.0); // Convert to percentage
    }
}

class UserSimulator {
    private readonly userId: string;
    private readonly operations: OperationConfig[];
    private readonly totalOperations: number;
    private readonly framework: PerformanceTestFramework;

    private running = false;
    private completed = false;
    private completionPromise: Promise<void>;
    private completionResolve: (() => void) | null = null;

    private metrics = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        responseTimes: [] as number[],
        operationMetrics: new Map<OperationType, OperationMetrics>()
    };

    constructor(
        userId: string,
        operations: OperationConfig[],
        totalOperations: number,
        framework: PerformanceTestFramework
    ) {
        this.userId = userId;
        this.operations = operations;
        this.totalOperations = totalOperations;
        this.framework = framework;

        this.completionPromise = new Promise(resolve => {
            this.completionResolve = resolve;
        });
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.executeOperations();
    }

    stop(): void {
        this.running = false;
    }

    async waitForCompletion(): Promise<void> {
        return this.completionPromise;
    }

    private async executeOperations(): Promise<void> {
        let operationsExecuted = 0;

        while (this.running && operationsExecuted < this.totalOperations) {
            const operation = this.selectOperation();
            await this.executeOperation(operation);
            operationsExecuted++;

            // Small delay between operations to simulate realistic user behavior
            await this.sleep(Math.random() * 100 + 50);
        }

        this.completed = true;
        if (this.completionResolve) {
            this.completionResolve();
        }
    }

    private selectOperation(): OperationConfig {
        const rand = Math.random() * 100;
        let cumulative = 0;

        for (const operation of this.operations) {
            cumulative += operation.weight;
            if (rand <= cumulative) {
                return operation;
            }
        }

        return this.operations[0]; // Fallback
    }

    private async executeOperation(operation: OperationConfig): Promise<void> {
        const startTime = Date.now();
        let success = false;

        try {
            await this.performOperation(operation);
            success = true;
        } catch (error) {
            console.error(`Operation ${operation.name} failed for user ${this.userId}:`, error);
        }

        const responseTime = Date.now() - startTime;

        this.metrics.totalOperations++;
        this.metrics.responseTimes.push(responseTime);

        if (success) {
            this.metrics.successfulOperations++;
        } else {
            this.metrics.failedOperations++;
        }

        this.updateOperationMetrics(operation.type, responseTime, success);
    }

    private async performOperation(operation: OperationConfig): Promise<void> {
        // Simulate the operation based on type
        switch (operation.type) {
            case OperationType.AGENT_SPAWN:
                await this.simulateAgentSpawn(operation.parameters);
                break;
            case OperationType.MESSAGE_SEND:
                await this.simulateMessageSend(operation.parameters);
                break;
            case OperationType.CONDUCTOR_COMMAND:
                await this.simulateConductorCommand(operation.parameters);
                break;
            case OperationType.WEBSOCKET_CONNECTION:
                await this.simulateWebSocketConnection(operation.parameters);
                break;
            default:
                await this.simulateGenericOperation(operation);
        }
    }

    private async simulateAgentSpawn(params: any): Promise<void> {
        // Simulate agent spawning - typically takes 1-3 seconds
        const delay = Math.random() * 2000 + 1000;
        await this.sleep(delay);

        // Simulate potential failure (5% chance)
        if (Math.random() < 0.05) {
            throw new Error('Agent spawn failed');
        }
    }

    private async simulateMessageSend(params: any): Promise<void> {
        // Simulate message sending - typically takes 50-200ms
        const delay = Math.random() * 150 + 50;
        await this.sleep(delay);

        // Simulate potential failure (1% chance)
        if (Math.random() < 0.01) {
            throw new Error('Message send failed');
        }
    }

    private async simulateConductorCommand(params: any): Promise<void> {
        // Simulate conductor command - typically takes 100-500ms
        const delay = Math.random() * 400 + 100;
        await this.sleep(delay);

        // Simulate potential failure (2% chance)
        if (Math.random() < 0.02) {
            throw new Error('Conductor command failed');
        }
    }

    private async simulateWebSocketConnection(params: any): Promise<void> {
        // Simulate WebSocket connection - typically takes 200-800ms
        const delay = Math.random() * 600 + 200;
        await this.sleep(delay);

        // Simulate potential failure (3% chance)
        if (Math.random() < 0.03) {
            throw new Error('WebSocket connection failed');
        }
    }

    private async simulateGenericOperation(operation: OperationConfig): Promise<void> {
        // Generic operation simulation
        const baseDelay = operation.expectedResponseTime || 200;
        const delay = baseDelay + Math.random() * baseDelay * 0.5; // ±25% variance
        await this.sleep(delay);

        // Simulate potential failure (1% chance)
        if (Math.random() < 0.01) {
            throw new Error(`${operation.name} failed`);
        }
    }

    private updateOperationMetrics(opType: OperationType, responseTime: number, success: boolean): void {
        if (!this.metrics.operationMetrics.has(opType)) {
            this.metrics.operationMetrics.set(opType, {
                operationType: opType,
                totalCount: 0,
                successCount: 0,
                failureCount: 0,
                avgResponseTime: 0,
                p95ResponseTime: 0,
                throughput: 0,
                errorDetails: []
            });
        }

        const opMetrics = this.metrics.operationMetrics.get(opType)!;
        opMetrics.totalCount++;

        if (success) {
            opMetrics.successCount++;
        } else {
            opMetrics.failureCount++;
        }

        // Update average response time
        opMetrics.avgResponseTime =
            (opMetrics.avgResponseTime * (opMetrics.totalCount - 1) + responseTime) / opMetrics.totalCount;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getMetrics(): any {
        return this.metrics;
    }
}
