import { AgentHealthMonitor, AgentHealthStatus, AgentRecoveryAction } from '../../../services/AgentHealthMonitor';
import { TerminalOutputMonitor } from '../../../services/TerminalOutputMonitor';
import { ITerminalManager, ILoggingService, IEventBus, IConfigurationService } from '../../../services/interfaces';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode');

// Mock dependencies
const mockTerminalManager = {
    getTerminal: jest.fn(),
    performHealthCheck: jest.fn()
} as unknown as ITerminalManager;

const mockLoggingService = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
} as unknown as ILoggingService;

const mockEventBus = {
    publish: jest.fn()
} as unknown as IEventBus;

const mockConfigService = {
    get: jest.fn()
} as unknown as IConfigurationService;

const mockTerminal = {
    name: 'Test Agent',
    processId: 123
} as unknown as vscode.Terminal;

describe('AgentHealthMonitor', () => {
    let healthMonitor: AgentHealthMonitor;
    let mockTerminalOutputMonitor: jest.Mocked<TerminalOutputMonitor>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock TerminalOutputMonitor
        mockTerminalOutputMonitor = {
            monitorTerminal: jest.fn(),
            stopMonitoring: jest.fn(),
            on: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Mock the constructor
        jest.spyOn(require('../../../services/TerminalOutputMonitor'), 'TerminalOutputMonitor').mockImplementation(
            () => mockTerminalOutputMonitor
        );

        healthMonitor = new AgentHealthMonitor(
            mockTerminalManager,
            mockLoggingService,
            mockEventBus,
            mockConfigService
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        healthMonitor.dispose();
    });

    describe('startMonitoring', () => {
        beforeEach(() => {
            // Setup default config values
            (mockConfigService.get as jest.Mock)
                .mockReturnValueOnce(30000) // healthCheckInterval
                .mockReturnValueOnce(45000); // initializationTimeout
        });

        it('should initialize health status for a new agent', () => {
            const agentId = 'agent-1';

            healthMonitor.startMonitoring(agentId, mockTerminal);

            const status = healthMonitor.getHealthStatus(agentId);
            expect(status).toBeDefined();
            expect(status?.agentId).toBe(agentId);
            expect(status?.healthy).toBe(false);
            expect(status?.initializationState).toBe('pending');
            expect(status?.consecutiveFailures).toBe(0);
        });

        it('should start terminal output monitoring', () => {
            const agentId = 'agent-1';

            healthMonitor.startMonitoring(agentId, mockTerminal);

            expect(mockTerminalOutputMonitor.monitorTerminal).toHaveBeenCalledWith(mockTerminal, agentId);
        });

        it('should set up periodic health checks with configured interval', () => {
            const agentId = 'agent-1';
            const customInterval = 15000;

            (mockConfigService.get as jest.Mock).mockReturnValueOnce(customInterval).mockReturnValueOnce(45000);

            jest.spyOn(global, 'setInterval');

            healthMonitor.startMonitoring(agentId, mockTerminal);

            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), customInterval);
        });

        it('should set initialization timeout with configured value', () => {
            const agentId = 'agent-1';
            const customTimeout = 60000;

            (mockConfigService.get as jest.Mock).mockReturnValueOnce(30000).mockReturnValueOnce(customTimeout);

            jest.spyOn(global, 'setTimeout');

            healthMonitor.startMonitoring(agentId, mockTerminal);

            expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), customTimeout);
        });

        it('should handle initialization timeout', () => {
            const agentId = 'agent-1';

            healthMonitor.startMonitoring(agentId, mockTerminal);

            // Fast-forward past initialization timeout
            jest.advanceTimersByTime(45001);

            const status = healthMonitor.getHealthStatus(agentId);
            expect(status?.healthy).toBe(false);
            expect(status?.initializationState).toBe('failed');
            expect(status?.issues).toContain('Initialization timeout');
        });
    });

    describe('stopMonitoring', () => {
        it('should clean up agent monitoring resources', () => {
            const agentId = 'agent-1';

            healthMonitor.startMonitoring(agentId, mockTerminal);
            healthMonitor.stopMonitoring(agentId);

            const status = healthMonitor.getHealthStatus(agentId);
            expect(status).toBeUndefined();
            expect(mockTerminalOutputMonitor.stopMonitoring).toHaveBeenCalledWith(mockTerminal);
        });

        it('should clear health check interval', () => {
            const agentId = 'agent-1';
            jest.spyOn(global, 'clearInterval');

            healthMonitor.startMonitoring(agentId, mockTerminal);
            healthMonitor.stopMonitoring(agentId);

            expect(clearInterval).toHaveBeenCalled();
        });
    });

    describe('performHealthCheck', () => {
        beforeEach(() => {
            healthMonitor.startMonitoring('agent-1', mockTerminal);
        });

        it('should return false for non-existent agent', async () => {
            const result = await healthMonitor.performHealthCheck('non-existent');
            expect(result).toBe(false);
        });

        it('should update health status on successful check', async () => {
            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: true,
                issues: []
            });

            const result = await healthMonitor.performHealthCheck('agent-1');

            expect(result).toBe(true);
            const status = healthMonitor.getHealthStatus('agent-1');
            expect(status?.healthy).toBe(true);
            expect(status?.consecutiveFailures).toBe(0);
            expect(status?.initializationState).toBe('ready');
        });

        it('should increment failure count on failed check', async () => {
            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: false,
                issues: ['Connection timeout']
            });

            await healthMonitor.performHealthCheck('agent-1');

            const status = healthMonitor.getHealthStatus('agent-1');
            expect(status?.healthy).toBe(false);
            expect(status?.consecutiveFailures).toBe(1);
            expect(status?.issues).toContain('Connection timeout');
        });

        it('should trigger recovery after max consecutive failures', async () => {
            const maxFailures = 2;
            (mockConfigService.get as jest.Mock).mockReturnValue(maxFailures);
            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: false,
                issues: ['Persistent error']
            });

            // Trigger failures up to the threshold
            for (let i = 0; i < maxFailures; i++) {
                await healthMonitor.performHealthCheck('agent-1');
            }

            const status = healthMonitor.getHealthStatus('agent-1');
            expect(status?.initializationState).toBe('recovering');
        });

        it('should publish status change events', async () => {
            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: true,
                issues: []
            });

            await healthMonitor.performHealthCheck('agent-1');

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                DOMAIN_EVENTS.AGENT_STATUS_CHANGED,
                expect.objectContaining({
                    agentId: 'agent-1',
                    status: expect.any(Object)
                })
            );
        });

        it('should handle health check exceptions', async () => {
            const error = new Error('Health check failed');
            (mockTerminalManager.performHealthCheck as jest.Mock).mockRejectedValue(error);

            const result = await healthMonitor.performHealthCheck('agent-1');

            expect(result).toBe(false);
            const status = healthMonitor.getHealthStatus('agent-1');
            expect(status?.healthy).toBe(false);
            expect(status?.consecutiveFailures).toBe(1);
            expect(status?.issues).toContain('Health check failed: Error: Health check failed');
        });
    });

    describe('Claude event handling', () => {
        beforeEach(() => {
            healthMonitor.startMonitoring('agent-1', mockTerminal);
        });

        it('should handle Claude ready events', () => {
            // Simulate Claude ready event from output monitor
            const readyCallback = (mockTerminalOutputMonitor.on as jest.Mock).mock.calls.find(
                call => call[0] === 'claude-ready'
            )?.[1];

            expect(readyCallback).toBeDefined();

            readyCallback({ agentId: 'agent-1' });

            const status = healthMonitor.getHealthStatus('agent-1');
            expect(status?.initializationState).toBe('ready');
            expect(status?.healthy).toBe(true);
            expect(status?.consecutiveFailures).toBe(0);
        });

        it('should handle Claude error events', () => {
            const errorCallback = (mockTerminalOutputMonitor.on as jest.Mock).mock.calls.find(
                call => call[0] === 'claude-error'
            )?.[1];

            expect(errorCallback).toBeDefined();

            errorCallback({ agentId: 'agent-1', error: 'Claude initialization failed' });

            const status = healthMonitor.getHealthStatus('agent-1');
            expect(status?.healthy).toBe(false);
            expect(status?.initializationState).toBe('failed');
            expect(status?.issues).toContain('Claude error: Claude initialization failed');
        });
    });

    describe('Recovery strategies', () => {
        beforeEach(() => {
            healthMonitor.startMonitoring('agent-1', mockTerminal);
        });

        it('should respect auto-recovery disable setting', async () => {
            (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
                if (key === 'robustness.enableAutoRecovery') return false;
                if (key === 'robustness.maxConsecutiveFailures') return 1;
                return undefined;
            });

            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: false,
                issues: ['Test failure']
            });

            await healthMonitor.performHealthCheck('agent-1');

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                DOMAIN_EVENTS.AGENT_FAILED,
                expect.objectContaining({
                    agentId: 'agent-1',
                    requiresManualIntervention: true
                })
            );
        });

        it('should use conservative recovery strategy', async () => {
            (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
                if (key === 'robustness.recoveryStrategy') return 'conservative';
                if (key === 'robustness.maxConsecutiveFailures') return 1;
                if (key === 'robustness.enableAutoRecovery') return true;
                return undefined;
            });

            // Create a spy to capture the recovery action
            const triggerRecoverySpy = jest.spyOn(healthMonitor as any, 'determineRecoveryAction');

            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: false,
                issues: ['terminal connection error']
            });

            await healthMonitor.performHealthCheck('agent-1');

            expect(triggerRecoverySpy).toHaveBeenCalled();
            const recoveryAction = triggerRecoverySpy.mock.results[0]?.value as AgentRecoveryAction;
            expect(recoveryAction?.type).toBe('reset_terminal');
            expect(recoveryAction?.description).toContain('Conservative');
        });

        it('should use aggressive recovery strategy', async () => {
            (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
                if (key === 'robustness.recoveryStrategy') return 'aggressive';
                if (key === 'robustness.maxConsecutiveFailures') return 1;
                if (key === 'robustness.enableAutoRecovery') return true;
                return undefined;
            });

            const triggerRecoverySpy = jest.spyOn(healthMonitor as any, 'determineRecoveryAction');

            (mockTerminalManager.performHealthCheck as jest.Mock).mockResolvedValue({
                healthy: false,
                issues: ['any error']
            });

            await healthMonitor.performHealthCheck('agent-1');

            const recoveryAction = triggerRecoverySpy.mock.results[0]?.value as AgentRecoveryAction;
            expect(recoveryAction?.type).toBe('force_restart');
            expect(recoveryAction?.description).toContain('Aggressive');
        });

        it('should use progressive recovery strategy with escalation', async () => {
            (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
                if (key === 'robustness.recoveryStrategy') return 'progressive';
                if (key === 'robustness.maxConsecutiveFailures') return 1;
                if (key === 'robustness.enableAutoRecovery') return true;
                return undefined;
            });

            const status = healthMonitor.getHealthStatus('agent-1')!;

            // Test escalation based on failure count
            const testCases = [
                { failures: 1, hasTerminalIssue: true, expectedType: 'reset_terminal' },
                { failures: 2, hasInitIssue: true, expectedType: 'reinitialize' },
                { failures: 4, hasInitIssue: false, expectedType: 'restart' },
                { failures: 6, hasInitIssue: false, expectedType: 'force_restart' }
            ];

            testCases.forEach(testCase => {
                status.consecutiveFailures = testCase.failures;
                status.issues = testCase.hasTerminalIssue
                    ? ['terminal error']
                    : testCase.hasInitIssue
                      ? ['initialization error']
                      : ['other error'];

                const recoveryAction = (healthMonitor as any).determineRecoveryAction(status);
                expect(recoveryAction.type).toBe(testCase.expectedType);
            });
        });
    });

    describe('Health summary', () => {
        it('should provide correct health summary', () => {
            // Start monitoring multiple agents
            healthMonitor.startMonitoring('agent-1', mockTerminal);
            healthMonitor.startMonitoring('agent-2', mockTerminal);
            healthMonitor.startMonitoring('agent-3', mockTerminal);

            // Set different states
            const agent1Status = healthMonitor.getHealthStatus('agent-1')!;
            agent1Status.healthy = true;
            agent1Status.initializationState = 'ready';

            const agent2Status = healthMonitor.getHealthStatus('agent-2')!;
            agent2Status.healthy = false;
            agent2Status.initializationState = 'failed';

            const agent3Status = healthMonitor.getHealthStatus('agent-3')!;
            agent3Status.healthy = false;
            agent3Status.initializationState = 'recovering';

            const summary = healthMonitor.getHealthSummary();

            expect(summary.total).toBe(3);
            expect(summary.healthy).toBe(1);
            expect(summary.unhealthy).toBe(1);
            expect(summary.recovering).toBe(1);
            expect(summary.failed).toBe(1);
        });
    });

    describe('Resource cleanup', () => {
        it('should dispose all resources properly', () => {
            const agentId = 'agent-1';
            jest.spyOn(global, 'clearInterval');

            healthMonitor.startMonitoring(agentId, mockTerminal);
            healthMonitor.dispose();

            expect(clearInterval).toHaveBeenCalled();
            expect(mockTerminalOutputMonitor.dispose).toHaveBeenCalled();
            expect(healthMonitor.getHealthStatus(agentId)).toBeUndefined();
        });
    });

    describe('Configuration handling', () => {
        it('should use default values when config service is not provided', () => {
            const monitorWithoutConfig = new AgentHealthMonitor(mockTerminalManager, mockLoggingService, mockEventBus);

            jest.spyOn(global, 'setInterval');
            monitorWithoutConfig.startMonitoring('agent-1', mockTerminal);

            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000); // default interval

            monitorWithoutConfig.dispose();
        });

        it('should handle config service returning undefined', () => {
            (mockConfigService.get as jest.Mock).mockReturnValue(undefined);

            jest.spyOn(global, 'setInterval');
            healthMonitor.startMonitoring('agent-1', mockTerminal);

            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000); // fallback to default
        });
    });
});
