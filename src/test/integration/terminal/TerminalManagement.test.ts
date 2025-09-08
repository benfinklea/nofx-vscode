import * as vscode from 'vscode';
import { TerminalManager } from '../../../services/TerminalManager';
import { TerminalMonitor } from '../../../services/TerminalMonitor';
import { TerminalOutputMonitor } from '../../../services/TerminalOutputMonitor';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { Container } from '../../../services/Container';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';

// Mock VS Code Terminal API
class MockTerminal implements Partial<vscode.Terminal> {
    name: string;
    processId: Promise<number | undefined>;
    exitStatus: vscode.TerminalExitStatus | undefined;
    private _isOpen: boolean = false;
    private _onDidWrite = new vscode.EventEmitter<string>();
    private _onDidClose = new vscode.EventEmitter<number | undefined>();
    private _onDidChangeState: vscode.EventEmitter<vscode.Terminal> | undefined;
    private _outputBuffer: string[] = [];

    constructor(name: string, processId: number = 1234) {
        this.name = name;
        this.processId = Promise.resolve(processId);
    }

    sendText(text: string, addNewLine?: boolean): void {
        const output = addNewLine !== false ? `${text}\n` : text;
        this._outputBuffer.push(output);
        this._onDidWrite.fire(output);
    }

    show(preserveFocus?: boolean): void {
        this._isOpen = true;
        if (this._onDidChangeState) {
            this._onDidChangeState.fire(this as any);
        }
    }

    hide(): void {
        this._isOpen = false;
        if (this._onDidChangeState) {
            this._onDidChangeState.fire(this as any);
        }
    }

    dispose(): void {
        this.exitStatus = { code: 0, reason: vscode.TerminalExitReason.Unknown };
        this._onDidClose.fire(0);
        this._onDidWrite.dispose();
        this._onDidClose.dispose();
        if (this._onDidChangeState) {
            this._onDidChangeState.dispose();
        }
    }

    getOutput(): string[] {
        return [...this._outputBuffer];
    }

    clearOutput(): void {
        this._outputBuffer = [];
    }

    simulateOutput(text: string): void {
        this._outputBuffer.push(text);
        this._onDidWrite.fire(text);
    }

    simulateExit(code: number): void {
        this.exitStatus = { code, reason: vscode.TerminalExitReason.Unknown };
        this._onDidClose.fire(code);
    }
}

