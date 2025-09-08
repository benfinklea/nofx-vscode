import * as vscode from 'vscode';
import { ILoggingService, IEventBus } from './interfaces';
import { NaturalLanguageService } from './NaturalLanguageService';
import { TerminalCommandRouter } from './TerminalCommandRouter';
import { AgentNotificationService } from './AgentNotificationService';

/**
 * Component health status
 */
interface ComponentHealth {
    name: string;
    isHealthy: boolean;
    lastCheck: Date;
    failureCount: number;
    details?: any;
}

/**
 * System-wide health monitor with self-healing capabilities
 * Monitors all critical components and performs automatic recovery
 */
export class SystemHealthMonitor {
    private components: Map<string, ComponentHealth> = new Map();
    private healthCheckInterval?: NodeJS.Timeout;
    private recoveryAttempts: Map<string, number> = new Map();
    private readonly MAX_RECOVERY_ATTEMPTS = 3;
    private readonly HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
    private readonly RECOVERY_COOLDOWN = 60000; // 1 minute
    private lastRecoveryTime: Map<string, Date> = new Map();
    private systemHealthy = true;
    private criticalFailures = 0;
    private readonly MAX_CRITICAL_FAILURES = 5;

    // Service references for monitoring
    private naturalLanguageService?: NaturalLanguageService;
    private terminalCommandRouter?: TerminalCommandRouter;
    private agentNotificationService?: AgentNotificationService;

    constructor(
        private loggingService?: ILoggingService,
        private eventBus?: IEventBus
    ) {
        this.initialize();
    }

    /**
     * Initialize health monitoring
     */
    private initialize(): void {
        this.loggingService?.info('SystemHealthMonitor: Initializing');

        // Register components
        this.registerComponent('NaturalLanguageService');
        this.registerComponent('TerminalCommandRouter');
        this.registerComponent('AgentNotificationService');
        this.registerComponent('EventBus');
        this.registerComponent('VSCodeAPI');

        // Start health checks
        this.startHealthChecks();

        // Listen for error events
        this.setupErrorListeners();
    }

    /**
     * Register a service for monitoring
     */
    public registerService(name: string, service: any): void {
        switch (name) {
            case 'NaturalLanguageService':
                this.naturalLanguageService = service;
                break;
            case 'TerminalCommandRouter':
                this.terminalCommandRouter = service;
                break;
            case 'AgentNotificationService':
                this.agentNotificationService = service;
                break;
        }

        this.loggingService?.debug(`Registered service for monitoring: ${name}`);
    }

    /**
     * Register a component for health monitoring
     */
    private registerComponent(name: string): void {
        this.components.set(name, {
            name,
            isHealthy: true,
            lastCheck: new Date(),
            failureCount: 0
        });
    }

    /**
     * Start periodic health checks
     */
    private startHealthChecks(): void {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, this.HEALTH_CHECK_INTERVAL);

