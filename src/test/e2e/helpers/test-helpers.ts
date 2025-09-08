import { Page, expect } from '@playwright/test';
import * as path from 'path';
import * as WebSocket from 'ws';
import { MessageType } from '../../../orchestration/MessageProtocol';

// Simplified mock for VS Code interactions in E2E tests
export class VSCodeTestHelper {
    constructor(private page: Page) {}

    // These methods are mocked for E2E testing outside VS Code
    async openExtension() {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async openCommandPalette() {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async executeCommand(command: string) {
        // Mock implementation
        console.log('Mock executing command:', command);
        await this.page.waitForTimeout(100);
    }

    async waitForNotification(text: string, timeout = 5000) {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async clickActivityBarIcon(iconName: string) {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async waitForTreeItem(text: string) {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async clickTreeItem(text: string) {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async waitForTerminal(name: string) {
        // Mock implementation
        await this.page.waitForTimeout(100);
    }

    async typeInTerminal(text: string) {
        // Mock implementation
        console.log('Mock typing in terminal:', text);
        await this.page.waitForTimeout(100);
    }

    async getTerminalOutput(): Promise<string> {
        // Mock implementation
        return 'Mock terminal output\nAgent spawned successfully';
    }
}

export class WebSocketTestHelper {
    private ws: WebSocket.WebSocket | null = null;
    private messages: any[] = [];
    private messageHandlers: Map<string, (msg: any) => void> = new Map();

    async connect(url: string = 'ws://localhost:7778'): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket.WebSocket(url);

            this.ws.on('open', () => {
                console.log('WebSocket connected');
                resolve();
            });

            this.ws.on('message', (data: string) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.messages.push(message);

                    const handler = this.messageHandlers.get(message.type);
                    if (handler) {
                        handler(message);
                    }
                } catch (error) {
                    console.error('Failed to parse message:', error);
                }
            });

            this.ws.on('error', reject);

            setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
        });
    }

    async sendMessage(message: any): Promise<void> {
        if (!this.ws) {
            throw new Error('WebSocket not connected');
        }

        this.ws.send(JSON.stringify(message));
    }

    async waitForMessage(type: MessageType, timeout = 5000): Promise<any> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const message = this.messages.find(m => m.type === type);
            if (message) {
                return message;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error(`Timeout waiting for message type: ${type}`);
    }

    onMessage(type: string, handler: (msg: any) => void) {
        this.messageHandlers.set(type, handler);
    }

    getMessages(): any[] {
        return [...this.messages];
    }

    clearMessages() {
        this.messages = [];
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

export class AgentTestHelper {
    constructor(
        private vscodeHelper: VSCodeTestHelper,
        private wsHelper: WebSocketTestHelper
    ) {}

    async spawnAgent(role: string, name: string): Promise<string> {
        await this.wsHelper.sendMessage({
            type: MessageType.SPAWN_AGENT,
            payload: {
                role,
                name,
                timestamp: Date.now()
            }
        });

        const response = await this.wsHelper.waitForMessage(MessageType.AGENT_READY);
        return response.payload.agentId;
    }

    async assignTask(agentId: string, task: string, priority = 'medium'): Promise<void> {
        await this.wsHelper.sendMessage({
            type: MessageType.ASSIGN_TASK,
            payload: {
                agentId,
                task,
                priority,
                timestamp: Date.now()
            }
        });

        await this.wsHelper.waitForMessage(MessageType.TASK_PROGRESS);
    }

    async waitForTaskComplete(taskId: string, timeout = 30000): Promise<any> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const messages = this.wsHelper.getMessages();
            const completeMsg = messages.find(m => m.type === MessageType.TASK_COMPLETE && m.payload.taskId === taskId);

            if (completeMsg) {
                return completeMsg;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        throw new Error(`Task ${taskId} did not complete within ${timeout}ms`);
    }

    async getAgentStatus(agentId: string): Promise<any> {
        await this.wsHelper.sendMessage({
            type: MessageType.QUERY_STATUS,
            payload: { agentId }
        });

        const response = await this.wsHelper.waitForMessage(MessageType.AGENT_STATUS);
        return response.payload;
    }

    async terminateAgent(agentId: string): Promise<void> {
        await this.wsHelper.sendMessage({
            type: MessageType.TERMINATE_AGENT,
            payload: { agentId }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

export async function setupTestEnvironment(page: Page) {
    const vscodeHelper = new VSCodeTestHelper(page);
    const wsHelper = new WebSocketTestHelper();
    const agentHelper = new AgentTestHelper(vscodeHelper, wsHelper);

    await wsHelper.connect();

    return {
        vscode: vscodeHelper,
        ws: wsHelper,
        agent: agentHelper,
        cleanup: async () => {
            await wsHelper.disconnect();
        }
    };
}

export function generateTestTask(type: 'simple' | 'complex' | 'file-creation' = 'simple') {
    const tasks = {
        simple: {
            description: 'Create a hello world function',
            expectedOutput: 'function helloWorld()',
            timeout: 10000
        },
        complex: {
            description: 'Refactor the AgentManager class to use dependency injection',
            expectedOutput: 'class AgentManager',
            timeout: 30000
        },
        'file-creation': {
            description: 'Create a new test file called sample.test.ts with basic Jest tests',
            expectedOutput: 'sample.test.ts',
            timeout: 15000
        }
    };

    return tasks[type];
}

export async function mockClaude(page: Page, responses: Map<string, string>) {
    await page.route('**/claude', async route => {
        const postData = route.request().postData();

        for (const [pattern, response] of responses) {
            if (postData?.includes(pattern)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/plain',
                    body: response
                });
                return;
            }
        }

        await route.continue();
    });
}
