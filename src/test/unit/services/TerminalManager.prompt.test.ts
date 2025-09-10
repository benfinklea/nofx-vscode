/**
 * Unit tests for TerminalManager prompt handling
 * Tests the specific prompt injection functionality
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { TerminalManager } from '../../../services/TerminalManager';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { LoggingService } from '../../../services/LoggingService';
import { ServiceLocator } from '../../../services/ServiceLocator';
import { Agent } from '../../../agents/types';

describe('TerminalManager Prompt Handling Unit Tests', () => {
    let terminalManager: TerminalManager;
    let configService: ConfigurationService;
    let loggingService: LoggingService;
    let sandbox: sinon.SinonSandbox;
    let mockTerminal: any;
    let createTerminalStub: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Setup mock terminal
        mockTerminal = {
            name: 'test-terminal',
            processId: Promise.resolve(1234),
            creationOptions: {},
            exitStatus: undefined,
            state: { isInteractedWith: false },
            sendText: sandbox.stub(),
            show: sandbox.stub(),
            hide: sandbox.stub(),
            dispose: sandbox.stub()
        };

        // Stub vscode.window.createTerminal
        createTerminalStub = sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

        // Setup services
        configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService as any, mainChannel);
        
        // Setup service locator
        ServiceLocator.register('configService', configService);
        ServiceLocator.register('loggingService', loggingService);
        
        terminalManager = new TerminalManager(configService as any, loggingService);
    });

    afterEach(() => {
        sandbox.restore();
        ServiceLocator.clear();
    });

    describe('createTerminalForAgent', () => {
        it('should create terminal with properly escaped prompt', async () => {
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'frontend-developer',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: {
                    id: 'frontend',
                    name: 'Frontend Developer',
                    icon: '🎨',
                    terminalIcon: 'browser',
                    color: '#61DAFB',
                    description: 'Frontend expert',
                    version: '1.0.0',
                    systemPrompt: 'You are a "frontend" expert with `special` skills and $100 experience',
                    detailedPrompt: '',
                    capabilities: {},
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'high',
                        complexity: 'high'
                    }
                }
            };

            // Stub config methods
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            // Create terminal
            const terminal = await terminalManager.createTerminalForAgent(agent);

            // Verify terminal was created
            assert.ok(createTerminalStub.calledOnce, 'Should create terminal');
            
            // Verify sendText was called with proper command
            assert.ok(mockTerminal.sendText.called, 'Should send command to terminal');
            
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            assert.ok(sentCommand.includes('claude'), 'Command should include claude');
            assert.ok(sentCommand.includes('--dangerously-skip-permissions'), 'Should include permissions flag');
            assert.ok(sentCommand.includes('--append-system-prompt'), 'Should include append-system-prompt');
            
            // Verify special characters are escaped
            assert.ok(sentCommand.includes('\\"frontend\\"'), 'Double quotes should be escaped');
            assert.ok(sentCommand.includes('\\`special\\`'), 'Backticks should be escaped');
            assert.ok(sentCommand.includes('\\$100'), 'Dollar signs should be escaped');
        });

        it('should handle multiline prompts correctly', async () => {
            const multilinePrompt = `Line 1
Line 2
Line 3`;
            
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'backend-developer',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: {
                    id: 'backend',
                    name: 'Backend Developer',
                    icon: '⚙️',
                    terminalIcon: 'server',
                    color: '#68A063',
                    description: 'Backend expert',
                    version: '1.0.0',
                    systemPrompt: multilinePrompt,
                    detailedPrompt: '',
                    capabilities: {},
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'high',
                        complexity: 'high'
                    }
                }
            };

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(false);

            const terminal = await terminalManager.createTerminalForAgent(agent);
            
            assert.ok(mockTerminal.sendText.called, 'Should send command');
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            
            // Should use double quotes for multiline
            assert.ok(sentCommand.includes('"'), 'Should use double quotes');
            assert.ok(!sentCommand.includes("'"), 'Should not use single quotes for prompt');
        });

        it('should not include echo commands', async () => {
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'testing-specialist',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: {
                    id: 'testing',
                    name: 'Testing Specialist',
                    icon: '🧪',
                    terminalIcon: 'beaker',
                    color: '#2ECC71',
                    description: 'Testing expert',
                    version: '1.0.0',
                    systemPrompt: 'Simple prompt',
                    detailedPrompt: '',
                    capabilities: {},
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'high',
                        complexity: 'medium'
                    }
                }
            };

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            const terminal = await terminalManager.createTerminalForAgent(agent);
            
            // Check all sendText calls
            for (let i = 0; i < mockTerminal.sendText.callCount; i++) {
                const call = mockTerminal.sendText.getCall(i);
                const text = call.args[0];
                
                // The main command should not include echo
                if (text.includes('claude')) {
                    assert.ok(!text.includes('echo'), `Command should not include echo: ${text}`);
                }
            }
        });

        it('should handle empty prompt gracefully', async () => {
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'generic',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: {
                    id: 'generic',
                    name: 'Generic Agent',
                    icon: '🤖',
                    terminalIcon: 'robot',
                    color: '#95A5A6',
                    description: 'Generic agent',
                    version: '1.0.0',
                    systemPrompt: '',
                    detailedPrompt: '',
                    capabilities: {},
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'medium',
                        complexity: 'medium'
                    }
                }
            };

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            const terminal = await terminalManager.createTerminalForAgent(agent);
            
            assert.ok(mockTerminal.sendText.called, 'Should still send command');
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            assert.ok(sentCommand.includes('--append-system-prompt ""'), 'Should handle empty prompt');
        });

        it('should handle very long prompts', async () => {
            const longPrompt = 'a'.repeat(4000); // 4000 character prompt
            
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'fullstack',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: {
                    id: 'fullstack',
                    name: 'Fullstack Developer',
                    icon: '🚀',
                    terminalIcon: 'layers',
                    color: '#E74C3C',
                    description: 'Fullstack expert',
                    version: '1.0.0',
                    systemPrompt: longPrompt,
                    detailedPrompt: '',
                    capabilities: {},
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'high',
                        complexity: 'high'
                    }
                }
            };

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            const terminal = await terminalManager.createTerminalForAgent(agent);
            
            assert.ok(mockTerminal.sendText.called, 'Should send command');
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            
            // Command should be constructed despite long prompt
            assert.ok(sentCommand.includes('claude'), 'Should include claude');
            assert.ok(sentCommand.includes('--append-system-prompt'), 'Should include flag');
            assert.ok(sentCommand.length > 4000, 'Command should include full prompt');
        });
    });

    describe('Escaping Functions', () => {
        it('should escape characters in correct order', () => {
            const input = 'Test\\with"back`slash$and\'quotes';
            const escaped = input
                .replace(/\\/g, '\\\\')     // Escape backslashes first
                .replace(/"/g, '\\"')        // Escape double quotes
                .replace(/\$/g, '\\$')       // Escape dollar signs
                .replace(/`/g, '\\`');       // Escape backticks
            
            // Backslashes should be doubled
            assert.ok(escaped.includes('\\\\with'), 'Backslashes should be escaped first');
            // Double quotes should be escaped
            assert.ok(escaped.includes('\\"back'), 'Double quotes should be escaped');
            // Dollar signs should be escaped
            assert.ok(escaped.includes('\\$and'), 'Dollar signs should be escaped');
            // Backticks should be escaped
            assert.ok(escaped.includes('\\`slash'), 'Backticks should be escaped');
        });

        it('should not escape single quotes when using double quotes', () => {
            const input = "Don't worry, it's fine";
            const escaped = input
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            // Single quotes should remain unescaped
            assert.ok(escaped.includes("Don't"), 'Single quotes should not be escaped');
            assert.ok(escaped.includes("it's"), 'Single quotes should not be escaped');
        });

        it('should handle mixed special characters', () => {
            const input = '${HOME}/path/to/`command` and "quoted text"';
            const escaped = input
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            assert.strictEqual(escaped, '\\${HOME}/path/to/\\`command\\` and \\"quoted text\\"');
        });
    });

    describe('Error Handling', () => {
        it('should handle terminal creation failure gracefully', async () => {
            // Make createTerminal throw an error
            createTerminalStub.throws(new Error('Terminal creation failed'));
            
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'frontend-developer',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: {
                    id: 'frontend',
                    name: 'Frontend Developer',
                    icon: '🎨',
                    terminalIcon: 'browser',
                    color: '#61DAFB',
                    description: 'Frontend expert',
                    version: '1.0.0',
                    systemPrompt: 'Test prompt',
                    detailedPrompt: '',
                    capabilities: {},
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'high',
                        complexity: 'high'
                    }
                }
            };

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            try {
                await terminalManager.createTerminalForAgent(agent);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Terminal creation failed'));
            }
        });

        it('should handle missing template gracefully', async () => {
            const agent: Agent = {
                id: 'test-agent',
                name: 'Test Agent',
                type: 'unknown',
                status: 'idle',
                createdAt: new Date(),
                lastActive: new Date(),
                capabilities: [],
                currentTask: null,
                completedTasks: [],
                template: undefined as any // Missing template
            };

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            const terminal = await terminalManager.createTerminalForAgent(agent);
            
            // Should still create terminal even without template
            assert.ok(createTerminalStub.called, 'Should create terminal');
            assert.ok(mockTerminal.sendText.called, 'Should send basic command');
        });
    });
});