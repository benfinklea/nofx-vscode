/**
 * Regression Test: Claude Command Injection
 *
 * This test ensures that when agents are spawned:
 * 1. The Claude command is sent correctly with --dangerously-skip-permissions
 * 2. NO echo commands are sent to the terminal
 * 3. NO detailed prompt injection happens automatically
 *
 * Background: There was a bug where multiple echo commands and incorrect
 * command construction were cluttering the terminal output.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

describe('Claude Command Injection Regression Tests', () => {
    let mockTerminal: any;
    let sendTextCalls: string[] = [];

    beforeEach(() => {
        // Mock VS Code terminal
        mockTerminal = {
            name: 'Test Terminal',
            processId: Promise.resolve(1234),
            sendText: jest.fn((text: string) => {
                sendTextCalls.push(text);
            }),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        };

        // Mock window.createTerminal
        (vscode.window.createTerminal as jest.Mock) = jest.fn().mockReturnValue(mockTerminal);

        // Clear sendText calls
        sendTextCalls = [];
    });

    afterEach(() => {
        jest.clearAllMocks();
        sendTextCalls = [];
    });

    it('should send ONLY the Claude command without any echo statements', async () => {
        // Create a test agent
        const agent: Agent = {
            id: 'test-agent-123',
            name: 'Test Agent',
            type: 'frontend-specialist',
            status: 'idle',
            terminal: undefined,
            template: {
                id: 'frontend-specialist',
                name: 'Frontend Specialist',
                icon: '🎨',
                systemPrompt: 'You are a Frontend Specialist.',
                detailedPrompt: 'Detailed prompt that should NOT be injected automatically',
                capabilities: {},
                taskPreferences: {
                    preferred: [],
                    avoid: []
                }
            }
        };

        // Create terminal for agent
        await terminalManager.createTerminal(agent.id, agent);

        // Perform agent initialization
        await terminalManager.performAgentInitialization(agent.id);

        // Filter out empty sendText calls and cd commands (those are acceptable)
        const relevantCalls = sendTextCalls.filter(call => call.trim() !== '' && !call.startsWith('cd '));

        // CRITICAL ASSERTIONS:

        // 1. No echo commands should be sent
        const echoCalls = relevantCalls.filter(call => call.includes('echo'));
        expect(echoCalls).toHaveLength(0);
        if (echoCalls.length > 0) {
            console.error('Found echo commands that should not exist:', echoCalls);
        }

        // 2. The Claude command should be sent exactly once
        const claudeCommands = relevantCalls.filter(
            call => call.includes('claude') && call.includes('--dangerously-skip-permissions')
        );
        expect(claudeCommands).toHaveLength(1);

        // 3. The Claude command should be properly formatted
        expect(claudeCommands[0]).toBe(
            "claude --dangerously-skip-permissions --append-system-prompt 'You are an expert in testing specialist. You are part of a NofX.dev coding team. Please wait for instructions.'"
        );

        // 4. No detailed prompt should be sent (it was disabled)
        const detailedPromptCalls = sendTextCalls.filter(call =>
            call.includes('Detailed prompt that should NOT be injected')
        );
        expect(detailedPromptCalls).toHaveLength(0);
    });

    it('should not send echo commands for agent info', async () => {
        const agent: Agent = {
            id: 'agent-456',
            name: 'Backend Developer',
            type: 'backend-specialist',
            status: 'idle',
            terminal: undefined,
            template: {
                id: 'backend-specialist',
                name: 'Backend Specialist',
                icon: '⚙️',
                systemPrompt: 'You are a Backend Specialist.',
                capabilities: {},
                taskPreferences: {
                    preferred: [],
                    avoid: []
                }
            }
        };

        await terminalManager.createTerminal(agent.id, agent);
        await terminalManager.performAgentInitialization(agent.id);

        // Should NOT find these echo commands that used to exist
        const forbiddenEchoes = [
            'echo "🤖 Initializing',
            'echo "Agent ID:',
            'echo "Starting AI provider',
            'echo "Starting',
            'echo "Command:'
        ];

        forbiddenEchoes.forEach(forbiddenEcho => {
            const found = sendTextCalls.some(call => call.includes(forbiddenEcho));
            expect(found).toBe(false);
            if (found) {
                console.error(`Found forbidden echo command: ${forbiddenEcho}`);
            }
        });
    });

    it('should not automatically inject detailed prompt after delay', async () => {
        const agent: Agent = {
            id: 'agent-789',
            name: 'Test Agent',
            type: 'testing-specialist',
            status: 'idle',
            terminal: undefined,
            template: {
                id: 'testing-specialist',
                name: 'Testing Specialist',
                icon: '🧪',
                systemPrompt: 'You are a Testing Specialist.',
                detailedPrompt:
                    'This is a very detailed prompt with lots of context that should NOT be automatically injected',
                capabilities: {},
                taskPreferences: {
                    preferred: [],
                    avoid: []
                }
            }
        };

        await terminalManager.createTerminal(agent.id, agent);

        // Clear previous calls
        sendTextCalls = [];

        // Perform initialization
        await terminalManager.performAgentInitialization(agent.id);

        // Wait to see if detailed prompt gets injected (it shouldn't)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check that detailed prompt was NOT sent
        const detailedPromptSent = sendTextCalls.some(call => call.includes('This is a very detailed prompt'));

        expect(detailedPromptSent).toBe(false);
    });

    it('should handle empty aiPath correctly', async () => {
        // Mock getAiPath to return empty string
        const configService = ServiceLocator.get<ConfigurationService>('ConfigurationService');
        jest.spyOn(configService, 'getAiPath').mockReturnValue('');

        const agent: Agent = {
            id: 'agent-empty-path',
            name: 'Test Agent',
            type: 'frontend-specialist',
            status: 'idle',
            terminal: undefined,
            template: {
                id: 'frontend-specialist',
                name: 'Frontend Specialist',
                icon: '🎨',
                systemPrompt: 'Test prompt',
                capabilities: {},
                taskPreferences: {
                    preferred: [],
                    avoid: []
                }
            }
        };

        await terminalManager.createTerminal(agent.id, agent);
        await terminalManager.performAgentInitialization(agent.id);

        // Should still send the hardcoded Claude command
        const claudeCommands = sendTextCalls.filter(
            call => call.includes('claude') && call.includes('--dangerously-skip-permissions')
        );

        expect(claudeCommands).toHaveLength(1);
        expect(claudeCommands[0]).toContain('claude --dangerously-skip-permissions');

        // Should NOT have a command starting with just --append-system-prompt
        const malformedCommands = sendTextCalls.filter(
            call =>
                call.trim().startsWith('--append-system-prompt') || call.trim().startsWith(' --append-system-prompt')
        );
        expect(malformedCommands).toHaveLength(0);
    });
});
