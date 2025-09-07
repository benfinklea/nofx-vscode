import * as vscode from 'vscode';
import { TerminalManager } from '../../../services/TerminalManager';
import { IConfigurationService, ILoggingService, IEventBus, IErrorHandler } from '../../../services/interfaces';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';

jest.mock('vscode');

describe('TerminalManager', () => {
    let terminalManager: TerminalManager;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockTerminal: jest.Mocked<vscode.Terminal>;
    let onDidCloseTerminalCallback: ((terminal: vscode.Terminal) => void) | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock terminal
        mockTerminal = {
            show: jest.fn(),
            sendText: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            name: 'Test Terminal',
            processId: Promise.resolve(1234),
            creationOptions: {},
            exitStatus: undefined,
            state: { isInteractedWith: false }
        } as any;

        // Mock window.createTerminal
        (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

        // Mock window.onDidCloseTerminal to capture the callback
        (vscode.window.onDidCloseTerminal as jest.Mock).mockImplementation(callback => {
            onDidCloseTerminalCallback = callback;
            return { dispose: jest.fn() };
        });

        // Mock vscode.env
        (vscode as any).env = {
            shell: '/bin/bash'
        };

        // Mock vscode.ThemeIcon
        (vscode as any).ThemeIcon = jest.fn().mockImplementation(icon => ({ icon }));

        // Mock configuration service
        mockConfigService = {
            getAiPath: jest.fn().mockReturnValue('claude'),
            isClaudeSkipPermissions: jest.fn().mockReturnValue(false),
            isShowAgentTerminalOnSpawn: jest.fn().mockReturnValue(true),
            get: jest.fn(),
            getAll: jest.fn(),
            update: jest.fn(),
            validateAll: jest.fn(),
            getLogLevel: jest.fn(),
            onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            dispose: jest.fn()
        } as any;

        // Mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            isLevelEnabled: jest.fn(),
            getChannel: jest.fn(),
            onDidChangeConfiguration: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock event bus
        mockEventBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock error handler
        mockErrorHandler = {
            handleError: jest.fn(),
            handleWarning: jest.fn(),
            wrapAsync: jest.fn(),
            createUserError: jest.fn(),
            dispose: jest.fn()
        } as any;

        terminalManager = new TerminalManager(mockConfigService, mockLoggingService, mockEventBus, mockErrorHandler);
    });

    afterEach(() => {
        jest.useRealTimers();
        terminalManager.dispose();
    });

    describe('constructor', () => {
        it('should initialize with required services', () => {
            expect(vscode.window.onDidCloseTerminal).toHaveBeenCalled();
        });

        it('should work without optional services', () => {
            const manager = new TerminalManager(mockConfigService);
            expect(() => manager.createTerminal('test', {})).not.toThrow();
            manager.dispose();
        });
    });

    describe('createTerminal', () => {
        it('should create terminal with agent config', () => {
            const agentConfig = {
                name: 'Test Agent',
                type: 'backend',
                template: { icon: '🔧' }
            };

            const terminal = terminalManager.createTerminal('agent-1', agentConfig);

            expect(vscode.window.createTerminal).toHaveBeenCalledWith({
                name: '🔧 Test Agent',
                iconPath: expect.objectContaining({ icon: 'robot' }),
                shellPath: '/bin/bash',
                shellArgs: [],
                env: {
                    NOFX_AGENT_ID: 'agent-1',
                    NOFX_AGENT_TYPE: 'backend',
                    NOFX_AGENT_NAME: 'Test Agent'
                }
            });
            expect(terminal).toBe(mockTerminal);
        });

        it('should use conductor icon for conductor type', () => {
            const agentConfig = {
                name: 'Conductor',
                type: 'conductor'
            };

            terminalManager.createTerminal('conductor-1', agentConfig);

            expect(vscode.window.createTerminal).toHaveBeenCalledWith(
                expect.objectContaining({
                    iconPath: expect.objectContaining({ icon: 'terminal' })
                })
            );
        });

        it('should use custom terminal icon if provided', () => {
            const agentConfig = {
                name: 'Custom Agent',
                type: 'custom',
                terminalIcon: 'zap'
            };

            terminalManager.createTerminal('agent-1', agentConfig);

            expect(vscode.window.createTerminal).toHaveBeenCalledWith(
                expect.objectContaining({
                    iconPath: expect.objectContaining({ icon: 'zap' })
                })
            );
        });

        it('should publish event to event bus', () => {
            const agentConfig = { name: 'Test', type: 'test' };

            terminalManager.createTerminal('agent-1', agentConfig);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                DOMAIN_EVENTS.TERMINAL_CREATED,
                expect.objectContaining({
                    agentId: 'agent-1',
                    terminal: mockTerminal,
                    agentConfig
                })
            );
        });

        it('should store terminal in map', () => {
            terminalManager.createTerminal('agent-1', { name: 'Test' });

            const terminal = terminalManager.getTerminal('agent-1');
            expect(terminal).toBe(mockTerminal);
        });

        it('should handle missing shell path', () => {
            (vscode as any).env.shell = undefined;

            terminalManager.createTerminal('agent-1', { name: 'Test' });

            expect(vscode.window.createTerminal).toHaveBeenCalledWith(
                expect.objectContaining({
                    shellPath: '/bin/bash' // fallback
                })
            );
        });
    });

    describe('getTerminal', () => {
        it('should return terminal if exists', () => {
            terminalManager.createTerminal('agent-1', { name: 'Test' });

            const terminal = terminalManager.getTerminal('agent-1');
            expect(terminal).toBe(mockTerminal);
        });

        it('should return undefined if not exists', () => {
            const terminal = terminalManager.getTerminal('non-existent');
            expect(terminal).toBeUndefined();
        });
    });

    describe('disposeTerminal', () => {
        it('should dispose and remove terminal', () => {
            terminalManager.createTerminal('agent-1', { name: 'Test' });

            terminalManager.disposeTerminal('agent-1');

            expect(mockTerminal.dispose).toHaveBeenCalled();
            expect(terminalManager.getTerminal('agent-1')).toBeUndefined();
        });

        it('should publish event to event bus', () => {
            terminalManager.createTerminal('agent-1', { name: 'Test' });

            terminalManager.disposeTerminal('agent-1');

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                DOMAIN_EVENTS.TERMINAL_DISPOSED,
                expect.objectContaining({
                    agentId: 'agent-1',
                    terminal: mockTerminal
                })
            );
        });

        it('should handle non-existent terminal', () => {
            expect(() => terminalManager.disposeTerminal('non-existent')).not.toThrow();
            expect(mockLoggingService.debug).not.toHaveBeenCalledWith(expect.stringContaining('Terminal disposed'));
        });
    });

    describe('initializeAgentTerminal', () => {
        beforeEach(() => {
            (vscode.window as any).activeTerminal = mockTerminal;
        });

        it('should initialize terminal with system prompt', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'backend-specialist',
                template: {
                    systemPrompt: 'You are a backend specialist'
                }
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            expect(mockTerminal.show).toHaveBeenCalledWith(true);
            expect(mockTerminal.sendText).toHaveBeenCalledWith('');
            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining('claude'));
        });

        it('should set working directory if provided', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test'
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent, '/test/dir');
            jest.runAllTimers();
            await promise;

            expect(mockTerminal.sendText).toHaveBeenCalledWith('cd "/test/dir"');
        });

        it('should handle missing terminal', async () => {
            const agent = {
                id: 'non-existent',
                name: 'Test Agent',
                type: 'test'
            };

            await terminalManager.initializeAgentTerminal(agent);

            expect(mockLoggingService.error).toHaveBeenCalledWith('No terminal found for agent non-existent');
        });

        it('should use skip permissions flag when configured', async () => {
            mockConfigService.isClaudeSkipPermissions.mockReturnValue(true);

            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test',
                template: {
                    systemPrompt: 'Test prompt'
                }
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            expect(mockTerminal.sendText).toHaveBeenCalledWith(
                expect.stringContaining('--dangerously-skip-permissions')
            );
        });

        it('should handle inactive terminal', async () => {
            (vscode.window as any).activeTerminal = null;

            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test'
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            expect(mockLoggingService.warn).toHaveBeenCalledWith(expect.stringContaining('not active'));
            expect(mockTerminal.show).toHaveBeenCalledTimes(3); // initial + refocus + final
        });

        it('should use basic prompt when no template', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Basic Agent',
                type: 'general'
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining('general purpose agent'));
        });

        it('should respect show terminal configuration', async () => {
            mockConfigService.isShowAgentTerminalOnSpawn.mockReturnValue(false);

            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'test'
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            // Terminal should be shown initially but configuration determines final state
            expect(mockTerminal.show).toHaveBeenCalled();
        });
    });

    describe('createEphemeralTerminal', () => {
        it('should create a simple terminal', () => {
            const terminal = terminalManager.createEphemeralTerminal('Temp Terminal');

            expect(vscode.window.createTerminal).toHaveBeenCalledWith('Temp Terminal');
            expect(terminal).toBe(mockTerminal);
        });
    });

    describe('quotePromptForShell', () => {
        it('should quote for bash/zsh (POSIX)', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test',
                type: 'test',
                template: {
                    systemPrompt: "Test's prompt with 'quotes'"
                }
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            // Check that single quotes are properly escaped
            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining("'"));
        });

        it('should quote for PowerShell on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                configurable: true
            });
            (vscode as any).env.shell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

            const agent = {
                id: 'agent-1',
                name: 'Test',
                type: 'test',
                template: {
                    systemPrompt: 'Test "quoted" prompt'
                }
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            // PowerShell uses double quotes
            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining('"'));

            // Reset platform
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
                configurable: true
            });
        });

        it('should quote for CMD on Windows', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                configurable: true
            });
            (vscode as any).env.shell = 'C:\\Windows\\System32\\cmd.exe';

            const agent = {
                id: 'agent-1',
                name: 'Test',
                type: 'test',
                template: {
                    systemPrompt: 'Test prompt'
                }
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.stringContaining('"'));

            // Reset platform
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
                configurable: true
            });
        });
    });

    describe('terminal close events', () => {
        it('should handle terminal close event', () => {
            terminalManager.createTerminal('agent-1', { name: 'Test' });

            // Simulate terminal close
            if (onDidCloseTerminalCallback) {
                onDidCloseTerminalCallback(mockTerminal);
            }

            expect(terminalManager.getTerminal('agent-1')).toBeUndefined();
            expect(mockEventBus.publish).toHaveBeenCalledWith(
                DOMAIN_EVENTS.TERMINAL_CLOSED,
                expect.objectContaining({ agentId: 'agent-1' })
            );
        });

        it('should fire onTerminalClosed event', () => {
            const listener = jest.fn();
            terminalManager.onTerminalClosed(listener);

            terminalManager.createTerminal('agent-1', { name: 'Test' });

            // Simulate terminal close
            if (onDidCloseTerminalCallback) {
                onDidCloseTerminalCallback(mockTerminal);
            }

            expect(listener).toHaveBeenCalledWith(mockTerminal);
        });

        it('should ignore unknown terminal close', () => {
            const unknownTerminal = { ...mockTerminal } as vscode.Terminal;

            if (onDidCloseTerminalCallback) {
                onDidCloseTerminalCallback(unknownTerminal);
            }

            expect(mockEventBus.publish).not.toHaveBeenCalledWith(DOMAIN_EVENTS.TERMINAL_CLOSED, expect.anything());
        });
    });

    describe('dispose', () => {
        it('should dispose all terminals', () => {
            const terminal1 = { ...mockTerminal, dispose: jest.fn() };
            const terminal2 = { ...mockTerminal, dispose: jest.fn() };

            (vscode.window.createTerminal as jest.Mock).mockReturnValueOnce(terminal1).mockReturnValueOnce(terminal2);

            terminalManager.createTerminal('agent-1', { name: 'Test1' });
            terminalManager.createTerminal('agent-2', { name: 'Test2' });

            terminalManager.dispose();

            expect(terminal1.dispose).toHaveBeenCalled();
            expect(terminal2.dispose).toHaveBeenCalled();
        });

        it('should clear terminals map', () => {
            terminalManager.createTerminal('agent-1', { name: 'Test' });

            terminalManager.dispose();

            expect(terminalManager.getTerminal('agent-1')).toBeUndefined();
        });

        it('should dispose event listeners', () => {
            const mockDisposable = { dispose: jest.fn() };
            (vscode.window.onDidCloseTerminal as jest.Mock).mockReturnValue(mockDisposable);

            const manager = new TerminalManager(mockConfigService);
            manager.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle terminal creation failure', () => {
            (vscode.window.createTerminal as jest.Mock).mockImplementation(() => {
                throw new Error('Failed to create terminal');
            });

            expect(() => terminalManager.createTerminal('agent-1', { name: 'Test' })).toThrow();
        });

        it('should handle very long prompts', async () => {
            const longPrompt = 'a'.repeat(10000);
            const agent = {
                id: 'agent-1',
                name: 'Test',
                type: 'test',
                template: {
                    systemPrompt: longPrompt
                }
            };

            terminalManager.createTerminal('agent-1', agent);

            const promise = terminalManager.initializeAgentTerminal(agent);
            jest.runAllTimers();
            await promise;

            // Should use simplified prompt for complex agents
            expect(mockTerminal.sendText).toHaveBeenCalledWith(expect.not.stringContaining(longPrompt));
        });

        it('should handle special characters in agent names', () => {
            const agentConfig = {
                name: 'Test & Agent <> "Special"',
                type: 'test'
            };

            terminalManager.createTerminal('agent-1', agentConfig);

            expect(vscode.window.createTerminal).toHaveBeenCalledWith(
                expect.objectContaining({
                    env: expect.objectContaining({
                        NOFX_AGENT_NAME: 'Test & Agent <> "Special"'
                    })
                })
            );
        });

        it('should handle concurrent terminal operations', () => {
            const agents = Array.from({ length: 10 }, (_, i) => ({
                id: `agent-${i}`,
                config: { name: `Agent ${i}` }
            }));

            agents.forEach(({ id, config }) => {
                terminalManager.createTerminal(id, config);
            });

            agents.forEach(({ id }) => {
                expect(terminalManager.getTerminal(id)).toBeDefined();
            });

            // Dispose half of them
            agents.slice(0, 5).forEach(({ id }) => {
                terminalManager.disposeTerminal(id);
            });

            // Check state
            agents.slice(0, 5).forEach(({ id }) => {
                expect(terminalManager.getTerminal(id)).toBeUndefined();
            });
            agents.slice(5).forEach(({ id }) => {
                expect(terminalManager.getTerminal(id)).toBeDefined();
            });
        });
    });
});
