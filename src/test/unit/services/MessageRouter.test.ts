import { MessageRouter } from '../../../services/MessageRouter';
import { MessageValidator } from '../../../services/MessageValidator';
import { ConnectionPoolService } from '../../../services/ConnectionPoolService';
import { MessagePersistenceService } from '../../../services/MessagePersistenceService';
import { AgentManager } from '../../../agents/AgentManager';
import { TaskQueue } from '../../../tasks/TaskQueue';
import { LoggingService } from '../../../services/LoggingService';
import { MetricsService } from '../../../services/MetricsService';
import { MessageType, Message, MessagePriority } from '../../../types/Message';
import { EventBus } from '../../../services/EventBus';
import {
import { getAppStateStore } from '../../../state/AppStateStore';
import * as selectors from '../../../state/selectors';
import * as actions from '../../../state/actions';    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../../helpers/mockFactories';

// Mock all dependencies
jest.mock('../../../services/MessageValidator');
jest.mock('../../../services/ConnectionPoolService');
jest.mock('../../../services/MessagePersistenceService');
jest.mock('../../../agents/AgentManager');
jest.mock('../../../tasks/TaskQueue');
jest.mock('../../../services/LoggingService');
jest.mock('../../../services/MetricsService');
jest.mock('../../../services/EventBus');

describe('MessageRouter', () => {
    let messageRouter: MessageRouter;
    let mockMessageValidator: jest.Mocked<MessageValidator>;
    let mockConnectionPool: jest.Mocked<ConnectionPoolService>;
    let mockPersistenceService: jest.Mocked<MessagePersistenceService>;
    let mockAgentManager: jest.Mocked<AgentManager>;
    let mockTaskQueue: jest.Mocked<TaskQueue>;
    let mockLoggingService: jest.Mocked<LoggingService>;
    let mockMetricsService: jest.Mocked<MetricsService>;
    let mockEventBus: jest.Mocked<EventBus>;

    const mockMessage: Message = {
        id: 'msg-123',
        type: MessageType.SPAWN_AGENT,
        source: 'conductor',
        destination: 'orchestrator',
        payload: { templateId: 'frontend-specialist', name: 'UI Agent' },
        timestamp: new Date(),
        priority: MessagePriority.HIGH,
        correlationId: 'corr-123'
    };

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockMessageValidator = new MessageValidator() as jest.Mocked<MessageValidator>;
        mockConnectionPool = new ConnectionPoolService({} as any) as jest.Mocked<ConnectionPoolService>;
        mockPersistenceService = new MessagePersistenceService({} as any) as jest.Mocked<MessagePersistenceService>;
        mockAgentManager = new AgentManager({} as any) as jest.Mocked<AgentManager>;
        mockTaskQueue = new TaskQueue({} as any) as jest.Mocked<TaskQueue>;
        mockLoggingService = new LoggingService() as jest.Mocked<LoggingService>;
        mockMetricsService = new MetricsService({} as any) as jest.Mocked<MetricsService>;
        mockEventBus = new EventBus() as jest.Mocked<EventBus>;

        messageRouter = new MessageRouter(
            mockMessageValidator,
            mockConnectionPool,
            mockPersistenceService,
            mockAgentManager,
            mockTaskQueue,
            mockLoggingService,
            mockMetricsService,
            mockEventBus
        );

        // Setup default mocks
        mockMessageValidator.validateMessage = jest.fn().mockReturnValue({ isValid: true, errors: [] });
        mockConnectionPool.getConnection = jest.fn().mockReturnValue({ id: 'conn-1', isAlive: true });
        mockPersistenceService.persistMessage = jest.fn().mockResolvedValue(true);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('message routing', () => {
        it('should route SPAWN_AGENT message to agent manager', async () => {
            const spawnMessage = { ...mockMessage, type: MessageType.SPAWN_AGENT };
            mockAgentManager.handleSpawnAgent = jest.fn().mockResolvedValue({ agentId: 'agent-1' });

            const result = await messageRouter.routeMessage(spawnMessage);

            expect(mockAgentManager.handleSpawnAgent).toHaveBeenCalledWith(spawnMessage.payload);
            expect(result.success).toBe(true);
            expect(result.response).toEqual({ agentId: 'agent-1' });
        });

        it('should route ASSIGN_TASK message to task queue', async () => {
            const taskMessage = {
                ...mockMessage,
                type: MessageType.ASSIGN_TASK,
                payload: { taskId: 'task-1', agentId: 'agent-1', description: 'Test task' }
            };
            mockTaskQueue.handleTaskAssignment = jest.fn().mockResolvedValue({ success: true });

            const result = await messageRouter.routeMessage(taskMessage);

            expect(mockTaskQueue.handleTaskAssignment).toHaveBeenCalledWith(taskMessage.payload);
            expect(result.success).toBe(true);
        });

        it('should route TASK_ACCEPTED message to appropriate handler', async () => {
            const acceptedMessage = {
                ...mockMessage,
                type: MessageType.TASK_ACCEPTED,
                payload: { taskId: 'task-1', agentId: 'agent-1', acceptedAt: new Date() }
            };

            const result = await messageRouter.routeMessage(acceptedMessage);

            expect(mockTaskQueue.updateTaskStatus).toHaveBeenCalledWith('task-1', 'ASSIGNED');
            expect(mockEventBus.publish).toHaveBeenCalledWith('task.accepted', acceptedMessage.payload);
        });

        it('should route AGENT_READY message to agent manager', async () => {
            const readyMessage = {
                ...mockMessage,
                type: MessageType.AGENT_READY,
                payload: { agentId: 'agent-1', capabilities: ['javascript', 'react'], status: 'ready' }
            };

            const result = await messageRouter.routeMessage(readyMessage);

            expect(mockAgentManager.updateAgentStatus).toHaveBeenCalledWith('agent-1', 'ready');
            expect(mockAgentManager.updateAgentCapabilities).toHaveBeenCalledWith('agent-1', ['javascript', 'react']);
        });

        it('should route SYSTEM_ERROR message to error handler', async () => {
            const errorMessage = {
                ...mockMessage,
                type: MessageType.SYSTEM_ERROR,
                payload: { error: 'Connection failed', source: 'agent-1', severity: 'high' }
            };

            const result = await messageRouter.routeMessage(errorMessage);

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'System error from agent-1: Connection failed',
                errorMessage.payload
            );
            expect(mockMetricsService.recordError).toHaveBeenCalledWith('system_error', errorMessage.payload);
        });

        it('should handle unknown message types gracefully', async () => {
            const unknownMessage = { ...mockMessage, type: 'UNKNOWN_TYPE' as MessageType };

            const result = await messageRouter.routeMessage(unknownMessage);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown message type');
        });
    });

    describe('message validation', () => {
        it('should validate message before routing', async () => {
            await messageRouter.routeMessage(mockMessage);

            expect(mockMessageValidator.validateMessage).toHaveBeenCalledWith(mockMessage);
        });

        it('should reject invalid messages', async () => {
            mockMessageValidator.validateMessage = jest.fn().mockReturnValue({
                isValid: false,
                errors: ['Missing required field: payload']
            });

            const result = await messageRouter.routeMessage(mockMessage);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid message: Missing required field: payload');
            expect(mockMetricsService.recordEvent).toHaveBeenCalledWith(
                'message_validation_failed',
                expect.any(Object)
            );
        });

        it('should validate message structure for each type', async () => {
            const taskMessage = {
                ...mockMessage,
                type: MessageType.ASSIGN_TASK,
                payload: {
                    /* missing required fields */
                }
            };

            mockMessageValidator.validateMessage = jest.fn().mockReturnValue({
                isValid: false,
                errors: ['Missing taskId', 'Missing agentId']
            });

            const result = await messageRouter.routeMessage(taskMessage);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing taskId');
        });
    });

    describe('connection pool management', () => {
        it('should route messages through available connections', async () => {
            const connection = { id: 'conn-1', isAlive: true, send: jest.fn() };
            mockConnectionPool.getConnection = jest.fn().mockReturnValue(connection);

            await messageRouter.routeMessage(mockMessage);

            expect(mockConnectionPool.getConnection).toHaveBeenCalledWith(mockMessage.destination);
        });

        it('should handle connection failures', async () => {
            mockConnectionPool.getConnection = jest.fn().mockReturnValue(null);

            const result = await messageRouter.routeMessage(mockMessage);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No available connection');
        });

        it('should implement connection load balancing', async () => {
            const connections = [
                { id: 'conn-1', load: 5 },
                { id: 'conn-2', load: 2 },
                { id: 'conn-3', load: 8 }
            ];

            mockConnectionPool.getAvailableConnections = jest.fn().mockReturnValue(connections);
            mockConnectionPool.getLeastLoadedConnection = jest.fn().mockReturnValue(connections[1]);

            await messageRouter.routeMessage(mockMessage);

            expect(mockConnectionPool.getLeastLoadedConnection).toHaveBeenCalled();
        });
    });

    describe('message persistence', () => {
        it('should persist messages during routing', async () => {
            await messageRouter.routeMessage(mockMessage);

            expect(mockPersistenceService.persistMessage).toHaveBeenCalledWith(mockMessage);
        });

        it('should handle persistence failures gracefully', async () => {
            mockPersistenceService.persistMessage = jest.fn().mockRejectedValue(new Error('Persistence failed'));

            const result = await messageRouter.routeMessage(mockMessage);

            // Should still route the message even if persistence fails
            expect(result.success).toBe(true);
            expect(mockLoggingService.warn).toHaveBeenCalledWith('Message persistence failed', expect.any(Object));
        });

        it('should include persistence metadata in routing result', async () => {
            mockPersistenceService.persistMessage = jest.fn().mockResolvedValue(true);

            const result = await messageRouter.routeMessage(mockMessage);

            expect(result.metadata?.persisted).toBe(true);
        });
    });

    describe('message filtering and transformation', () => {
        it('should filter messages based on priority', async () => {
            const lowPriorityMessage = { ...mockMessage, priority: MessagePriority.LOW };
            mockConnectionPool.isHighLoad = jest.fn().mockReturnValue(true);

            const result = await messageRouter.routeMessage(lowPriorityMessage);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Message dropped due to high load');
        });

        it('should transform messages before routing', async () => {
            const messageWithTransform = {
                ...mockMessage,
                payload: { templateId: 'old-template-name' }
            };

            mockMessageValidator.transformMessage = jest.fn().mockReturnValue({
                ...messageWithTransform,
                payload: { templateId: 'frontend-specialist' }
            });

            await messageRouter.routeMessage(messageWithTransform);

            expect(mockMessageValidator.transformMessage).toHaveBeenCalled();
        });

        it('should apply message enrichment', async () => {
            const enrichedMessage = await messageRouter.enrichMessage(mockMessage);

            expect(enrichedMessage.metadata).toBeDefined();
            expect(enrichedMessage.metadata.routedAt).toBeDefined();
            expect(enrichedMessage.metadata.routerId).toBeDefined();
        });
    });

    describe('error handling and retry logic', () => {
        it('should retry failed message routing', async () => {
            mockAgentManager.handleSpawnAgent = jest
                .fn()
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce({ agentId: 'agent-1' });

            const promise = messageRouter.routeMessage(mockMessage);

            // Advance timers to trigger retry
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            const result = await promise;

            expect(mockAgentManager.handleSpawnAgent).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
        });

        it('should implement exponential backoff for retries', async () => {
            mockAgentManager.handleSpawnAgent = jest.fn().mockRejectedValue(new Error('Persistent failure'));

            const promise = messageRouter.routeMessage(mockMessage);

            // Simulate exponential backoff delays: 100ms, 200ms, 400ms
            const totalBackoffMs = 100 + 200 + 400;
            jest.advanceTimersByTime(totalBackoffMs);
            await Promise.resolve();

            const result = await promise;

            expect(result.success).toBe(false);
            expect(result.retryCount).toBeGreaterThan(0);
        });

        it('should handle network errors with circuit breaker pattern', async () => {
            // Simulate multiple network failures
            for (let i = 0; i < 5; i++) {
                mockConnectionPool.getConnection = jest.fn().mockImplementation(() => {
                    throw new Error('Network error');
                });

                await messageRouter.routeMessage(mockMessage);
            }

            // Circuit should now be open
            const result = await messageRouter.routeMessage(mockMessage);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Circuit breaker open');
        });
    });

    describe('message queuing and batch processing', () => {
        it('should queue messages when handlers are busy', async () => {
            mockAgentManager.isBusy = jest.fn().mockReturnValue(true);

            const result = await messageRouter.routeMessage(mockMessage);

            expect(result.queued).toBe(true);
            expect(mockMetricsService.recordEvent).toHaveBeenCalledWith('message_queued', expect.any(Object));
        });

        it('should process queued messages in batches', async () => {
            const messages = Array.from({ length: 10 }, (_, i) => ({
                ...mockMessage,
                id: `msg-${i}`,
                payload: { ...mockMessage.payload, name: `Agent ${i}` }
            }));

            await messageRouter.processBatch(messages);

            expect(mockAgentManager.handleSpawnAgent).toHaveBeenCalledTimes(10);
            expect(mockMetricsService.recordEvent).toHaveBeenCalledWith('batch_processed', { size: 10 });
        });

        it('should respect message ordering within batches', async () => {
            const orderedMessages = [
                { ...mockMessage, id: 'msg-1', priority: MessagePriority.HIGH },
                { ...mockMessage, id: 'msg-2', priority: MessagePriority.MEDIUM },
                { ...mockMessage, id: 'msg-3', priority: MessagePriority.LOW }
            ];

            const processedOrder: string[] = [];
            mockAgentManager.handleSpawnAgent = jest.fn().mockImplementation(payload => {
                processedOrder.push(payload.name);
                return { agentId: `agent-${processedOrder.length}` };
            });

            await messageRouter.processBatch(orderedMessages);

            // High priority should be processed first
            expect(processedOrder[0]).toBe(orderedMessages[0].payload.name);
        });
    });

    describe('metrics and monitoring', () => {
        it('should record routing metrics', async () => {
            await messageRouter.routeMessage(mockMessage);

            expect(mockMetricsService.recordEvent).toHaveBeenCalledWith('message_routed', {
                type: MessageType.SPAWN_AGENT,
                source: 'conductor',
                destination: 'orchestrator'
            });
        });

        it('should track routing performance', async () => {
            await messageRouter.routeMessage(mockMessage);

            expect(mockMetricsService.recordLatency).toHaveBeenCalledWith('message_routing', expect.any(Number));
        });

        it('should monitor connection health', async () => {
            mockConnectionPool.getHealthStats = jest.fn().mockReturnValue({
                totalConnections: 5,
                activeConnections: 3,
                averageLoad: 0.6
            });

            await messageRouter.getHealthMetrics();

            expect(mockConnectionPool.getHealthStats).toHaveBeenCalled();
            expect(mockMetricsService.recordGauge).toHaveBeenCalledWith('connection_pool_health', expect.any(Object));
        });
    });
});
