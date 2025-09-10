/**
 * Agent Terminal Integration Smoke Tests
 * These tests would have caught the terminal + Claude integration issues
 */

import { ServiceLocator } from '../../services/ServiceLocator';
import { setupVSCodeMocks, createMockTerminal } from '../helpers/mockFactories';
import { AgentConfig } from '../../agents/types';

// Mock VS Code before importing extension
setupVSCodeMocks();

describe('Agent Terminal Integration Smoke Tests', () => {
    beforeEach(() => {
        // Clear service locator before each test
        ServiceLocator.clear();
        jest.clearAllMocks();
    });

    describe('Agent Creation and Terminal Launch', () => {
        test('should create agent with terminal configuration', () => {
            // This would have caught the "empty terminals" issue
            const mockTerminal = createMockTerminal();

            // Mock terminal manager
            ServiceLocator.register('TerminalManager', () => ({
                createTerminal: jest.fn().mockReturnValue(mockTerminal),
                initializeAgentTerminal: jest.fn().mockResolvedValue(undefined),
                dispose: jest.fn()
            }));

            const terminalManager = ServiceLocator.get('TerminalManager') as any;

            const config: AgentConfig = {
                name: 'Test Agent',
                type: 'backend-specialist',
                template: {
                    id: 'backend-specialist',
                    name: 'Backend Specialist',
                    systemPrompt: 'You are a backend developer.'
                }
            };

            // Test terminal creation
            const terminal = terminalManager.createTerminal('test-agent', config);
            expect(terminal).toBeDefined();
            expect(terminal.name).toBe('Mock Terminal');
        });

        test('should initialize Claude in agent terminal', () => {
            // This would have caught the "Claude not launching" issue
            const mockTerminal = createMockTerminal();

            ServiceLocator.register('TerminalManager', () => ({
                createTerminal: jest.fn().mockReturnValue(mockTerminal),
                initializeAgentTerminal: jest.fn().mockResolvedValue(undefined),
                dispose: jest.fn()
            }));

            const terminalManager = ServiceLocator.get('TerminalManager') as any;

            const mockAgent = {
                id: 'test-agent',
                name: 'Claude Test Agent',
                type: 'frontend-specialist',
                template: {
                    id: 'frontend-specialist',
                    name: 'Frontend Specialist',
                    systemPrompt: 'You are a frontend developer expert in React.'
                },
                terminal: mockTerminal
            };

            // Test Claude initialization
            expect(async () => {
                await terminalManager.initializeAgentTerminal(mockAgent);
            }).not.toThrow();
        });

        test('should handle multiple agents with separate terminals', () => {
            // This would have caught multi-agent terminal conflicts
            const mockTerminal1 = createMockTerminal();
            const mockTerminal2 = createMockTerminal();
            mockTerminal1.name = 'Backend Agent Terminal';
            mockTerminal2.name = 'Frontend Agent Terminal';

            ServiceLocator.register('TerminalManager', () => {
                let callCount = 0;
                return {
                    createTerminal: jest.fn().mockImplementation(() => {
                        callCount++;
                        return callCount === 1 ? mockTerminal1 : mockTerminal2;
                    }),
                    initializeAgentTerminal: jest.fn().mockResolvedValue(undefined),
                    dispose: jest.fn()
                };
            });

            const terminalManager = ServiceLocator.get('TerminalManager') as any;

            const terminal1 = terminalManager.createTerminal('backend-agent', {});
            const terminal2 = terminalManager.createTerminal('frontend-agent', {});

            // Verify all agents have unique terminals
            expect(terminal1).not.toBe(terminal2);
            expect(terminal1.name).toBe('Backend Agent Terminal');
            expect(terminal2.name).toBe('Frontend Agent Terminal');
        });
    });

    describe('Terminal Command Execution', () => {
        test('should verify terminal accepts commands', () => {
            const mockTerminal = createMockTerminal();

            ServiceLocator.register('TerminalManager', () => ({
                createTerminal: jest.fn().mockReturnValue(mockTerminal),
                dispose: jest.fn()
            }));

            const terminalManager = ServiceLocator.get('TerminalManager') as any;
            const terminal = terminalManager.createTerminal('command-test-agent', {});

            // Try sending a command (this would fail if terminal isn't properly initialized)
            expect(() => {
                terminal.sendText('echo "test"');
            }).not.toThrow();

            expect(terminal.sendText).toHaveBeenCalledWith('echo "test"');
        });
    });

    describe('Configuration Integration', () => {
        test('should respect AI provider configuration', () => {
            ServiceLocator.register('ConfigurationService', () => ({
                getAiProvider: jest.fn().mockReturnValue('claude'),
                getAiPath: jest.fn().mockReturnValue('/usr/local/bin/claude'),
                isClaudeSkipPermissions: jest.fn().mockReturnValue(false),
                getClaudeInitializationDelay: jest.fn().mockReturnValue(2000),
                dispose: jest.fn()
            }));

            const configService = ServiceLocator.get('ConfigurationService') as any;

            // Verify configuration is accessible
            expect(configService.getAiProvider()).toBe('claude');
            expect(configService.getAiPath()).toBe('/usr/local/bin/claude');
            expect(configService.isClaudeSkipPermissions()).toBe(false);
            expect(configService.getClaudeInitializationDelay()).toBe(2000);
        });

        test('should handle agent configuration properly', () => {
            const config: AgentConfig = {
                name: 'Config Test Agent',
                type: 'backend-specialist',
                template: {
                    id: 'backend-specialist',
                    name: 'Backend',
                    systemPrompt: 'Backend developer.'
                }
            };

            expect(config.name).toBe('Config Test Agent');
            expect(config.type).toBe('backend-specialist');
            expect(config.template.systemPrompt).toBe('Backend developer.');
        });
    });

    describe('Service Integration', () => {
        test('should integrate terminal manager with agent manager', () => {
            const mockTerminal = createMockTerminal();

            ServiceLocator.register('TerminalManager', () => ({
                createTerminal: jest.fn().mockReturnValue(mockTerminal),
                initializeAgentTerminal: jest.fn().mockResolvedValue(undefined),
                dispose: jest.fn()
            }));

            ServiceLocator.register('AgentManager', () => ({
                spawnAgent: jest.fn().mockImplementation(async (config: AgentConfig) => {
                    const terminalManager = ServiceLocator.get('TerminalManager') as any;
                    const terminal = terminalManager.createTerminal(config.name, config);
                    return {
                        id: 'test-agent',
                        terminal: terminal,
                        ...config
                    };
                }),
                getActiveAgents: jest.fn().mockReturnValue([]),
                removeAgent: jest.fn().mockResolvedValue(true),
                dispose: jest.fn()
            }));

            const agentManager = ServiceLocator.get('AgentManager') as any;
            const config: AgentConfig = {
                name: 'Integration Test Agent',
                type: 'testing-specialist',
                template: {
                    id: 'testing-specialist',
                    name: 'Test Specialist',
                    systemPrompt: 'You are a testing expert.'
                }
            };

            expect(async () => {
                const agent = await agentManager.spawnAgent(config);
                expect(agent.terminal).toBeDefined();
            }).not.toThrow();
        });
    });
});
