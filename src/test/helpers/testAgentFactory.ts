import * as vscode from 'vscode';
import { Agent } from '../../agents/types';

/**
 * Creates a mock terminal for testing
 */
export function createMockTerminal(): vscode.Terminal {
    return {
        name: 'Test Terminal',
        processId: Promise.resolve(1234),
        creationOptions: {},
        exitStatus: undefined,
        state: { isInteractedWith: false },
        sendText: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    } as unknown as vscode.Terminal;
}

/**
 * Creates a mock agent for testing
 */
export function createMockAgent(overrides?: Partial<Agent>): Agent {
    return {
        id: 'test-agent-123',
        name: 'Test Agent',
        type: 'frontend',
        status: 'idle',
        terminal: createMockTerminal(),
        currentTask: null,
        startTime: new Date(),
        tasksCompleted: 0,
        capabilities: ['testing'],
        template: { systemPrompt: 'You are a test agent' },
        ...overrides
    };
}
