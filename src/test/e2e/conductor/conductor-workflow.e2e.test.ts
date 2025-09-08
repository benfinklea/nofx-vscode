import { test, expect } from '@playwright/test';
import { setupTestEnvironment, generateTestTask, mockClaude } from '../helpers/test-helpers';
import { MessageType } from '../../../orchestration/MessageProtocol';

test.describe('Conductor-Agent Workflow E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:7778/dashboard');
        await page.waitForLoadState('networkidle');
    });

    test('should spawn agents through WebSocket messages', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            // Direct WebSocket test without VS Code UI
            const agentId = await env.agent.spawnAgent('frontend-specialist', 'UI Expert');

            expect(agentId).toBeDefined();
            expect(agentId).toContain('agent-');

            // Verify agent is ready
            const messages = env.ws.getMessages();
            const agentReady = messages.find(m => m.type === MessageType.AGENT_READY);
            expect(agentReady).toBeDefined();
            expect(agentReady.payload.name).toBe('UI Expert');
        } finally {
            await env.cleanup();
        }
    });

    test('should handle task assignment and completion workflow', async ({ page }) => {
        const env = await setupTestEnvironment(page);
        const task = generateTestTask('simple');

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Dev Agent');

            await env.agent.assignTask(agentId, task.description);

            const progressMsg = await env.ws.waitForMessage(MessageType.TASK_PROGRESS);
            expect(progressMsg.payload.agentId).toBe(agentId);
            expect(progressMsg.payload.status).toBe('in_progress');

            const completeMsg = await env.ws.waitForMessage(MessageType.TASK_COMPLETE, task.timeout);
            expect(completeMsg.payload.agentId).toBe(agentId);
            expect(completeMsg.payload.success).toBe(true);

            const status = await env.agent.getAgentStatus(agentId);
            expect(status.taskCount).toBe(1);
            expect(status.completedTasks).toBe(1);
        } finally {
            await env.cleanup();
        }
    });

    test('should coordinate multiple agents working in parallel', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const frontendId = await env.agent.spawnAgent('frontend-specialist', 'Frontend Dev');
            const backendId = await env.agent.spawnAgent('backend-specialist', 'Backend Dev');
            const testerId = await env.agent.spawnAgent('testing-specialist', 'Test Engineer');

            await Promise.all([
                env.agent.assignTask(frontendId, 'Create React component for user profile'),
                env.agent.assignTask(backendId, 'Create REST API endpoint for user data'),
                env.agent.assignTask(testerId, 'Write unit tests for user service')
            ]);

            const messages = env.ws.getMessages();
            const progressMessages = messages.filter(m => m.type === MessageType.TASK_PROGRESS);
            expect(progressMessages.length).toBeGreaterThanOrEqual(3);

            const agentIds = new Set(progressMessages.map(m => m.payload.agentId));
            expect(agentIds.size).toBe(3);
        } finally {
            await env.cleanup();
        }
    });

    test('should handle agent termination gracefully', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Temp Agent');

            const status = await env.agent.getAgentStatus(agentId);
            expect(status.status).toBe('idle');

            await env.agent.terminateAgent(agentId);

            await expect(async () => {
                await env.agent.getAgentStatus(agentId);
            }).rejects.toThrow();

            await expect(page.locator('[role="treeitem"]:has-text("Temp Agent")')).toBeHidden();
        } finally {
            await env.cleanup();
        }
    });

    test('should recover from agent failures', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        await mockClaude(page, new Map([['error_task', 'ERROR: Task failed']]));

        try {
            const agentId = await env.agent.spawnAgent('fullstack-developer', 'Resilient Agent');

            await env.agent.assignTask(agentId, 'Execute error_task that will fail');

            const errorMsg = await env.ws.waitForMessage(MessageType.TASK_ERROR, 10000);
            expect(errorMsg.payload.agentId).toBe(agentId);

            const status = await env.agent.getAgentStatus(agentId);
            expect(status.status).toBe('idle');
            expect(status.failedTasks).toBe(1);

            await env.agent.assignTask(agentId, 'Execute normal task');
            const completeMsg = await env.ws.waitForMessage(MessageType.TASK_COMPLETE, 10000);
            expect(completeMsg.payload.success).toBe(true);
        } finally {
            await env.cleanup();
        }
    });

    test('should display real-time message flow in dashboard', async ({ page }) => {
        const env = await setupTestEnvironment(page);

        try {
            await env.vscode.executeCommand('NofX: Open Message Flow Dashboard');
            await page.waitForSelector('#message-flow-container');

            const agentId = await env.agent.spawnAgent('frontend-specialist', 'Dashboard Test');

            await expect(page.locator('.message-item:has-text("SPAWN_AGENT")')).toBeVisible();
            await expect(page.locator('.message-item:has-text("AGENT_READY")')).toBeVisible();

            await env.agent.assignTask(agentId, 'Test task for dashboard');

            await expect(page.locator('.message-item:has-text("ASSIGN_TASK")')).toBeVisible();
            await expect(page.locator('.message-item:has-text("TASK_PROGRESS")')).toBeVisible();

            const messageCount = await page.locator('.message-item').count();
            expect(messageCount).toBeGreaterThan(3);

            await expect(page.locator('.agent-status-card:has-text("Dashboard Test")')).toBeVisible();
        } finally {
            await env.cleanup();
        }
    });
});
