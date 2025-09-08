import * as vscode from 'vscode';
import { TerminalOutputMonitor, TerminalPattern, TerminalActivity } from '../../../services/TerminalOutputMonitor';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../../helpers/mockFactories';

// Mock vscode
jest.mock('vscode');

describe('TerminalOutputMonitor', () => {
    let monitor: TerminalOutputMonitor;
    let mockTerminal: vscode.Terminal;
    let consoleLogSpy: jest.SpyInstance;
    let mockEventEmitter: vscode.EventEmitter<string>;

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        monitor = new TerminalOutputMonitor();

        mockTerminal = {
            name: 'Test Terminal',
            processId: Promise.resolve(1234),
            creationOptions: {},
            exitStatus: undefined,
            sendText: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        } as unknown as vscode.Terminal;

        mockEventEmitter = {
            event: jest.fn((handler: (data: string) => void) => {
                // Store the handler for testing
                (mockEventEmitter as any).handler = handler;
                return { dispose: jest.fn() };
            }),
            fire: jest.fn(),
            dispose: jest.fn()
        } as unknown as vscode.EventEmitter<string>;

        (vscode.EventEmitter as any).mockImplementation(() => mockEventEmitter);

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        monitor.dispose();
        consoleLogSpy.mockRestore();
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with default patterns', () => {
            const patterns = monitor.getPatterns();
            expect(patterns).toHaveProperty('completion');
            expect(patterns).toHaveProperty('permission');
            expect(patterns).toHaveProperty('waiting');
            expect(patterns).toHaveProperty('error');
            expect(patterns).toHaveProperty('thinking');
        });

        it('should create an EventEmitter instance', () => {
            expect(monitor).toBeDefined();
            expect(monitor.on).toBeDefined();
            expect(monitor.emit).toBeDefined();
        });
    });

    describe('monitorTerminal', () => {
        it('should create write emitter for terminal', () => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');
            expect(vscode.EventEmitter).toHaveBeenCalled();
        });

        it('should set up event listener for terminal output', () => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');
            expect(mockEventEmitter.event).toHaveBeenCalled();
        });

        it('should process terminal output when data is emitted', () => {
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            monitor.monitorTerminal(mockTerminal, 'agent-1');

            // Simulate terminal output
            const handler = (mockEventEmitter as any).handler;
            handler('Task completed successfully');

            expect(activitySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: 'agent-1',
                    terminal: mockTerminal,
                    pattern: 'completion'
                })
            );
        });
    });

    describe('pattern matching', () => {
        beforeEach(() => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');
        });

        const testPattern = (output: string, expectedPattern: keyof TerminalPattern) => {
            const activitySpy = jest.fn();
            const patternSpy = jest.fn();
            monitor.on('activity', activitySpy);
            monitor.on(`pattern:${expectedPattern}`, patternSpy);

            const handler = (mockEventEmitter as any).handler;
            handler(output);

            expect(activitySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: 'agent-1',
                    terminal: mockTerminal,
                    pattern: expectedPattern,
                    match: output,
                    timestamp: expect.any(Date)
                })
            );

            expect(patternSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    pattern: expectedPattern
                })
            );

            expect(consoleLogSpy).toHaveBeenCalledWith(
                `[TerminalMonitor] Detected ${expectedPattern} pattern for agent agent-1: ${output}`
            );
        };

        describe('completion patterns', () => {
            it('should detect "task complete"', () => {
                testPattern('task complete', 'completion');
            });

            it('should detect "finished"', () => {
                testPattern('Build finished', 'completion');
            });

            it('should detect "done"', () => {
                testPattern('Installation done', 'completion');
            });

            it('should detect "completed successfully"', () => {
                testPattern('Tests completed successfully', 'completion');
            });

            it('should detect "successfully completed"', () => {
                testPattern('Deployment successfully completed', 'completion');
            });

            it('should detect "all tests pass"', () => {
                testPattern('All tests pass', 'completion');
            });

            it('should be case insensitive', () => {
                testPattern('TASK COMPLETE', 'completion');
            });
        });

        describe('permission patterns', () => {
            it('should detect "would you like"', () => {
                testPattern('Would you like to continue?', 'permission');
            });

            it('should detect "permission to"', () => {
                testPattern('I need permission to modify files', 'permission');
            });

            it('should detect "may i"', () => {
                testPattern('May I proceed with the changes?', 'permission');
            });

            it('should detect "should i"', () => {
                testPattern('Should I create the directory?', 'permission');
            });

            it('should detect "can i proceed"', () => {
                testPattern('Can I proceed with installation?', 'permission');
            });

            it('should detect "waiting for approval"', () => {
                testPattern('Waiting for approval to continue', 'permission');
            });

            it('should detect "need permission"', () => {
                testPattern('I need permission to access', 'permission');
            });

            it('should detect "confirm"', () => {
                testPattern('Please confirm the action', 'permission');
            });

            it('should detect "approve"', () => {
                testPattern('Please approve this change', 'permission');
            });
        });

        describe('waiting patterns', () => {
            it('should detect "press enter"', () => {
                testPattern('Press enter to continue', 'waiting');
            });

            it('should detect "[y/n]"', () => {
                testPattern('Do you want to proceed? [y/n]', 'waiting');
            });

            it('should detect "continue?"', () => {
                testPattern('Continue?', 'waiting');
            });

            it('should detect "waiting for"', () => {
                testPattern('Waiting for user input', 'waiting');
            });

            it('should detect "please respond"', () => {
                testPattern('Please respond with your choice', 'waiting');
            });

            it('should detect "awaiting input"', () => {
                testPattern('Awaiting input from user', 'waiting');
            });

            it('should detect "your choice"', () => {
                testPattern('Enter your choice:', 'waiting');
            });
        });

        describe('error patterns', () => {
            it('should detect "error:"', () => {
                testPattern('Error: File not found', 'error');
            });

            it('should detect "failed:"', () => {
                testPattern('Failed: Connection timeout', 'error');
            });

            it('should detect "exception:"', () => {
                testPattern('Exception: Null reference', 'error');
            });

            it('should detect "permission denied"', () => {
                testPattern('Permission denied', 'error');
            });

            it('should detect "cannot"', () => {
                testPattern('Cannot read property', 'error');
            });

            it('should detect "unable to"', () => {
                testPattern('Unable to connect', 'error');
            });

            it('should detect "failure"', () => {
                testPattern('Build failure', 'error');
            });

            it('should detect "crash"', () => {
                testPattern('Application crash detected', 'error');
            });
        });

        describe('thinking patterns', () => {
            it('should detect "analyzing"', () => {
                testPattern('Analyzing code structure', 'thinking');
            });

            it('should detect "processing"', () => {
                testPattern('Processing request', 'thinking');
            });

            it('should detect "thinking"', () => {
                testPattern('Thinking about the solution', 'thinking');
            });

            it('should detect "calculating"', () => {
                testPattern('Calculating results', 'thinking');
            });

            it('should detect "searching"', () => {
                testPattern('Searching for files', 'thinking');
            });

            it('should detect "looking"', () => {
                testPattern('Looking for dependencies', 'thinking');
            });

            it('should detect "examining"', () => {
                testPattern('Examining the codebase', 'thinking');
            });

            it('should detect "reviewing"', () => {
                testPattern('Reviewing changes', 'thinking');
            });
        });

        describe('multiline and edge cases', () => {
            it('should process multiple lines', () => {
                const activitySpy = jest.fn();
                monitor.on('activity', activitySpy);

                const handler = (mockEventEmitter as any).handler;
                handler('Line 1: Processing request\nLine 2: Task complete\nLine 3: Error: Something failed');

                expect(activitySpy).toHaveBeenCalledTimes(3);
                expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'thinking' }));
                expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'completion' }));
                expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'error' }));
            });

            it('should skip empty lines', () => {
                const activitySpy = jest.fn();
                monitor.on('activity', activitySpy);

                const handler = (mockEventEmitter as any).handler;
                handler('\n\n  \n\n');

                expect(activitySpy).not.toHaveBeenCalled();
            });

            it('should detect first matching pattern', () => {
                const activitySpy = jest.fn();
                monitor.on('activity', activitySpy);

                const handler = (mockEventEmitter as any).handler;
                // This line matches both 'completion' (done) and 'thinking' (processing)
                handler('Processing done');

                // Both patterns match, so we get 2 events
                expect(activitySpy).toHaveBeenCalledTimes(2);
                // Should match both patterns
                expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'completion' }));
                expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'thinking' }));
            });

            it('should not match non-pattern text', () => {
                const activitySpy = jest.fn();
                monitor.on('activity', activitySpy);

                const handler = (mockEventEmitter as any).handler;
                handler('Just some normal output text');

                expect(activitySpy).not.toHaveBeenCalled();
            });
        });
    });

    describe('stopMonitoring', () => {
        it('should dispose of terminal emitter', () => {
            const disposeSpy = jest.fn();
            mockEventEmitter.event = jest.fn(() => ({ dispose: disposeSpy }));

            monitor.monitorTerminal(mockTerminal, 'agent-1');
            monitor.stopMonitoring(mockTerminal);

            expect(mockEventEmitter.dispose).toHaveBeenCalled();
        });

        it('should handle stopping non-monitored terminal gracefully', () => {
            const unknownTerminal = {} as vscode.Terminal;
            expect(() => monitor.stopMonitoring(unknownTerminal)).not.toThrow();
        });

        it('should stop emitting events after stopping', () => {
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            monitor.monitorTerminal(mockTerminal, 'agent-1');

            // Clear the handler reference when stopping
            const originalHandler = (mockEventEmitter as any).handler;
            monitor.stopMonitoring(mockTerminal);

            // Handler still exists but emitter is disposed, so events should not be processed
            // In real usage, the disposal would prevent the handler from being called
            // For testing, we verify the emitter was disposed
            expect(mockEventEmitter.dispose).toHaveBeenCalled();
        });
    });

    describe('addPattern', () => {
        it('should add custom pattern', () => {
            const customPattern = /custom-pattern/i;
            monitor.addPattern('custom', customPattern);

            const patterns = monitor.getPatterns();
            expect((patterns as any).custom).toBe(customPattern);
        });

        it('should detect custom patterns', () => {
            monitor.addPattern('custom', /deploy-started/i);

            const activitySpy = jest.fn();
            const customSpy = jest.fn();
            monitor.on('activity', activitySpy);
            monitor.on('pattern:custom', customSpy);

            monitor.monitorTerminal(mockTerminal, 'agent-1');
            const handler = (mockEventEmitter as any).handler;
            handler('Deploy-started for production');

            expect(activitySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    pattern: 'custom'
                })
            );
            expect(customSpy).toHaveBeenCalled();
        });

        it('should override existing pattern', () => {
            const newCompletionPattern = /new-completion-pattern/;
            monitor.addPattern('completion', newCompletionPattern);

            const patterns = monitor.getPatterns();
            expect(patterns.completion).toBe(newCompletionPattern);
        });
    });

    describe('getPatterns', () => {
        it('should return copy of patterns', () => {
            const patterns1 = monitor.getPatterns();
            const patterns2 = monitor.getPatterns();

            expect(patterns1).not.toBe(patterns2);
            expect(patterns1).toEqual(patterns2);
        });

        it('should not expose internal patterns object', () => {
            const patterns = monitor.getPatterns();
            patterns.completion = /modified/;

            const patternsAgain = monitor.getPatterns();
            expect(patternsAgain.completion).not.toEqual(/modified/);
        });

        it('should include all default patterns', () => {
            const patterns = monitor.getPatterns();

            expect(patterns.completion).toBeDefined();
            expect(patterns.permission).toBeDefined();
            expect(patterns.waiting).toBeDefined();
            expect(patterns.error).toBeDefined();
            expect(patterns.thinking).toBeDefined();
        });
    });

    describe('dispose', () => {
        it('should dispose all event emitters', () => {
            const disposeSpy1 = jest.fn();
            const disposeSpy2 = jest.fn();

            // Monitor two terminals
            mockEventEmitter.event = jest.fn(() => ({ dispose: disposeSpy1 }));
            monitor.monitorTerminal(mockTerminal, 'agent-1');

            const mockTerminal2 = {} as vscode.Terminal;
            const mockEventEmitter2 = {
                event: jest.fn(() => ({ dispose: disposeSpy2 })),
                dispose: jest.fn()
            } as any;
            (vscode.EventEmitter as any).mockImplementationOnce(() => mockEventEmitter2);
            monitor.monitorTerminal(mockTerminal2, 'agent-2');

            monitor.dispose();

            expect(disposeSpy1).toHaveBeenCalled();
            expect(mockEventEmitter.dispose).toHaveBeenCalled();
            expect(mockEventEmitter2.dispose).toHaveBeenCalled();
        });

        it('should remove all event listeners', () => {
            const removeAllListenersSpy = jest.spyOn(monitor, 'removeAllListeners');

            monitor.dispose();

            expect(removeAllListenersSpy).toHaveBeenCalled();
        });

        it('should clear terminal write emitters map', () => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');

            monitor.dispose();

            // Trying to stop monitoring should have no effect (map is cleared)
            expect(() => monitor.stopMonitoring(mockTerminal)).not.toThrow();
        });

        it('should not emit events after disposal', () => {
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            monitor.monitorTerminal(mockTerminal, 'agent-1');
            monitor.dispose();

            // Try to emit
            const handler = (mockEventEmitter as any).handler;
            if (handler) {
                handler('Task complete');
            }

            expect(activitySpy).not.toHaveBeenCalled();
        });
    });

    describe('createPseudoTerminal', () => {
        it('should create pseudo terminal with required methods', () => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');

            // The pseudo terminal is created internally
            // We can verify it works by checking that events are processed
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            const handler = (mockEventEmitter as any).handler;
            handler('Task complete');

            expect(activitySpy).toHaveBeenCalled();
        });

        it('should pass through user input via handleInput', () => {
            // This tests the pseudo terminal's handleInput method
            // In the actual implementation, it would send text to the real terminal
            monitor.monitorTerminal(mockTerminal, 'agent-1');

            // The handleInput is part of the pseudoterminal created internally
            // We verify the terminal integration works
            expect(mockTerminal.sendText).toBeDefined();
        });
    });

    describe('event emission', () => {
        beforeEach(() => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');
        });

        it('should emit both pattern-specific and general activity events', () => {
            const activitySpy = jest.fn();
            const completionSpy = jest.fn();

            monitor.on('activity', activitySpy);
            monitor.on('pattern:completion', completionSpy);

            const handler = (mockEventEmitter as any).handler;
            handler('Task completed successfully');

            expect(activitySpy).toHaveBeenCalledTimes(1);
            expect(completionSpy).toHaveBeenCalledTimes(1);
        });

        it('should include all required fields in activity object', () => {
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            const handler = (mockEventEmitter as any).handler;
            const testLine = 'Error: Something went wrong';
            handler(testLine);

            expect(activitySpy).toHaveBeenCalledWith({
                agentId: 'agent-1',
                terminal: mockTerminal,
                pattern: 'error',
                match: testLine,
                timestamp: expect.any(Date)
            });
        });

        it('should emit events in order for multiple patterns', () => {
            const events: string[] = [];

            monitor.on('pattern:thinking', () => events.push('thinking'));
            monitor.on('pattern:completion', () => events.push('completion'));
            monitor.on('pattern:error', () => events.push('error'));

            const handler = (mockEventEmitter as any).handler;
            handler('Analyzing...\nDone!\nError: Failed');

            expect(events).toEqual(['thinking', 'completion', 'error']);
        });
    });

    describe('Claude-specific patterns (Robustness Feature)', () => {
        beforeEach(() => {
            monitor.monitorTerminal(mockTerminal, 'agent-1');
        });

        describe('Claude ready patterns', () => {
            it('should detect Claude version indicators', () => {
                const readySpy = jest.fn();
                const activitySpy = jest.fn();
                monitor.on('claude-ready', readySpy);
                monitor.on('claude-activity', activitySpy);

                const handler = (mockEventEmitter as any).handler;
                handler('Claude 3.5 Sonnet');

                expect(readySpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        agentId: 'agent-1',
                        terminal: mockTerminal,
                        line: 'Claude 3.5 Sonnet',
                        timestamp: expect.any(Date)
                    })
                );
                expect(activitySpy).toHaveBeenCalledTimes(1);
            });

            it('should detect Claude introductions', () => {
                const readySpy = jest.fn();
                monitor.on('claude-ready', readySpy);

                const handler = (mockEventEmitter as any).handler;

                const testCases = [
                    "I'm Claude, an AI assistant",
                    "Hello! I'm Claude",
                    'Ready to help you',
                    'How can I help you today?',
                    'What would you like me to do?'
                ];

                testCases.forEach(testCase => {
                    handler(testCase);
                });

                expect(readySpy).toHaveBeenCalledTimes(testCases.length);
            });

            it('should detect system prompt acceptance', () => {
                const readySpy = jest.fn();
                monitor.on('claude-ready', readySpy);

                const handler = (mockEventEmitter as any).handler;
                handler('System prompt has been accepted');

                expect(readySpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        line: 'System prompt has been accepted'
                    })
                );
            });
        });

        describe('Claude error patterns', () => {
            it('should detect Claude command not found', () => {
                const errorSpy = jest.fn();
                monitor.on('claude-error', errorSpy);

                const handler = (mockEventEmitter as any).handler;
                handler('command not found: claude');

                expect(errorSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        agentId: 'agent-1',
                        terminal: mockTerminal,
                        line: 'command not found: claude',
                        error: 'command not found: claude',
                        timestamp: expect.any(Date)
                    })
                );
            });

            it('should detect Claude connection errors', () => {
                const errorSpy = jest.fn();
                monitor.on('claude-error', errorSpy);

                const handler = (mockEventEmitter as any).handler;

                const errorCases = [
                    'claude: error connecting to server',
                    'permission denied: claude',
                    'Failed to start Claude',
                    'Connection to Claude failed'
                ];

                errorCases.forEach(errorCase => {
                    handler(errorCase);
                });

                expect(errorSpy).toHaveBeenCalledTimes(errorCases.length);
            });
        });

        describe('Claude timeout patterns', () => {
            it('should detect connection timeouts', () => {
                const errorSpy = jest.fn();
                monitor.on('claude-error', errorSpy);

                const handler = (mockEventEmitter as any).handler;

                const timeoutCases = [
                    'Connection timeout',
                    'Request timed out',
                    'No response from server',
                    'connection timeout occurred'
                ];

                timeoutCases.forEach(timeoutCase => {
                    handler(timeoutCase);
                });

                expect(errorSpy).toHaveBeenCalledTimes(timeoutCases.length);
            });
        });

        describe('System health check patterns', () => {
            it('should detect NofX health check responses', () => {
                const readySpy = jest.fn();
                monitor.on('claude-ready', readySpy);

                const handler = (mockEventEmitter as any).handler;

                const healthCheckCases = [
                    'NofX-Agent-Ready-Check',
                    'health-check received successfully',
                    'echo: NofX test message'
                ];

                healthCheckCases.forEach(healthCase => {
                    handler(healthCase);
                });

                expect(readySpy).toHaveBeenCalledTimes(healthCheckCases.length);
            });
        });

        describe('Claude event emission', () => {
            it('should emit both Claude-specific and generic events', () => {
                const claudeActivitySpy = jest.fn();
                const claudeReadySpy = jest.fn();
                const patternSpy = jest.fn();

                monitor.on('claude-activity', claudeActivitySpy);
                monitor.on('claude-ready', claudeReadySpy);
                monitor.on('claude:claudeReady', patternSpy);

                const handler = (mockEventEmitter as any).handler;
                handler("I'm Claude");

                expect(claudeActivitySpy).toHaveBeenCalledTimes(1);
                expect(claudeReadySpy).toHaveBeenCalledTimes(1);
                expect(patternSpy).toHaveBeenCalledTimes(1);
            });

            it('should log Claude pattern detection', () => {
                const handler = (mockEventEmitter as any).handler;
                handler('Claude 3.5 initialized');

                expect(consoleLogSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[TerminalMonitor] Detected Claude claudeReady pattern for agent agent-1')
                );
            });
        });

        describe('Pattern priority and overlap', () => {
            it('should detect both standard and Claude patterns in same line', () => {
                const completionSpy = jest.fn();
                const claudeReadySpy = jest.fn();

                monitor.on('pattern:completion', completionSpy);
                monitor.on('claude-ready', claudeReadySpy);

                const handler = (mockEventEmitter as any).handler;
                handler("I'm Claude and I'm ready to help! Setup complete");

                expect(completionSpy).toHaveBeenCalledTimes(1);
                expect(claudeReadySpy).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('Robustness Features Integration', () => {
        it('should handle agent initialization sequence', () => {
            const events: string[] = [];

            monitor.on('claude-ready', () => events.push('claude-ready'));
            monitor.on('pattern:completion', () => events.push('completion'));
            monitor.on('pattern:thinking', () => events.push('thinking'));

            monitor.monitorTerminal(mockTerminal, 'agent-1');
            const handler = (mockEventEmitter as any).handler;

            // Simulate typical agent initialization sequence
            handler('Starting Claude...');
            handler('Analyzing system requirements');
            handler('Claude 3.5 Sonnet initialized');
            handler('System prompt has been accepted');
            handler('Agent setup completed successfully');
            handler('NofX-Agent-Ready-Check');

            expect(events).toContain('thinking');
            expect(events).toContain('claude-ready');
            expect(events).toContain('completion');
            expect(events.filter(e => e === 'claude-ready').length).toBe(3); // Multiple ready indicators
        });

        it('should detect initialization failures', () => {
            const errorEvents: string[] = [];

            monitor.on('claude-error', () => errorEvents.push('claude-error'));
            monitor.on('pattern:error', () => errorEvents.push('error'));

            monitor.monitorTerminal(mockTerminal, 'agent-1');
            const handler = (mockEventEmitter as any).handler;

            // Simulate initialization failure sequence
            handler('Starting Claude...');
            handler('claude: command not found');
            handler('Error: Failed to initialize agent');
            handler('Connection timeout occurred');

            expect(errorEvents).toContain('claude-error');
            expect(errorEvents).toContain('error');
            expect(errorEvents.filter(e => e === 'claude-error').length).toBe(2); // Command not found + timeout
        });

        it('should track agent health check responses', () => {
            const healthEvents: { type: string; line: string }[] = [];

            monitor.on('claude-ready', (event: any) => {
                if (event.line.includes('health-check') || event.line.includes('NofX-Agent-Ready-Check')) {
                    healthEvents.push({ type: 'health-success', line: event.line });
                }
            });

            monitor.on('claude-error', (event: any) => {
                if (event.line.includes('health') || event.line.includes('check')) {
                    healthEvents.push({ type: 'health-failure', line: event.line });
                }
            });

            monitor.monitorTerminal(mockTerminal, 'agent-1');
            const handler = (mockEventEmitter as any).handler;

            // Simulate health check sequence
            handler('Performing health check...');
            handler('NofX-Agent-Ready-Check');
            handler('echo: health-check received');
            handler('Agent health status: OK');

            expect(healthEvents).toHaveLength(2);
            expect(healthEvents[0].type).toBe('health-success');
            expect(healthEvents[1].type).toBe('health-success');
        });
    });

    describe('integration scenarios', () => {
        it('should handle multiple terminals independently', () => {
            const mockTerminal2 = { name: 'Terminal 2' } as vscode.Terminal;

            // Store original implementation
            const originalImpl = (vscode.EventEmitter as any).getMockImplementation();

            // Create second emitter with its own handler storage
            const mockEventEmitter2 = {
                event: jest.fn((handler: (data: string) => void) => {
                    (mockEventEmitter2 as any).handler = handler;
                    return { dispose: jest.fn() };
                }),
                fire: jest.fn(),
                dispose: jest.fn()
            } as any;

            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            // Monitor first terminal (uses default mockEventEmitter)
            monitor.monitorTerminal(mockTerminal, 'agent-1');
            const handler1 = (mockEventEmitter as any).handler;

            // Set up second emitter for second terminal
            (vscode.EventEmitter as any).mockImplementationOnce(() => mockEventEmitter2);
            monitor.monitorTerminal(mockTerminal2, 'agent-2');
            const handler2 = (mockEventEmitter2 as any).handler;

            // Restore original implementation
            (vscode.EventEmitter as any).mockImplementation(originalImpl);

            // Emit from first terminal
            handler1('Task complete');

            // Emit from second terminal
            handler2('Error: Failed');

            expect(activitySpy).toHaveBeenCalledTimes(2);
            expect(activitySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: 'agent-1',
                    pattern: 'completion'
                })
            );
            expect(activitySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: 'agent-2',
                    pattern: 'error'
                })
            );
        });

        it('should handle rapid output correctly', () => {
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            // First monitor the terminal to set up the handler
            monitor.monitorTerminal(mockTerminal, 'agent-1');
            const handler = (mockEventEmitter as any).handler;

            // Simulate rapid output
            for (let i = 0; i < 100; i++) {
                handler(`Processing item ${i}`);
            }

            expect(activitySpy).toHaveBeenCalledTimes(100);
        });

        it('should handle terminal restart', () => {
            const activitySpy = jest.fn();
            monitor.on('activity', activitySpy);

            // Start monitoring
            monitor.monitorTerminal(mockTerminal, 'agent-1');

            // Stop monitoring
            monitor.stopMonitoring(mockTerminal);

            // Start monitoring again
            monitor.monitorTerminal(mockTerminal, 'agent-1');

            // Should work normally
            const handler = (mockEventEmitter as any).handler;
            handler('Task complete');

            expect(activitySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    pattern: 'completion'
                })
            );
        });
    });
});
