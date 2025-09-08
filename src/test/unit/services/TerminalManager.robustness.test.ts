import { TerminalManager } from '../../../services/TerminalManager';
import { IConfigurationService, ILoggingService, IEventBus, IErrorHandler } from '../../../services/interfaces';
import { AIProviderResolver } from '../../../services/AIProviderResolver';
import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode');

// Mock AIProviderResolver
jest.mock('../../../services/AIProviderResolver');

describe('TerminalManager Robustness Features', () => {
    let terminalManager: TerminalManager;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockEventBus: jest.Mocked<IEventBus>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockTerminal: jest.Mocked<vscode.Terminal>;
    let mockAIResolver: jest.Mocked<AIProviderResolver>;

    const mockAgent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        type: 'frontend-specialist',
        template: {
            id: 'frontend-specialist',
            systemPrompt: 'You are a frontend specialist',
            detailedPrompt:
                'This is a very detailed prompt that explains your role in great detail and provides comprehensive instructions for your work.'
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Setup mock config service
        mockConfigService = {
            get: jest.fn(),
            getClaudeInitializationDelay: jest.fn().mockReturnValue(15),
            getAiProvider: jest.fn().mockReturnValue('claude'),
            isClaudeSkipPermissions: jest.fn().mockReturnValue(false),
            isShowAgentTerminalOnSpawn: jest.fn().mockReturnValue(false)
        } as any;

        // Setup mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            agents: jest.fn(),
            trace: jest.fn()
        } as any;

        // Setup mock event bus
        mockEventBus = {
            publish: jest.fn()
        } as any;

        // Setup mock error handler
        mockErrorHandler = {
            handleError: jest.fn()
        } as any;

        // Setup mock terminal
        mockTerminal = {
            name: 'Test Agent Terminal',
            show: jest.fn(),
            sendText: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Setup mock AI resolver
        mockAIResolver = {
            getCurrentProviderDescription: jest.fn().mockReturnValue('Claude CLI'),
            supportsSystemPrompt: jest.fn().mockReturnValue(true),
            getSystemPromptCommand: jest.fn().mockReturnValue('claude --append-system-prompt "test prompt"'),
            getFullCommand: jest.fn().mockReturnValue('claude')
        } as any;

        (AIProviderResolver as jest.Mock).mockImplementation(() => mockAIResolver);

        // Mock VS Code API
        (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);
        (vscode.env as any) = { shell: '/bin/bash' };

        terminalManager = new TerminalManager(mockConfigService, mockLoggingService, mockEventBus, mockErrorHandler);
    });

    afterEach(() => {
        jest.useRealTimers();
        terminalManager.dispose();
    });

    describe('Retry Logic with Exponential Backoff', () => {
        beforeEach(() => {
            // Create terminal first
            terminalManager.createTerminal(mockAgent.id, mockAgent);
        });

        it('should use configured retry parameters', async () => {
            const maxRetries = 5;
            const baseDelay = 2000;

            mockConfigService.get
                .mockReturnValueOnce(maxRetries) // robustness.maxRetries
                .mockReturnValueOnce(baseDelay); // robustness.baseRetryDelay

            // Mock health check to always fail initially
            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Connection failed']
            });

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);

            // Should fail after configured retries
            await expect(initPromise).rejects.toThrow(`Agent initialization failed after ${maxRetries} attempts`);

            // Verify retry attempts were logged
            expect(mockLoggingService.info).toHaveBeenCalledWith(expect.stringContaining(`Attempt 1/${maxRetries}`));
            expect(mockLoggingService.warn).toHaveBeenCalledTimes(maxRetries);
        });

        it('should implement exponential backoff with jitter', async () => {
            const maxRetries = 3;
            const baseDelay = 1000;

            mockConfigService.get.mockReturnValueOnce(maxRetries).mockReturnValueOnce(baseDelay);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Test failure']
            });

            // Spy on setTimeout to verify backoff timing
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);

            // Fast-forward through retries
            for (let attempt = 1; attempt < maxRetries; attempt++) {
                // Wait for current attempt to complete
                await jest.advanceTimersByTimeAsync(100);

                // Check that setTimeout was called with exponential backoff
                // Delay should be baseDelay * 2^(attempt-1) + jitter
                const expectedMinDelay = baseDelay * Math.pow(2, attempt - 1);
                const expectedMaxDelay = expectedMinDelay + 1000; // jitter up to 1000ms

                const actualDelay = setTimeoutSpy.mock.calls.filter(
                    call => call[1] >= expectedMinDelay && call[1] <= expectedMaxDelay
                ).length;

                expect(actualDelay).toBeGreaterThan(0);

                // Advance past the delay
                await jest.advanceTimersByTimeAsync(expectedMaxDelay);
            }

            await expect(initPromise).rejects.toThrow();
        });

        it('should succeed on retry after initial failures', async () => {
            const maxRetries = 3;
            const baseDelay = 500;

            mockConfigService.get.mockReturnValueOnce(maxRetries).mockReturnValueOnce(baseDelay);

            // Mock health check to fail twice, then succeed
            jest.spyOn(terminalManager, 'performHealthCheck')
                .mockResolvedValueOnce({ healthy: false, issues: ['Failure 1'] })
                .mockResolvedValueOnce({ healthy: false, issues: ['Failure 2'] })
                .mockResolvedValue({ healthy: true, issues: [] });

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);

            // Advance through retries
            await jest.advanceTimersByTimeAsync(30000); // Advance past all possible delays

            await expect(initPromise).resolves.not.toThrow();
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('initialized successfully on attempt 3')
            );
        });

        it('should clean up failed terminals between retries', async () => {
            const maxRetries = 2;
            mockConfigService.get.mockReturnValueOnce(maxRetries).mockReturnValueOnce(1000);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Terminal failure']
            });

            // Spy on createTerminal to verify recreation
            const createSpy = jest.spyOn(terminalManager, 'createTerminal');

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);
            await jest.advanceTimersByTimeAsync(30000);

            await expect(initPromise).rejects.toThrow();

            // Should have disposed and recreated terminal for retry
            expect(mockTerminal.dispose).toHaveBeenCalled();
            expect(createSpy).toHaveBeenCalledWith(mockAgent.id, mockAgent);
        });
    });

    describe('Agent Initialization Verification', () => {
        beforeEach(() => {
            terminalManager.createTerminal(mockAgent.id, mockAgent);
        });

        it('should verify initialization with timeout', async () => {
            const verifyPromise = (terminalManager as any).verifyAgentInitialization(mockAgent, 5000);

            // Should timeout after specified time
            await jest.advanceTimersByTimeAsync(5001);

            const result = await verifyPromise;
            expect(result).toBe(false);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Verification timeout for agent Test Agent after 5000ms')
            );
        });

        it('should send test command during verification', async () => {
            (terminalManager as any).verifyAgentInitialization(mockAgent, 1000);

            expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "NofX-Agent-Ready-Check"');
        });

        it('should return true when agent responds within timeout', async () => {
            // Mock successful verification (simplified)
            jest.spyOn(terminalManager as any, 'verifyAgentInitialization').mockResolvedValue(true);

            mockConfigService.get
                .mockReturnValueOnce(1) // maxRetries
                .mockReturnValueOnce(100); // baseDelay

            await expect(terminalManager.initializeAgentTerminal(mockAgent)).resolves.not.toThrow();
        });
    });

    describe('Configuration Integration', () => {
        beforeEach(() => {
            terminalManager.createTerminal(mockAgent.id, mockAgent);
        });

        it('should use default values when configuration is not available', async () => {
            // Mock config to return undefined
            mockConfigService.get.mockReturnValue(undefined);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Test']
            });

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);
            await jest.advanceTimersByTimeAsync(30000);

            // Should use defaults: 3 retries, 1000ms base delay
            await expect(initPromise).rejects.toThrow('failed after 3 attempts');
        });

        it('should respect custom configuration values', async () => {
            const customMaxRetries = 7;
            const customBaseDelay = 3000;

            mockConfigService.get.mockReturnValueOnce(customMaxRetries).mockReturnValueOnce(customBaseDelay);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Custom test']
            });

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);
            await jest.advanceTimersByTimeAsync(60000);

            await expect(initPromise).rejects.toThrow(`failed after ${customMaxRetries} attempts`);
        });

        it('should handle configuration edge cases', async () => {
            // Test with minimum values
            mockConfigService.get
                .mockReturnValueOnce(1) // minimum retries
                .mockReturnValueOnce(500); // minimum delay

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Edge case test']
            });

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);
            await jest.advanceTimersByTimeAsync(10000);

            await expect(initPromise).rejects.toThrow('failed after 1 attempts');
        });
    });

    describe('Two-Stage Prompt Injection', () => {
        beforeEach(() => {
            terminalManager.createTerminal(mockAgent.id, mockAgent);
        });

        it('should inject detailed prompt after configured delay', async () => {
            const initDelay = 10; // 10 seconds
            mockConfigService.get.mockImplementation((key: string) => {
                if (key === 'nofx.claudeInitializationDelay') return initDelay;
                return undefined;
            });

            // Mock successful verification
            jest.spyOn(terminalManager as any, 'verifyAgentInitialization').mockResolvedValue(true);

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);

            // Should launch Claude with short prompt first
            expect(mockAIResolver.getSystemPromptCommand).toHaveBeenCalledWith(mockAgent.template.systemPrompt);

            // Advance past initialization delay
            await jest.advanceTimersByTimeAsync(initDelay * 1000 + 2000); // +2s buffer

            await initPromise;

            // Should have injected detailed prompt after delay
            expect(mockTerminal.sendText).toHaveBeenCalledWith(mockAgent.template.detailedPrompt, false);
            expect(mockTerminal.sendText).toHaveBeenCalledWith('', true); // Enter key
        });

        it('should skip detailed prompt injection if not available', async () => {
            const agentWithoutDetailedPrompt = {
                ...mockAgent,
                template: {
                    ...mockAgent.template,
                    detailedPrompt: undefined
                }
            };

            jest.spyOn(terminalManager as any, 'verifyAgentInitialization').mockResolvedValue(true);

            await terminalManager.initializeAgentTerminal(agentWithoutDetailedPrompt);

            // Should not attempt to inject detailed prompt
            expect(mockTerminal.sendText).not.toHaveBeenCalledWith(expect.stringContaining('detailed'), false);
        });

        it('should handle prompt injection with proper timing', async () => {
            mockConfigService.get.mockImplementation((key: string) => {
                if (key === 'nofx.claudeInitializationDelay') return 5;
                return undefined;
            });

            jest.spyOn(terminalManager as any, 'verifyAgentInitialization').mockResolvedValue(true);

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);

            // Track sendText calls
            const sendTextCalls: Array<{ text: string; addNewLine: boolean | undefined }> = [];
            mockTerminal.sendText.mockImplementation((text, addNewLine) => {
                sendTextCalls.push({ text, addNewLine });
            });

            await jest.advanceTimersByTimeAsync(20000);
            await initPromise;

            // Verify the sequence: detailed prompt without newline, then empty with newline
            const detailedPromptCall = sendTextCalls.find(
                call => call.text === mockAgent.template.detailedPrompt && call.addNewLine === false
            );
            const enterKeyCall = sendTextCalls.find(call => call.text === '' && call.addNewLine === true);

            expect(detailedPromptCall).toBeDefined();
            expect(enterKeyCall).toBeDefined();
        });
    });

    describe('Error Handling and Logging', () => {
        beforeEach(() => {
            terminalManager.createTerminal(mockAgent.id, mockAgent);
        });

        it('should log comprehensive debugging information', async () => {
            mockConfigService.get.mockReturnValue(1); // Single attempt for faster test

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: false,
                issues: ['Debug test error']
            });

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);
            await jest.advanceTimersByTimeAsync(10000);

            await expect(initPromise).rejects.toThrow();

            // Verify comprehensive logging
            expect(mockLoggingService.info).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 1/1: Initializing terminal')
            );
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 1/1 failed for agent Test Agent')
            );
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                expect.stringContaining('All 1 attempts failed for agent Test Agent')
            );
        });

        it('should handle missing terminal gracefully', async () => {
            // Remove terminal to simulate missing terminal scenario
            terminalManager.disposeTerminal(mockAgent.id);

            jest.spyOn(terminalManager, 'performHealthCheck').mockResolvedValue({
                healthy: true,
                issues: []
            });

            await expect(terminalManager.initializeAgentTerminal(mockAgent)).rejects.toThrow();

            expect(mockLoggingService.error).toHaveBeenCalledWith(`No terminal found for agent ${mockAgent.id}`);
        });

        it('should provide detailed error context in failure messages', async () => {
            const specificError = new Error('Specific initialization failure');
            mockConfigService.get.mockReturnValue(2);

            jest.spyOn(terminalManager as any, 'performAgentInitialization').mockRejectedValue(specificError);

            const initPromise = terminalManager.initializeAgentTerminal(mockAgent);
            await jest.advanceTimersByTimeAsync(30000);

            await expect(initPromise).rejects.toThrow(
                'Agent initialization failed after 2 attempts: Specific initialization failure'
            );
        });
    });

    describe('Health Check Integration', () => {
        beforeEach(() => {
            terminalManager.createTerminal(mockAgent.id, mockAgent);
        });

        it('should perform health checks with proper timeout', async () => {
            const healthResult = await terminalManager.performHealthCheck(mockAgent.id);

            expect(healthResult).toBeDefined();
            expect(typeof healthResult.healthy).toBe('boolean');
            expect(Array.isArray(healthResult.issues)).toBe(true);
        });

        it('should handle health check for non-existent agent', async () => {
            const healthResult = await terminalManager.performHealthCheck('non-existent-agent');

            expect(healthResult.healthy).toBe(false);
            expect(healthResult.issues).toContain('No terminal found');
        });

        it('should catch health check exceptions', async () => {
            // Mock terminal.sendText to throw an error
            mockTerminal.sendText.mockImplementation(() => {
                throw new Error('Terminal communication failed');
            });

            const healthResult = await terminalManager.performHealthCheck(mockAgent.id);

            expect(healthResult.healthy).toBe(false);
            expect(healthResult.issues.some(issue => issue.includes('Terminal health check failed'))).toBe(true);
        });
    });
});
