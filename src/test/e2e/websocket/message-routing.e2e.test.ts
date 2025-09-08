import { test, expect } from '@playwright/test';
import { MessageType } from '../../../orchestration/MessageProtocol';
import { WebSocketTestHelper } from '../helpers/test-helpers';

test.describe('WebSocket Message Routing E2E Tests', () => {
    let wsHelper: WebSocketTestHelper;
    let conductorWs: WebSocketTestHelper;
    let agentWs: WebSocketTestHelper;

    test.beforeEach(async () => {
        wsHelper = new WebSocketTestHelper();
        conductorWs = new WebSocketTestHelper();
        agentWs = new WebSocketTestHelper();
    });

    test.afterEach(async () => {
        await wsHelper.disconnect();
        await conductorWs.disconnect();
        await agentWs.disconnect();
    });

    test('should establish WebSocket connection and receive heartbeat', async () => {
        await wsHelper.connect();

        const connectionMsg = await wsHelper.waitForMessage(MessageType.CONNECTION_ESTABLISHED);
        expect(connectionMsg).toBeDefined();
        expect(connectionMsg.type).toBe(MessageType.CONNECTION_ESTABLISHED);

        await wsHelper.sendMessage({
            type: MessageType.HEARTBEAT,
            payload: { timestamp: Date.now() }
        });

        const heartbeatResponse = await wsHelper.waitForMessage(MessageType.HEARTBEAT);
        expect(heartbeatResponse).toBeDefined();
    });

    test('should route messages between conductor and agents', async () => {
        await conductorWs.connect();
        await agentWs.connect();

        await conductorWs.sendMessage({
            type: MessageType.CONDUCTOR_REGISTER,
            payload: {
                id: 'conductor-1',
                name: 'Test Conductor'
            }
        });

        await agentWs.sendMessage({
            type: MessageType.AGENT_REGISTER,
            payload: {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'fullstack-developer'
            }
        });

        await conductorWs.sendMessage({
            type: MessageType.ASSIGN_TASK,
            payload: {
                agentId: 'agent-1',
                task: 'Test task',
                taskId: 'task-1',
                priority: 'high'
            }
        });

        const taskMessage = await agentWs.waitForMessage(MessageType.ASSIGN_TASK);
        expect(taskMessage.payload.task).toBe('Test task');
        expect(taskMessage.payload.taskId).toBe('task-1');

        await agentWs.sendMessage({
            type: MessageType.TASK_COMPLETE,
            payload: {
                taskId: 'task-1',
                agentId: 'agent-1',
                success: true,
                result: 'Task completed successfully'
            }
        });

        const completeMessage = await conductorWs.waitForMessage(MessageType.TASK_COMPLETE);
        expect(completeMessage.payload.success).toBe(true);
        expect(completeMessage.payload.result).toBe('Task completed successfully');
    });

    test('should handle broadcast messages to all connected clients', async () => {
        const clients: WebSocketTestHelper[] = [];

        for (let i = 0; i < 3; i++) {
            const client = new WebSocketTestHelper();
            await client.connect();
            clients.push(client);

            await client.sendMessage({
                type: MessageType.AGENT_REGISTER,
                payload: {
                    id: `agent-${i}`,
                    name: `Agent ${i}`,
                    type: 'testing-specialist'
                }
            });
        }

        await conductorWs.connect();
        await conductorWs.sendMessage({
            type: MessageType.BROADCAST,
            payload: {
                message: 'System update',
                level: 'info'
            }
        });

        for (const client of clients) {
            const broadcastMsg = await client.waitForMessage(MessageType.BROADCAST);
            expect(broadcastMsg.payload.message).toBe('System update');
        }

        for (const client of clients) {
            await client.disconnect();
        }
    });

    test('should handle connection drops and reconnection', async () => {
        await wsHelper.connect();

        await wsHelper.sendMessage({
            type: MessageType.AGENT_REGISTER,
            payload: {
                id: 'persistent-agent',
                name: 'Persistent Agent',
                type: 'backend-specialist'
            }
        });

        await wsHelper.disconnect();

        await new Promise(resolve => setTimeout(resolve, 1000));

        await wsHelper.connect();

        await wsHelper.sendMessage({
            type: MessageType.AGENT_RECONNECT,
            payload: {
                id: 'persistent-agent',
                lastMessageId: 'msg-123'
            }
        });

        const reconnectAck = await wsHelper.waitForMessage(MessageType.RECONNECT_ACK);
        expect(reconnectAck).toBeDefined();
        expect(reconnectAck.payload.agentId).toBe('persistent-agent');
    });

    test('should validate message format and reject invalid messages', async () => {
        await wsHelper.connect();

        await wsHelper.sendMessage({
            invalid: 'message',
            missing: 'type'
        });

        const errorMsg = await wsHelper.waitForMessage(MessageType.SYSTEM_ERROR);
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.error).toContain('Invalid message format');

        await wsHelper.sendMessage({
            type: 'UNKNOWN_TYPE',
            payload: {}
        });

        const unknownTypeError = await wsHelper.waitForMessage(MessageType.SYSTEM_ERROR);
        expect(unknownTypeError.payload.error).toContain('Unknown message type');
    });

    test('should handle rate limiting for message floods', async () => {
        await wsHelper.connect();

        const messages = [];
        for (let i = 0; i < 100; i++) {
            messages.push({
                type: MessageType.HEARTBEAT,
                payload: {
                    timestamp: Date.now(),
                    index: i
                }
            });
        }

        for (const msg of messages) {
            wsHelper.sendMessage(msg).catch(() => {});
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        const rateLimitMsg = await wsHelper.waitForMessage(MessageType.RATE_LIMIT_WARNING);
        expect(rateLimitMsg).toBeDefined();
        expect(rateLimitMsg.payload.message).toContain('Rate limit');
    });

    test('should maintain message order for sequential operations', async () => {
        await wsHelper.connect();

        const taskIds = ['task-1', 'task-2', 'task-3'];

        for (const taskId of taskIds) {
            await wsHelper.sendMessage({
                type: MessageType.CREATE_TASK,
                payload: {
                    taskId,
                    description: `Task ${taskId}`,
                    timestamp: Date.now()
                }
            });
        }

        const messages = wsHelper.getMessages();
        const taskMessages = messages.filter(m => m.type === MessageType.TASK_CREATED);

        expect(taskMessages.length).toBe(3);
        expect(taskMessages[0].payload.taskId).toBe('task-1');
        expect(taskMessages[1].payload.taskId).toBe('task-2');
        expect(taskMessages[2].payload.taskId).toBe('task-3');
    });

    test('should handle large payload messages', async () => {
        await wsHelper.connect();

        const largeData = 'x'.repeat(100000);

        await wsHelper.sendMessage({
            type: MessageType.DATA_TRANSFER,
            payload: {
                id: 'large-1',
                data: largeData,
                size: largeData.length
            }
        });

        const response = await wsHelper.waitForMessage(MessageType.DATA_RECEIVED, 10000);
        expect(response).toBeDefined();
        expect(response.payload.id).toBe('large-1');
        expect(response.payload.size).toBe(largeData.length);
    });
});