describe('Terminal Management Integration', () => {
    let container: Container;
    let terminalManager: TerminalManager;
    let terminalMonitor: TerminalMonitor;
    let outputMonitor: TerminalOutputMonitor;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockTerminals: Map<string, MockTerminal>;

    beforeAll(() => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            }
        } as any;

        // Setup container
        container = Container.getInstance();
        eventBus = new EventBus();

        container.registerInstance(Symbol.for('IEventBus'), eventBus);
        // Create mock output channel
        const mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel'
        } as any;

        container.register(
            Symbol.for('IConfigurationService'),
            () =>
                ({
                    get: jest.fn().mockReturnValue(false),
                    getAll: jest.fn().mockReturnValue({}),
                    update: jest.fn(),
                    onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
                    getLogLevel: jest.fn().mockReturnValue('info'),
                    getClaudeInitializationDelay: jest.fn().mockReturnValue(15)
                }) as any,
            'singleton'
        );

        container.register(
            Symbol.for('ILoggingService'),
            c => new LoggingService(c.resolve(Symbol.for('IConfigurationService')), mockChannel),
            'singleton'
        );

        // Mock VS Code window.createTerminal
        mockTerminals = new Map();
        (vscode.window as any).createTerminal = jest.fn((options: vscode.TerminalOptions) => {
            const terminal = new MockTerminal(options.name || 'Terminal');
            mockTerminals.set(options.name || 'Terminal', terminal);
            return terminal;
        });

        // Create services
        terminalManager = new TerminalManager(
            container.resolve(Symbol.for('IConfigurationService')),
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IEventBus'))
        );

        // Create mock TaskToolBridge
        const mockTaskToolBridge = {
            handleToolCall: jest.fn(),
            executeSubAgentTask: jest.fn()
        } as any;

        terminalMonitor = new TerminalMonitor(
            container.resolve(Symbol.for('ILoggingService')),
            container.resolve(Symbol.for('IConfigurationService')),
            mockTaskToolBridge
        );

        outputMonitor = new TerminalOutputMonitor(container.resolve(Symbol.for('IEventBus')));
    });

    afterAll(async () => {
        terminalManager.dispose();
        terminalMonitor.dispose();
        outputMonitor.dispose();
        await container.dispose();
        Container['instance'] = null;
    });

    afterEach(() => {
        // Clean up terminals
        mockTerminals.forEach(terminal => terminal.dispose());
        mockTerminals.clear();
    });

    describe('Terminal Creation and Management', () => {
        it('should create a new terminal', done => {
            const terminalCreatedHandler = (event: any) => {
                expect(event.terminal).toBeDefined();
                expect(event.terminal.name).toBe('Test Terminal');
                eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_CREATED, terminalCreatedHandler);
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_CREATED, terminalCreatedHandler);

            const terminal = terminalManager.createTerminal({
                name: 'Test Terminal',
                env: { NODE_ENV: 'test' }
            });

            expect(terminal).toBeDefined();
        });

        it('should track multiple terminals', () => {
            const terminal1 = terminalManager.createTerminal({ name: 'Terminal 1' });
            const terminal2 = terminalManager.createTerminal({ name: 'Terminal 2' });
            const terminal3 = terminalManager.createTerminal({ name: 'Terminal 3' });

            const activeTerminals = terminalManager.getActiveTerminals();
            expect(activeTerminals.length).toBe(3);
            expect(activeTerminals.map(t => t.name)).toContain('Terminal 1');
            expect(activeTerminals.map(t => t.name)).toContain('Terminal 2');
            expect(activeTerminals.map(t => t.name)).toContain('Terminal 3');
        });

        it('should find terminal by name', () => {
            terminalManager.createTerminal({ name: 'Unique Terminal' });

            const found = terminalManager.findTerminalByName('Unique Terminal');
            expect(found).toBeDefined();
            expect(found?.name).toBe('Unique Terminal');

            const notFound = terminalManager.findTerminalByName('Non-existent');
            expect(notFound).toBeUndefined();
        });

        it('should dispose terminal', done => {
            const terminal = terminalManager.createTerminal({ name: 'Disposable Terminal' });

            const disposalHandler = (event: any) => {
                expect(event.terminal.name).toBe('Disposable Terminal');
                expect(event.exitCode).toBe(0);
                eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_CLOSED, disposalHandler);
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_CLOSED, disposalHandler);

            terminalManager.disposeTerminal(terminal);
        });
    });

    describe('Terminal Output Monitoring', () => {
        it('should capture terminal output', done => {
            const terminal = terminalManager.createTerminal({ name: 'Output Terminal' });
            const mockTerminal = mockTerminals.get('Output Terminal')!;

            terminalMonitor.startMonitoring(terminal);

            const outputHandler = (event: any) => {
                if (event.terminal.name === 'Output Terminal' && event.data.includes('Hello World')) {
                    expect(event.data).toBe('Hello World\n');
                    eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_OUTPUT, outputHandler);
                    terminalMonitor.stopMonitoring(terminal);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_OUTPUT, outputHandler);

            // Simulate terminal output
            mockTerminal.simulateOutput('Hello World\n');
        });

        it('should buffer and process output', done => {
            const terminal = terminalManager.createTerminal({ name: 'Buffer Terminal' });
            const mockTerminal = mockTerminals.get('Buffer Terminal')!;

            outputMonitor.startMonitoring(terminal);

            let outputCount = 0;
            const expectedOutputs = ['Line 1\n', 'Line 2\n', 'Line 3\n'];

            const outputHandler = (event: any) => {
                if (event.terminal.name === 'Buffer Terminal') {
                    expect(event.data).toBe(expectedOutputs[outputCount]);
                    outputCount++;

                    if (outputCount === 3) {
                        eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_OUTPUT, outputHandler);
                        outputMonitor.stopMonitoring(terminal);
                        done();
                    }
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_OUTPUT, outputHandler);

            // Simulate multiple outputs
            expectedOutputs.forEach(output => {
                mockTerminal.simulateOutput(output);
            });
        });

        it('should handle command execution tracking', done => {
            const terminal = terminalManager.createTerminal({ name: 'Command Terminal' });
            const mockTerminal = mockTerminals.get('Command Terminal')!;

            terminalMonitor.startMonitoring(terminal);

            const commandHandler = (event: any) => {
                if (event.command === 'npm install') {
                    expect(event.terminal.name).toBe('Command Terminal');
                    eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_COMMAND, commandHandler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_COMMAND, commandHandler);

            // Send a command
            terminal.sendText('npm install');
        });
    });

    describe('Terminal State Management', () => {
        it('should track terminal state changes', done => {
            const terminal = terminalManager.createTerminal({ name: 'State Terminal' });

            let stateChanges = 0;
            const stateHandler = (event: any) => {
                if (event.terminal.name === 'State Terminal') {
                    stateChanges++;

                    if (stateChanges === 1) {
                        expect(event.state).toBe('active');
                    } else if (stateChanges === 2) {
                        expect(event.state).toBe('hidden');
                        eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_STATE_CHANGED, stateHandler);
                        done();
                    }
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_STATE_CHANGED, stateHandler);

            // Show terminal
            terminal.show();

            // Hide terminal after a delay
            setTimeout(() => {
                terminal.hide();
            }, 100);
        });

        it('should handle terminal exit codes', done => {
            const terminal = terminalManager.createTerminal({ name: 'Exit Terminal' });
            const mockTerminal = mockTerminals.get('Exit Terminal')!;

            const exitHandler = (event: any) => {
                expect(event.terminal.name).toBe('Exit Terminal');
                expect(event.exitCode).toBe(1);
                expect(event.exitStatus).toBe('error');
                eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_CLOSED, exitHandler);
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_CLOSED, exitHandler);

            // Simulate terminal exit with error
            mockTerminal.simulateExit(1);
        });

        it('should track terminal activity', done => {
            const terminal = terminalManager.createTerminal({ name: 'Activity Terminal' });
            const mockTerminal = mockTerminals.get('Activity Terminal')!;

            terminalMonitor.startMonitoring(terminal);

            let lastActivity: number = 0;

            const activityHandler = (event: any) => {
                if (event.terminal.name === 'Activity Terminal') {
                    expect(event.timestamp).toBeGreaterThan(lastActivity);
                    lastActivity = event.timestamp;

                    if (event.activityType === 'output') {
                        eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_ACTIVITY, activityHandler);
                        done();
                    }
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_ACTIVITY, activityHandler);

            // Generate activity
            terminal.sendText('echo "activity"');
            mockTerminal.simulateOutput('activity\n');
        });
    });

    describe('Agent Terminal Integration', () => {
        it('should create agent-specific terminal', done => {
            const agentId = 'agent-123';
            const agentTerminal = terminalManager.createAgentTerminal(agentId, {
                name: `Agent ${agentId}`,
                env: {
                    AGENT_ID: agentId,
                    AGENT_ROLE: 'frontend-specialist'
                }
            });

            expect(agentTerminal).toBeDefined();
            expect(agentTerminal.name).toBe(`Agent ${agentId}`);

            const agentTerminalHandler = (event: any) => {
                expect(event.agentId).toBe(agentId);
                expect(event.terminal).toBeDefined();
                eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_TERMINAL_CREATED, agentTerminalHandler);
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_TERMINAL_CREATED, agentTerminalHandler);
        });

        it('should execute commands in agent terminal', done => {
            const agentId = 'agent-456';
            const agentTerminal = terminalManager.createAgentTerminal(agentId, {
                name: `Agent ${agentId}`
            });

            const mockTerminal = mockTerminals.get(`Agent ${agentId}`)!;
            terminalMonitor.startMonitoring(agentTerminal);

            const outputHandler = (event: any) => {
                if (event.data.includes('Task completed')) {
                    expect(event.agentId).toBe(agentId);
                    eventBus.unsubscribe(DOMAIN_EVENTS.AGENT_TERMINAL_OUTPUT, outputHandler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.AGENT_TERMINAL_OUTPUT, outputHandler);

            // Execute command
            agentTerminal.sendText('echo "Task completed"');
            mockTerminal.simulateOutput('Task completed\n');
        });

        it('should handle multiple agent terminals', () => {
            const agents = ['agent-1', 'agent-2', 'agent-3'];
            const terminals = agents.map(id => terminalManager.createAgentTerminal(id, { name: `Agent ${id}` }));

            expect(terminals.length).toBe(3);

            // Find specific agent terminal
            const agent2Terminal = terminalManager.findAgentTerminal('agent-2');
            expect(agent2Terminal).toBeDefined();
            expect(agent2Terminal?.name).toBe('Agent agent-2');
        });
    });

    describe('Terminal Error Handling', () => {
        it('should handle terminal creation failure', done => {
            // Mock creation failure
            const originalCreate = (vscode.window as any).createTerminal;
            (vscode.window as any).createTerminal = jest.fn(() => {
                throw new Error('Failed to create terminal');
            });

            const errorHandler = (event: any) => {
                expect(event.error).toBeDefined();
                expect(event.error.message).toContain('Failed to create terminal');
                eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_ERROR, errorHandler);

                // Restore original
                (vscode.window as any).createTerminal = originalCreate;
                done();
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_ERROR, errorHandler);

            try {
                terminalManager.createTerminal({ name: 'Error Terminal' });
            } catch (error) {
                // Expected to throw
            }
        });

        it('should handle terminal command failure', done => {
            const terminal = terminalManager.createTerminal({ name: 'Command Error Terminal' });
            const mockTerminal = mockTerminals.get('Command Error Terminal')!;

            terminalMonitor.startMonitoring(terminal);

            const errorHandler = (event: any) => {
                if (event.data.includes('command not found')) {
                    expect(event.terminal.name).toBe('Command Error Terminal');
                    expect(event.isError).toBe(true);
                    eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_ERROR_OUTPUT, errorHandler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_ERROR_OUTPUT, errorHandler);

            // Execute invalid command
            terminal.sendText('invalidcommand123');
            mockTerminal.simulateOutput('bash: invalidcommand123: command not found\n');
        });

        it('should recover from terminal crash', done => {
            const terminal = terminalManager.createTerminal({ name: 'Crash Terminal' });
            const mockTerminal = mockTerminals.get('Crash Terminal')!;

            let recreated = false;

            const crashHandler = (event: any) => {
                if (event.terminal.name === 'Crash Terminal' && !recreated) {
                    recreated = true;

                    // Recreate terminal
                    const newTerminal = terminalManager.createTerminal({
                        name: 'Crash Terminal (Recovered)'
                    });

                    expect(newTerminal).toBeDefined();
                    eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_CRASHED, crashHandler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_CRASHED, crashHandler);

            // Simulate crash
            mockTerminal.simulateExit(-1);
        });
    });

    describe('Terminal Performance', () => {
        it('should handle high-frequency output', done => {
            const terminal = terminalManager.createTerminal({ name: 'Performance Terminal' });
            const mockTerminal = mockTerminals.get('Performance Terminal')!;

            outputMonitor.startMonitoring(terminal);

            const outputCount = 100;
            let receivedCount = 0;

            const outputHandler = (event: any) => {
                if (event.terminal.name === 'Performance Terminal') {
                    receivedCount++;

                    if (receivedCount === outputCount) {
                        eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_OUTPUT, outputHandler);
                        outputMonitor.stopMonitoring(terminal);
                        done();
                    }
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_OUTPUT, outputHandler);

            // Generate rapid output
            for (let i = 0; i < outputCount; i++) {
                mockTerminal.simulateOutput(`Line ${i}\n`);
            }
        });

        it('should handle concurrent terminal operations', done => {
            const terminalCount = 10;
            const terminals: vscode.Terminal[] = [];

            for (let i = 0; i < terminalCount; i++) {
                terminals.push(
                    terminalManager.createTerminal({
                        name: `Concurrent Terminal ${i}`
                    })
                );
            }

            let commandsExecuted = 0;

            const commandHandler = (event: any) => {
                commandsExecuted++;

                if (commandsExecuted === terminalCount) {
                    eventBus.unsubscribe(DOMAIN_EVENTS.TERMINAL_COMMAND, commandHandler);

                    // Verify all terminals are tracked
                    expect(terminalManager.getActiveTerminals().length).toBeGreaterThanOrEqual(terminalCount);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.TERMINAL_COMMAND, commandHandler);

            // Execute commands concurrently
            terminals.forEach((terminal, index) => {
                terminal.sendText(`echo "Command ${index}"`);
            });
        });

        it('should efficiently clean up disposed terminals', () => {
            // Create many terminals
            const terminals: vscode.Terminal[] = [];
            for (let i = 0; i < 20; i++) {
                terminals.push(
                    terminalManager.createTerminal({
                        name: `Cleanup Terminal ${i}`
                    })
                );
            }

            expect(terminalManager.getActiveTerminals().length).toBe(20);

            // Dispose half of them
            for (let i = 0; i < 10; i++) {
                terminalManager.disposeTerminal(terminals[i]);
            }

            // Should only have 10 active
            expect(terminalManager.getActiveTerminals().length).toBe(10);

            // Dispose the rest
            for (let i = 10; i < 20; i++) {
                terminalManager.disposeTerminal(terminals[i]);
            }

            // Should have none
            expect(terminalManager.getActiveTerminals().length).toBe(0);
        });
    });
});
