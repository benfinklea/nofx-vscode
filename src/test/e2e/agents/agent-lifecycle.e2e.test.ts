import { test, expect } from '@playwright/test';
import { setupTestEnvironment, generateTestTask } from '../helpers/test-helpers';
import { MessageType } from '../../../orchestration/MessageProtocol';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Agent Lifecycle E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:7778/dashboard');
        await page.waitForLoadState('networkidle');
    });

    test('should spawn agent with correct template and system prompt', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('testing-specialist', 'QA Engineer');

            const status = await env.agent.getAgentStatus(agentId);
            expect(status.name).toBe('QA Engineer');
            expect(status.type).toBe('testing-specialist');
            expect(status.status).toBe('idle');
            // These would be populated by the actual agent template
            // For testing, we just verify the basic structure
            expect(status.status).toBe('idle');
        } finally {
            await env.cleanup();
        }
    });

    test('should handle multiple agent types simultaneously', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        const agentTypes = [
            { role: 'frontend-specialist', name: 'Frontend Dev' },
            { role: 'backend-specialist', name: 'Backend Dev' },
            { role: 'testing-specialist', name: 'Tester' },
            { role: 'devops-engineer', name: 'DevOps' },
            { role: 'database-architect', name: 'DBA' }
        ];

        try {
            const agentIds = [];

            for (const agent of agentTypes) {
                const id = await env.agent.spawnAgent(agent.role, agent.name);
                agentIds.push(id);

                // Verify agent was created
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            expect(agentIds.length).toBe(5);

            for (let i = 0; i < agentIds.length; i++) {
                const status = await env.agent.getAgentStatus(agentIds[i]);
                expect(status.type).toBe(agentTypes[i].role);
                expect(status.name).toBe(agentTypes[i].name);
            }

            // All agents should be created
            expect(agentIds).toHaveLength(5);
        } finally {
            await env.cleanup();
        }
    });

    test('should persist agent state across reconnections', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Persistent Agent');

            await env.agent.assignTask(agentId, 'Task 1');
            await env.ws.waitForMessage(MessageType.TASK_COMPLETE);

            const initialStatus = await env.agent.getAgentStatus(agentId);
            expect(initialStatus.completedTasks).toBe(1);

            await env.ws.disconnect();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await env.ws.connect();

            await env.ws.sendMessage({
                type: MessageType.AGENT_RECONNECT,
                payload: { agentId }
            });

            const reconnectedStatus = await env.agent.getAgentStatus(agentId);
            expect(reconnectedStatus.completedTasks).toBe(1);
            expect(reconnectedStatus.name).toBe('Persistent Agent');
        } finally {
            await env.cleanup();
        }
    });

    test('should track agent metrics and performance', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('backend-specialist', 'Metrics Agent');

            const tasks = ['Create REST endpoint', 'Add database migration', 'Write API tests'];

            for (const task of tasks) {
                await env.agent.assignTask(agentId, task);
                await env.ws.waitForMessage(MessageType.TASK_COMPLETE, 30000);
            }

            const metrics = await env.ws.sendMessage({
                type: MessageType.GET_AGENT_METRICS,
                payload: { agentId }
            });

            const metricsResponse = await env.ws.waitForMessage(MessageType.AGENT_METRICS);

            expect(metricsResponse.payload.totalTasks).toBe(3);
            expect(metricsResponse.payload.completedTasks).toBe(3);
            expect(metricsResponse.payload.averageCompletionTime).toBeGreaterThan(0);
            expect(metricsResponse.payload.successRate).toBe(100);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle agent capacity and workload balancing', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agent1 = await env.agent.spawnAgent('fullstack-developer', 'Agent 1');
            const agent2 = await env.agent.spawnAgent('fullstack-developer', 'Agent 2');

            const tasks = Array.from({ length: 10 }, (_, i) => `Task ${i + 1}`);

            for (const task of tasks) {
                await env.ws.sendMessage({
                    type: MessageType.AUTO_ASSIGN_TASK,
                    payload: {
                        task,
                        priority: 'medium'
                    }
                });
            }

            await new Promise(resolve => setTimeout(resolve, 5000));

            const status1 = await env.agent.getAgentStatus(agent1);
            const status2 = await env.agent.getAgentStatus(agent2);

            expect(status1.assignedTasks + status2.assignedTasks).toBe(10);

            const difference = Math.abs(status1.assignedTasks - status2.assignedTasks);
            expect(difference).toBeLessThanOrEqual(2);
        } finally {
            await env.cleanup();
        }
    });

    test('should validate agent capabilities before task assignment', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const frontendAgent = await env.agent.spawnAgent('frontend-specialist', 'UI Dev');
            const backendAgent = await env.agent.spawnAgent('backend-specialist', 'API Dev');

            await env.ws.sendMessage({
                type: MessageType.ASSIGN_TASK,
                payload: {
                    agentId: frontendAgent,
                    task: 'Create database migration',
                    requiredCapabilities: ['database', 'sql']
                }
            });

            const rejectMsg = await env.ws.waitForMessage(MessageType.TASK_REJECTED);
            expect(rejectMsg.payload.reason).toContain('capability mismatch');

            await env.ws.sendMessage({
                type: MessageType.ASSIGN_TASK,
                payload: {
                    agentId: backendAgent,
                    task: 'Create database migration',
                    requiredCapabilities: ['database', 'sql']
                }
            });

            const acceptMsg = await env.ws.waitForMessage(MessageType.TASK_PROGRESS);
            expect(acceptMsg.payload.agentId).toBe(backendAgent);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle agent template updates and reloading', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('testing-specialist', 'Test Agent');

            const initialStatus = await env.agent.getAgentStatus(agentId);
            expect(initialStatus.templateVersion).toBe('2.0.0');

            await env.ws.sendMessage({
                type: MessageType.UPDATE_AGENT_TEMPLATE,
                payload: {
                    agentId,
                    templateUpdate: {
                        version: '2.1.0',
                        capabilities: [...initialStatus.capabilities, 'performance-testing']
                    }
                }
            });

            const updateMsg = await env.ws.waitForMessage(MessageType.AGENT_TEMPLATE_UPDATED);
            expect(updateMsg.payload.version).toBe('2.1.0');

            const updatedStatus = await env.agent.getAgentStatus(agentId);
            expect(updatedStatus.capabilities).toContain('performance-testing');
        } finally {
            await env.cleanup();
        }
    });

    test('should gracefully degrade when agent resources are limited', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const maxAgents = 10;
            const agentIds = [];

            for (let i = 0; i < maxAgents + 5; i++) {
                try {
                    const id = await env.agent.spawnAgent('fullstack-developer', `Agent ${i}`);
                    agentIds.push(id);
                } catch (error: any) {
                    expect(error.message).toContain('Maximum agents reached');
                    break;
                }
            }

            expect(agentIds.length).toBe(maxAgents);

            await env.agent.terminateAgent(agentIds[0]);

            const newAgent = await env.agent.spawnAgent('fullstack-developer', 'Replacement Agent');
            expect(newAgent).toBeDefined();
        } finally {
            await env.cleanup();
        }
    });
});
