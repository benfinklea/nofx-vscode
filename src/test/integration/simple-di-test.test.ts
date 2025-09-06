import { createIntegrationContainer } from '../utils/TestHelpers';
import { SERVICE_TOKENS } from '../../services/interfaces';

describe('Simple DI Container Test', () => {
    it('should create container and resolve services', () => {
        const container = createIntegrationContainer();

        // Test resolving EventBus
        const eventBus = container.resolve(SERVICE_TOKENS.EventBus) as any;
        expect(eventBus).toBeDefined();
        expect(typeof eventBus.publish).toBe('function');
        expect(typeof eventBus.subscribe).toBe('function');

        // Test resolving TaskQueue
        const taskQueue = container.resolve(SERVICE_TOKENS.TaskQueue) as any;
        expect(taskQueue).toBeDefined();
        expect(typeof taskQueue.addTask).toBe('function');
        expect(typeof taskQueue.clearAllTasks).toBe('function');

        // Test resolving other services
        const loggingService = container.resolve(SERVICE_TOKENS.LoggingService);
        expect(loggingService).toBeDefined();

        const dependencyManager = container.resolve(SERVICE_TOKENS.TaskDependencyManager);
        expect(dependencyManager).toBeDefined();

        const priorityQueue = container.resolve(SERVICE_TOKENS.PriorityTaskQueue);
        expect(priorityQueue).toBeDefined();

        // Cleanup
        container.dispose();
    });
});
