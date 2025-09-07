import {
    createMessage,
    generateMessageId,
    shouldRequireAck,
    isValidMessage,
    formatMessageForClaude,
    extractJsonFromClaudeOutput,
    OrchestratorMessage
} from '../../../orchestration/MessageProtocol';
import { MessageType } from '../../../orchestration/MessageProtocol';

describe('MessageProtocol', () => {
    describe('createMessage', () => {
        it('should create a message with all required fields', () => {
            const message = createMessage('conductor', 'agent-1', MessageType.ASSIGN_TASK, {
                taskId: 'task-1',
                description: 'Test task'
            });

            expect(message.id).toBeDefined();
            expect(message.from).toBe('conductor');
            expect(message.to).toBe('agent-1');
            expect(message.type).toBe(MessageType.ASSIGN_TASK);
            expect(message.payload).toEqual({ taskId: 'task-1', description: 'Test task' });
            expect(message.timestamp).toBeDefined();
            expect(message.requiresAck).toBe(true); // ASSIGN_TASK requires ack
        });

        it('should use provided correlation ID when specified', () => {
            const correlationId = 'corr-123';
            const message = createMessage(
                'agent-1',
                'conductor',
                MessageType.TASK_COMPLETE,
                { taskId: 'task-1' },
                correlationId
            );

            expect(message.correlationId).toBe(correlationId);
        });

        it('should generate new correlation ID when not specified', () => {
            const message = createMessage('agent-1', 'conductor', MessageType.TASK_COMPLETE, { taskId: 'task-1' });

            expect(message.correlationId).toBeDefined();
            expect(message.correlationId).toMatch(/^msg_/);
        });

        it('should set requiresAck based on message type', () => {
            const taskMessage = createMessage('conductor', 'agent-1', MessageType.ASSIGN_TASK, {});
            expect(taskMessage.requiresAck).toBe(true);

            const statusMessage = createMessage('agent-1', 'conductor', MessageType.AGENT_STATUS, {});
            expect(statusMessage.requiresAck).toBe(false);
        });
    });

    describe('generateMessageId', () => {
        it('should generate unique message IDs', () => {
            const id1 = generateMessageId();
            const id2 = generateMessageId();

            expect(id1).toMatch(/^msg_[a-f0-9]{8}$/);
            expect(id2).toMatch(/^msg_[a-f0-9]{8}$/);
            expect(id1).not.toBe(id2);
        });
    });

    describe('shouldRequireAck', () => {
        it('should return true for messages requiring acknowledgment', () => {
            expect(shouldRequireAck(MessageType.SPAWN_AGENT)).toBe(true);
            expect(shouldRequireAck(MessageType.ASSIGN_TASK)).toBe(true);
            expect(shouldRequireAck(MessageType.TERMINATE_AGENT)).toBe(true);
        });

        it('should return false for messages not requiring acknowledgment', () => {
            expect(shouldRequireAck(MessageType.AGENT_STATUS)).toBe(false);
            expect(shouldRequireAck(MessageType.TASK_PROGRESS)).toBe(false);
            expect(shouldRequireAck(MessageType.HEARTBEAT)).toBe(false);
        });
    });

    describe('isValidMessage', () => {
        it('should validate a correct message structure', () => {
            const validMessage = {
                id: 'msg_123',
                from: 'conductor',
                to: 'agent-1',
                type: MessageType.ASSIGN_TASK,
                payload: { taskId: 'task-1' },
                timestamp: new Date().toISOString(),
                requiresAck: true
            };

            expect(isValidMessage(validMessage)).toBe(true);
        });

        it('should reject messages missing required fields', () => {
            const missingId = {
                from: 'conductor',
                to: 'agent-1',
                type: MessageType.ASSIGN_TASK,
                payload: {},
                timestamp: new Date().toISOString()
            };
            expect(isValidMessage(missingId)).toBe(false);

            const missingFrom = {
                id: 'msg_123',
                to: 'agent-1',
                type: MessageType.ASSIGN_TASK,
                payload: {},
                timestamp: new Date().toISOString()
            };
            expect(isValidMessage(missingFrom)).toBe(false);

            const missingType = {
                id: 'msg_123',
                from: 'conductor',
                to: 'agent-1',
                payload: {},
                timestamp: new Date().toISOString()
            };
            expect(isValidMessage(missingType)).toBe(false);
        });

        it('should reject non-object inputs', () => {
            expect(isValidMessage(null)).toBe(false);
            expect(isValidMessage(undefined)).toBe(false);
            expect(isValidMessage('string')).toBe(false);
            expect(isValidMessage(123)).toBe(false);
            expect(isValidMessage([])).toBe(false);
        });

        it('should reject messages with wrong field types', () => {
            const wrongTypes = {
                id: 123, // Should be string
                from: 'conductor',
                to: 'agent-1',
                type: MessageType.ASSIGN_TASK,
                payload: {},
                timestamp: new Date().toISOString()
            };
            expect(isValidMessage(wrongTypes)).toBe(false);
        });
    });

    describe('formatMessageForClaude', () => {
        it('should format message for Claude consumption', () => {
            const message: OrchestratorMessage = {
                id: 'msg_123',
                from: 'conductor',
                to: 'agent-1',
                type: MessageType.ASSIGN_TASK,
                payload: { taskId: 'task-1', description: 'Build UI' },
                timestamp: new Date().toISOString(),
                requiresAck: true
            };

            const formatted = formatMessageForClaude(message);

            expect(formatted).toContain('ORCHESTRATION MESSAGE');
            expect(formatted).toContain(`Type: ${MessageType.ASSIGN_TASK}`);
            expect(formatted).toContain('From: conductor');
            expect(formatted).toContain('To: agent-1');
            expect(formatted).toContain('```json');
            expect(formatted).toContain('"taskId": "task-1"');
            expect(formatted).toContain('"description": "Build UI"');
        });

        it('should handle messages without payload', () => {
            const message: OrchestratorMessage = {
                id: 'msg_123',
                from: 'agent-1',
                to: 'conductor',
                type: MessageType.HEARTBEAT,
                payload: {},
                timestamp: new Date().toISOString(),
                requiresAck: false
            };

            const formatted = formatMessageForClaude(message);

            expect(formatted).toContain('ORCHESTRATION MESSAGE');
            expect(formatted).toContain(`Type: ${MessageType.HEARTBEAT}`);
            expect(formatted).toContain('```json');
            expect(formatted).toContain('{}');
        });
    });

    describe('extractJsonFromClaudeOutput', () => {
        it('should extract JSON from Claude output with code blocks', () => {
            const output = `
                I'll help you with that task. Here's the response:
                
                \`\`\`json
                {
                    "type": "spawn_agent",
                    "payload": {
                        "templateId": "frontend-specialist",
                        "name": "UI Expert"
                    }
                }
                \`\`\`
                
                The agent has been configured.
            `;

            const extracted = extractJsonFromClaudeOutput(output);

            expect(extracted).toBeDefined();
            expect(extracted?.type).toBe('spawn_agent');
            expect(extracted?.payload).toEqual({
                templateId: 'frontend-specialist',
                name: 'UI Expert'
            });
        });

        it('should extract JSON object without code blocks', () => {
            const output = `
                Here's the message:
                {"type": "task_complete", "payload": {"taskId": "task-123"}}
                Done.
            `;

            const extracted = extractJsonFromClaudeOutput(output);

            expect(extracted).toBeDefined();
            expect(extracted?.type).toBe('task_complete');
            expect(extracted?.payload).toEqual({ taskId: 'task-123' });
        });

        it('should return null for invalid JSON', () => {
            const output = `
                This is not valid JSON:
                {invalid json here}
            `;

            const extracted = extractJsonFromClaudeOutput(output);
            expect(extracted).toBeNull();
        });

        it('should return null when no JSON is found', () => {
            const output = 'This is just plain text without any JSON';

            const extracted = extractJsonFromClaudeOutput(output);
            expect(extracted).toBeNull();
        });

        it('should extract the first valid JSON when multiple are present', () => {
            const output = `
                First JSON:
                {"type": "first", "payload": {}}
                
                Second JSON:
                {"type": "second", "payload": {}}
            `;

            const extracted = extractJsonFromClaudeOutput(output);

            expect(extracted).toBeDefined();
            expect(extracted?.type).toBe('first');
        });

        it('should handle JSON with nested objects', () => {
            const output = `
                \`\`\`json
                {
                    "type": "spawn_agent",
                    "payload": {
                        "templateId": "backend",
                        "config": {
                            "memory": 512,
                            "timeout": 3000
                        },
                        "capabilities": ["node", "python"]
                    }
                }
                \`\`\`
            `;

            const extracted = extractJsonFromClaudeOutput(output);

            expect(extracted).toBeDefined();
            expect(extracted?.payload?.config).toEqual({
                memory: 512,
                timeout: 3000
            });
            expect(extracted?.payload?.capabilities).toEqual(['node', 'python']);
        });
    });
});
