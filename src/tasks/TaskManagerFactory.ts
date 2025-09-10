import { AgentManager } from '../agents/AgentManager';
import {
    ILogger,
    IEventEmitter,
    IEventSubscriber,
    INotificationService,
    IConfiguration,
    ITaskReader
} from '../services/interfaces';
import { TaskQueue } from './TaskQueue';
import { SimpleTaskManager } from './SimpleTaskManager';
import { getAppStateStore } from '../state/AppStateStore';
import * as selectors from '../state/selectors';
import * as actions from '../state/actions';
/**
 * Factory for creating task managers with feature flag support
 * Enables gradual migration from complex to simple system
 */
export class TaskManagerFactory {
    /**
     * Create a task manager based on configuration
     */
    static create(
        agentManager: AgentManager,
        loggingService?: ILogger,
        eventBus?: IEventEmitter & IEventSubscriber,
        notificationService?: INotificationService,
        configService?: IConfiguration,
        // Legacy dependencies for complex system
        taskStateMachine?: any,
        priorityQueue?: any,
        capabilityMatcher?: any,
        dependencyManager?: any,
        metricsService?: any
    ): ITaskReader {
        const useSimpleTaskManager = configService?.get('nofx.tasks.useSimpleSystem', false);

        if (useSimpleTaskManager) {
            loggingService?.info('🚀 Using SimpleTaskManager (new system)');
            return new SimpleTaskManager(agentManager, loggingService, eventBus, notificationService, configService);
        } else {
            loggingService?.info('📚 Using TaskQueue (legacy system)');
            return new TaskQueue(
                agentManager,
                loggingService,
                eventBus,
                undefined, // errorHandler
                notificationService,
                configService,
                taskStateMachine,
                priorityQueue,
                capabilityMatcher,
                dependencyManager
            );
        }
    }

    /**
     * Get the recommended configuration for the simple system
     */
    static getRecommendedConfig(): Record<string, any> {
        return {
            'nofx.tasks.useSimpleSystem': true,
            'nofx.tasks.enablePriority': true,
            'nofx.tasks.maxConcurrent': 10,
            'nofx.tasks.retryFailed': false,
            'nofx.autoAssignTasks': true
        };
    }

    /**
     * Migrate from complex to simple system
     * This will be called during the migration process
     */
    static async migrateToSimpleSystem(configService: IConfiguration, loggingService?: ILogger): Promise<void> {
        try {
            loggingService?.info('🔄 Migrating to SimpleTaskManager...');

            // Update configuration to use simple system
            await configService.update('nofx.tasks.useSimpleSystem', true);

            // Apply recommended settings
            const recommendedConfig = this.getRecommendedConfig();
            for (const [key, value] of Object.entries(recommendedConfig)) {
                if (key !== 'nofx.tasks.useSimpleSystem') {
                    // Already set
                    await configService.update(key, value);
                }
            }

            loggingService?.info('✅ Migration to SimpleTaskManager completed');
        } catch (error) {
            loggingService?.error('❌ Migration failed', error);
            throw error;
        }
    }

    /**
     * Rollback to complex system
     */
    static async rollbackToComplexSystem(configService: IConfiguration, loggingService?: ILogger): Promise<void> {
        try {
            loggingService?.info('🔙 Rolling back to TaskQueue...');

            await configService.update('nofx.tasks.useSimpleSystem', false);

            loggingService?.info('✅ Rollback to TaskQueue completed');
        } catch (error) {
            loggingService?.error('❌ Rollback failed', error);
            throw error;
        }
    }
}