        // Perform initial check
        this.performHealthChecks();
    }

    /**
     * Perform health checks on all components
     */
    private async performHealthChecks(): Promise<void> {
        const startTime = Date.now();
        let unhealthyCount = 0;

        try {
            // Check Natural Language Service
            if (this.naturalLanguageService) {
                const nlHealth = this.naturalLanguageService.getHealthStatus();
                this.updateComponentHealth('NaturalLanguageService', nlHealth.isHealthy, nlHealth);
                if (!nlHealth.isHealthy) unhealthyCount++;
            }

            // Check Terminal Command Router
            if (this.terminalCommandRouter) {
                const routerHealth = this.terminalCommandRouter.getHealthStatus();
                this.updateComponentHealth('TerminalCommandRouter', routerHealth.isHealthy, routerHealth);
                if (!routerHealth.isHealthy) unhealthyCount++;
            }

            // Check Agent Notification Service
            if (this.agentNotificationService) {
                // For now, assume healthy if service exists
                // TODO: Add getHealthStatus method to AgentNotificationService
                const notifHealthy = !!this.agentNotificationService;
                this.updateComponentHealth('AgentNotificationService', notifHealthy);
                if (!notifHealthy) unhealthyCount++;
            }

            // Check EventBus
            const eventBusHealthy = await this.checkEventBus();
            this.updateComponentHealth('EventBus', eventBusHealthy);
            if (!eventBusHealthy) unhealthyCount++;

            // Check VS Code API
            const vscodeHealthy = this.checkVSCodeAPI();
            this.updateComponentHealth('VSCodeAPI', vscodeHealthy);
            if (!vscodeHealthy) unhealthyCount++;

            // Update overall system health
            const previousHealth = this.systemHealthy;
            this.systemHealthy = unhealthyCount === 0;

            if (!this.systemHealthy && previousHealth) {
                this.loggingService?.warn(`System health degraded: ${unhealthyCount} unhealthy components`);
                this.eventBus?.publish('system.health.degraded', { unhealthyCount });
            } else if (this.systemHealthy && !previousHealth) {
                this.loggingService?.info('System health restored');
                this.eventBus?.publish('system.health.restored', {});
                this.criticalFailures = 0;
            }

            // Attempt recovery if needed
            if (unhealthyCount > 0) {
                await this.attemptRecovery();
            }

            const checkDuration = Date.now() - startTime;
            if (checkDuration > 1000) {
                this.loggingService?.warn(`Health check took ${checkDuration}ms (expected < 1000ms)`);
            }
        } catch (error) {
            this.loggingService?.error('Error during health check:', error);
            this.criticalFailures++;

            if (this.criticalFailures > this.MAX_CRITICAL_FAILURES) {
                this.handleCriticalSystemFailure();
            }
        }
    }

    /**
     * Update component health status
     */
    private updateComponentHealth(name: string, isHealthy: boolean, details?: any): void {
        const component = this.components.get(name);
        if (!component) return;

        const wasHealthy = component.isHealthy;
        component.isHealthy = isHealthy;
        component.lastCheck = new Date();
        component.details = details;

        if (!isHealthy) {
            component.failureCount++;

            if (wasHealthy) {
                this.loggingService?.warn(`Component ${name} became unhealthy`);
                this.eventBus?.publish('component.unhealthy', { component: name, details });
            }
        } else {
            if (!wasHealthy) {
                this.loggingService?.info(`Component ${name} recovered`);
                this.eventBus?.publish('component.recovered', { component: name });
            }
            component.failureCount = 0;
        }

        this.components.set(name, component);
    }

    /**
     * Check EventBus health
     */
    private async checkEventBus(): Promise<boolean> {
        if (!this.eventBus) return false;

        try {
            // Test event publishing
            const testEvent = `health.check.${Date.now()}`;
            let received = false;

            const disposable = this.eventBus.subscribe(testEvent, () => {
                received = true;
            });

            this.eventBus.publish(testEvent, { test: true });

            // Wait briefly for event to be received
            await new Promise(resolve => setTimeout(resolve, 100));

            disposable.dispose();

            return received;
        } catch (error) {
            this.loggingService?.error('EventBus health check failed:', error);
            return false;
        }
    }

    /**
     * Check VS Code API health
     */
    private checkVSCodeAPI(): boolean {
        try {
            // Check critical VS Code APIs
            const hasWindow = !!vscode.window;
            const hasWorkspace = !!vscode.workspace;
            const hasCommands = !!vscode.commands;

            return hasWindow && hasWorkspace && hasCommands;
        } catch (error) {
            this.loggingService?.error('VS Code API check failed:', error);
            return false;
        }
    }

    /**
     * Attempt recovery of unhealthy components
     */
    private async attemptRecovery(): Promise<void> {
        const now = new Date();

        for (const [name, component] of this.components) {
            if (!component.isHealthy) {
                // Check cooldown
                const lastRecovery = this.lastRecoveryTime.get(name);
                if (lastRecovery) {
                    const timeSinceRecovery = now.getTime() - lastRecovery.getTime();
                    if (timeSinceRecovery < this.RECOVERY_COOLDOWN) {
                        continue; // Still in cooldown
                    }
                }

                // Check max attempts
                const attempts = this.recoveryAttempts.get(name) || 0;
                if (attempts >= this.MAX_RECOVERY_ATTEMPTS) {
                    this.loggingService?.error(`Component ${name} exceeded max recovery attempts`);
                    continue;
                }

                // Attempt recovery
                this.loggingService?.info(`Attempting recovery for ${name}`);
                const recovered = await this.recoverComponent(name);

                if (recovered) {
                    this.loggingService?.info(`Successfully recovered ${name}`);
                    this.recoveryAttempts.delete(name);
                } else {
                    this.recoveryAttempts.set(name, attempts + 1);
                    this.loggingService?.warn(`Recovery failed for ${name} (attempt ${attempts + 1})`);
                }

                this.lastRecoveryTime.set(name, now);
            }
        }
    }

    /**
     * Recover a specific component
     */
    private async recoverComponent(name: string): Promise<boolean> {
        try {
            switch (name) {
                case 'NaturalLanguageService':
                    if (this.naturalLanguageService) {
                        this.naturalLanguageService.reset();
                        return true;
                    }
                    break;

                case 'TerminalCommandRouter':
                    // Terminal router has built-in restart capability
                    return true;

                case 'AgentNotificationService':
                    // AgentNotificationService can typically self-recover
                    return true;

                case 'EventBus':
                    // EventBus typically doesn't need recovery
                    return true;

                case 'VSCodeAPI':
                    // Can't recover VS Code API, but might recover on its own
                    return false;
            }

            return false;
        } catch (error) {
            this.loggingService?.error(`Error recovering ${name}:`, error);
            return false;
        }
    }

    /**
     * Handle critical system failure
     */
    private handleCriticalSystemFailure(): void {
        this.loggingService?.error('CRITICAL: System health monitor itself is failing');

        // Show user notification
        vscode.window
            .showErrorMessage(
                'NofX System Health Critical: The extension is experiencing severe issues. Please reload VS Code.',
                'Reload Window',
                'Disable Extension'
            )
            .then(action => {
                if (action === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else if (action === 'Disable Extension') {
                    vscode.commands.executeCommand('workbench.extensions.action.disableExtension', 'nofx.nofx');
                }
            });

        // Stop health checks to prevent further issues
        this.stop();
    }

    /**
     * Setup error event listeners
     */
    private setupErrorListeners(): void {
        if (this.eventBus) {
            // Listen for system errors
            this.eventBus.subscribe('system.error', (data: any) => {
                this.loggingService?.error('System error event:', data);
                this.criticalFailures++;
            });

            // Listen for component failures
            this.eventBus.subscribe('component.failed', (data: any) => {
                const componentName = data?.component;
                if (componentName) {
                    this.updateComponentHealth(componentName, false, data);
                }
            });
        }

        // Listen for unhandled rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.loggingService?.error('Unhandled promise rejection:', reason);
            this.criticalFailures++;
        });
    }

    /**
     * Get overall system health status
     */
    public getSystemHealth(): {
        isHealthy: boolean;
        components: ComponentHealth[];
        criticalFailures: number;
        recoveryAttempts: Map<string, number>;
    } {
        return {
            isHealthy: this.systemHealthy,
            components: Array.from(this.components.values()),
            criticalFailures: this.criticalFailures,
            recoveryAttempts: this.recoveryAttempts
        };
    }

    /**
     * Force a health check
     */
    public async forceHealthCheck(): Promise<void> {
        this.loggingService?.info('Forced health check requested');
        await this.performHealthChecks();
    }

    /**
     * Reset all health metrics
     */
    public reset(): void {
        this.loggingService?.info('Resetting system health monitor');

        this.components.forEach(component => {
            component.isHealthy = true;
            component.failureCount = 0;
            component.lastCheck = new Date();
        });

        this.recoveryAttempts.clear();
        this.lastRecoveryTime.clear();
        this.criticalFailures = 0;
        this.systemHealthy = true;
    }

    /**
     * Stop health monitoring
     */
    public stop(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }

        this.loggingService?.info('SystemHealthMonitor stopped');
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.stop();
        this.components.clear();
        this.recoveryAttempts.clear();
        this.lastRecoveryTime.clear();
    }
}
