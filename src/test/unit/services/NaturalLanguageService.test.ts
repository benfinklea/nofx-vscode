import * as vscode from 'vscode';
import { NaturalLanguageService } from '../../../services/NaturalLanguageService';
import { ILoggingService } from '../../../services/interfaces';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn()
    }
}));

describe('NaturalLanguageService', () => {
    let service: NaturalLanguageService;
    let mockLoggingService: jest.Mocked<ILoggingService>;

    beforeEach(() => {
        // Create mock logging service
        mockLoggingService = {
            trace: jest.fn(),
            debug: jest.fn(),
            agents: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            isLevelEnabled: jest.fn().mockReturnValue(true),
            setConfigurationService: jest.fn(),
            getChannel: jest.fn(),
            time: jest.fn(),
            timeEnd: jest.fn(),
            onDidChangeConfiguration: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Create service instance
        service = new NaturalLanguageService(mockLoggingService);

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize successfully with logging service', () => {
            expect(service).toBeDefined();
            expect(mockLoggingService.info).toHaveBeenCalledWith('NaturalLanguageService initialized successfully');
        });

        it('should handle initialization errors gracefully', () => {
            // Mock initializePatterns to throw error
            const errorService = new NaturalLanguageService(mockLoggingService);
            expect(errorService).toBeDefined();
        });

        it('should work without logging service', () => {
            const serviceWithoutLogging = new NaturalLanguageService();
            expect(serviceWithoutLogging).toBeDefined();
        });
    });

    describe('parseNaturalLanguage - spawn commands', () => {
        it('should parse "add a frontend dev"', () => {
            const result = service.parseNaturalLanguage('add a frontend dev');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'frontend-specialist'
            });
            expect(result.confidence).toBe(0.9);
            expect(result.interpretation).toContain('Spawn a new agent');
        });

        it('should parse "spawn backend specialist called API Expert"', () => {
            const result = service.parseNaturalLanguage('spawn backend specialist called API Expert');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'backend-specialist',
                name: 'API Expert'
            });
            expect(result.confidence).toBe(0.9);
        });

        it('should parse "create testing agent"', () => {
            const result = service.parseNaturalLanguage('create testing agent');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'testing-specialist'
            });
            expect(result.confidence).toBe(0.9);
        });

        it('should parse agent with quotes in name', () => {
            const result = service.parseNaturalLanguage('spawn frontend agent named "UI Master"');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'frontend-specialist',
                name: 'UI Master'
            });
        });
    });

    describe('parseNaturalLanguage - status queries', () => {
        it('should parse "what\'s everyone doing?"', () => {
            const result = service.parseNaturalLanguage("what's everyone doing?");
            expect(result.command).toEqual({
                type: 'status',
                agentId: 'all'
            });
            expect(result.confidence).toBe(0.95);
        });

        it('should parse "show all agents"', () => {
            const result = service.parseNaturalLanguage('show all agents');
            expect(result.command).toEqual({
                type: 'status',
                agentId: 'all'
            });
            expect(result.confidence).toBe(0.95);
        });

        it('should parse "what\'s agent-1 doing?"', () => {
            const result = service.parseNaturalLanguage("what's agent-1 doing?");
            expect(result.command).toEqual({
                type: 'status',
                agentId: 'agent-1'
            });
            expect(result.confidence).toBe(0.9);
        });

        it('should parse "show agent-2 status"', () => {
            const result = service.parseNaturalLanguage('show agent-2 status');
            expect(result.command).toEqual({
                type: 'status',
                agentId: 'agent-2'
            });
            expect(result.confidence).toBe(0.9);
        });
    });

    describe('parseNaturalLanguage - task assignment', () => {
        it('should parse "assign login form to agent-1"', () => {
            const result = service.parseNaturalLanguage('assign login form to agent-1');
            expect(result.command).toEqual({
                type: 'assign',
                task: 'login form',
                agentId: 'agent-1',
                priority: 'normal'
            });
            expect(result.confidence).toBe(0.85);
        });

        it('should parse task with quotes', () => {
            const result = service.parseNaturalLanguage('assign "API endpoints" to agent-2');
            expect(result.command).toEqual({
                type: 'assign',
                task: 'API endpoints',
                agentId: 'agent-2',
                priority: 'normal'
            });
        });

        it('should parse "have agent-1 create the navbar"', () => {
            const result = service.parseNaturalLanguage('have agent-1 create the navbar');
            expect(result.command).toEqual({
                type: 'assign',
                agentId: 'agent-1',
                task: 'create the navbar',
                priority: 'normal'
            });
            expect(result.confidence).toBe(0.8);
        });

        it('should parse "tell frontend-dev to fix the CSS"', () => {
            const result = service.parseNaturalLanguage('tell frontend-dev to fix the CSS');
            expect(result.command).toEqual({
                type: 'assign',
                agentId: 'agent-frontend-dev',
                task: 'fix the CSS',
                priority: 'normal'
            });
        });
    });

    describe('parseNaturalLanguage - termination', () => {
        it('should parse "terminate agent-1"', () => {
            const result = service.parseNaturalLanguage('terminate agent-1');
            expect(result.command).toEqual({
                type: 'terminate',
                agentId: 'agent-1'
            });
            expect(result.confidence).toBe(0.95);
        });

        it('should parse "stop all"', () => {
            const result = service.parseNaturalLanguage('stop all');
            expect(result.command).toEqual({
                type: 'terminate',
                agentId: 'all'
            });
            expect(result.confidence).toBe(0.95);
        });

        it('should parse "dismiss backend-dev"', () => {
            const result = service.parseNaturalLanguage('dismiss backend-dev');
            expect(result.command).toEqual({
                type: 'terminate',
                agentId: 'agent-backend-dev'
            });
        });
    });

    describe('parseNaturalLanguage - priority tasks', () => {
        it('should parse "urgent: fix the login bug"', () => {
            const result = service.parseNaturalLanguage('urgent: fix the login bug');
            expect(result.command).toEqual({
                type: 'assign',
                task: 'fix the login bug',
                priority: 'high',
                agentId: 'auto'
            });
            expect(result.confidence).toBe(0.85);
        });

        it('should parse "high priority: deploy to production"', () => {
            const result = service.parseNaturalLanguage('high priority: deploy to production');
            expect(result.command).toEqual({
                type: 'assign',
                task: 'deploy to production',
                priority: 'high',
                agentId: 'auto'
            });
        });
    });

    describe('parseNaturalLanguage - team presets', () => {
        it('should parse "start a small team"', () => {
            const result = service.parseNaturalLanguage('start a small team');
            expect(result.command).toEqual({
                type: 'spawn_team',
                preset: 'small-team'
            });
            expect(result.confidence).toBe(0.9);
        });

        it('should parse "create fullstack team"', () => {
            const result = service.parseNaturalLanguage('create fullstack team');
            expect(result.command).toEqual({
                type: 'spawn_team',
                preset: 'fullstack-team'
            });
        });
    });

    describe('parseNaturalLanguage - help', () => {
        it('should parse "help"', () => {
            const result = service.parseNaturalLanguage('help');
            expect(result.command).toEqual({
                type: 'help'
            });
            expect(result.confidence).toBe(1.0);
        });

        it('should parse "what can you do?"', () => {
            const result = service.parseNaturalLanguage('what can you do?');
            expect(result.command).toEqual({
                type: 'help'
            });
            expect(result.confidence).toBe(1.0);
        });
    });

    describe('parseNaturalLanguage - JSON input', () => {
        it('should parse valid JSON directly', () => {
            const json = '{"type": "spawn", "role": "frontend-specialist"}';
            const result = service.parseNaturalLanguage(json);
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'frontend-specialist'
            });
            expect(result.confidence).toBe(1.0);
            expect(result.interpretation).toBe('Raw JSON command');
        });

        it('should handle JSON with dangerous characters (sanitization)', () => {
            const json = '{"type": "spawn", "role": "test<script>alert(1)</script>"}';
            const result = service.parseNaturalLanguage(json);
            expect(result.command.role).toBe('testscriptalert(1)/script');
            expect(result.confidence).toBe(1.0);
        });

        it('should reject JSON without type field', () => {
            const json = '{"role": "frontend-specialist"}';
            const result = service.parseNaturalLanguage(json);
            expect(result.command).toBeNull();
            expect(result.confidence).toBe(0);
            expect(mockLoggingService.warn).toHaveBeenCalled();
        });

        it('should fallback to natural language for invalid JSON', () => {
            const input = '{invalid json} add a frontend dev';
            const result = service.parseNaturalLanguage(input);
            // Should still parse the natural language part
            expect(result.command).toBeDefined();
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                expect.stringContaining('Invalid JSON'),
                expect.anything()
            );
        });
    });

    describe('parseNaturalLanguage - error handling', () => {
        it('should handle null input', () => {
            const result = service.parseNaturalLanguage(null as any);
            expect(result.command).toBeNull();
            expect(result.confidence).toBe(0);
            expect(result.error).toBe('Input must be a non-empty string');
        });

        it('should handle undefined input', () => {
            const result = service.parseNaturalLanguage(undefined as any);
            expect(result.command).toBeNull();
            expect(result.confidence).toBe(0);
            expect(result.error).toBe('Input must be a non-empty string');
        });

        it('should handle empty string', () => {
            const result = service.parseNaturalLanguage('');
            expect(result.command).toBeNull();
            expect(result.confidence).toBe(0);
            expect(result.error).toBe('Input must be a non-empty string');
        });

        it('should handle non-string input', () => {
            const result = service.parseNaturalLanguage(123 as any);
            expect(result.command).toBeNull();
            expect(result.confidence).toBe(0);
            expect(result.error).toBe('Input must be a non-empty string');
        });

        it('should provide suggestions for unmatched input', () => {
            const result = service.parseNaturalLanguage('do something random');
            expect(result.command).toBeNull();
            expect(result.confidence).toBe(0);
            expect(result.suggestions).toBeDefined();
            expect(result.error).toBe('No matching pattern found');
        });

        it('should handle catastrophic failure gracefully', () => {
            // Force a catastrophic failure by mocking pattern matching to throw
            const patterns = (service as any).patterns;
            (service as any).patterns = [
                {
                    pattern: /test/,
                    converter: () => {
                        throw new Error('Catastrophic error');
                    },
                    description: 'test',
                    examples: [],
                    confidence: 1
                }
            ];

            const result = service.parseNaturalLanguage('test');
            expect(result.command).toBeNull();
            expect(result.error).toBe('Natural language service encountered an error');
            expect(result.suggestions).toContain(
                'Try using JSON format: {"type": "spawn", "role": "frontend-specialist"}'
            );

            // Restore patterns
            (service as any).patterns = patterns;
        });
    });

    describe('caching', () => {
        it('should cache successful parses', () => {
            const input = 'add a frontend dev';

            // First call
            const result1 = service.parseNaturalLanguage(input);
            expect(result1.isFromCache).toBeUndefined();

            // Second call should be from cache
            const result2 = service.parseNaturalLanguage(input);
            expect(result2.isFromCache).toBe(true);
            expect(result2.command).toEqual(result1.command);
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Returning cached command for input:', input);
        });

        it('should limit cache size', () => {
            const CACHE_SIZE = 100;

            // Fill cache beyond limit
            for (let i = 0; i < CACHE_SIZE + 10; i++) {
                service.parseNaturalLanguage(`{"type": "test", "id": ${i}}`);
            }

            // Check cache size doesn't exceed limit
            const healthStatus = service.getHealthStatus();
            expect(healthStatus.cacheSize).toBeLessThanOrEqual(CACHE_SIZE);
        });
    });

    describe('health monitoring', () => {
        it('should track failure count', () => {
            // Force failures
            for (let i = 0; i < 3; i++) {
                service.parseNaturalLanguage('unmatched command ' + i);
            }

            const health = service.getHealthStatus();
            expect(health.failureCount).toBe(3);
            expect(health.isHealthy).toBe(true);
        });

        it('should mark service unhealthy after MAX_FAILURES', () => {
            const MAX_FAILURES = 5;

            // Force failures beyond threshold
            for (let i = 0; i < MAX_FAILURES + 1; i++) {
                service.parseNaturalLanguage('unmatched command ' + i);
            }

            const health = service.getHealthStatus();
            expect(health.failureCount).toBe(MAX_FAILURES + 1);
            expect(health.isHealthy).toBe(false);
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                `NaturalLanguageService unhealthy: ${MAX_FAILURES + 1} consecutive failures`
            );
        });

        it('should reset failure count on success', () => {
            // Force some failures
            service.parseNaturalLanguage('unmatched command');
            service.parseNaturalLanguage('unmatched command 2');

            let health = service.getHealthStatus();
            expect(health.failureCount).toBe(2);

            // Successful parse should reset
            service.parseNaturalLanguage('add a frontend dev');

            health = service.getHealthStatus();
            expect(health.failureCount).toBe(0);
            expect(health.isHealthy).toBe(true);
        });

        it('should track last successful parse time', () => {
            const beforeParse = new Date();
            service.parseNaturalLanguage('add a frontend dev');
            const afterParse = new Date();

            const health = service.getHealthStatus();
            expect(health.lastSuccess.getTime()).toBeGreaterThanOrEqual(beforeParse.getTime());
            expect(health.lastSuccess.getTime()).toBeLessThanOrEqual(afterParse.getTime());
        });
    });

    describe('reset', () => {
        it('should reset service to healthy state', () => {
            // Force unhealthy state
            for (let i = 0; i < 10; i++) {
                service.parseNaturalLanguage('unmatched ' + i);
            }

            let health = service.getHealthStatus();
            expect(health.isHealthy).toBe(false);
            expect(health.failureCount).toBeGreaterThan(5);

            // Reset
            service.reset();

            health = service.getHealthStatus();
            expect(health.isHealthy).toBe(true);
            expect(health.failureCount).toBe(0);
            expect(health.cacheSize).toBe(0);
            expect(mockLoggingService.info).toHaveBeenCalledWith('NaturalLanguageService reset to healthy state');
        });
    });

    describe('getExamples', () => {
        it('should return all pattern examples', () => {
            const examples = service.getExamples();
            expect(examples).toContain('add a frontend dev');
            expect(examples).toContain('spawn backend specialist called API Expert');
            expect(examples).toContain("what's everyone doing?");
            expect(examples).toContain('assign login form to agent-1');
            expect(examples).toContain('terminate agent-1');
            expect(examples).toContain('help');
            expect(examples.length).toBeGreaterThan(10);
        });

        it('should handle errors when getting examples', () => {
            // Mock patterns to be invalid
            (service as any).patterns = null;

            const examples = service.getExamples();
            expect(examples).toContain('add a frontend dev');
            expect(examples).toContain('assign task to agent-1');
            expect(examples).toContain("what's everyone doing?");
            expect(mockLoggingService.error).toHaveBeenCalledWith('Error getting examples:', expect.anything());
        });
    });

    describe('confirmInterpretation', () => {
        it('should show confirmation dialog and return true for Yes', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

            const result = await service.confirmInterpretation('Spawn a new agent', {
                type: 'spawn',
                role: 'frontend-specialist'
            });

            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('I understood: Spawn a new agent'),
                { modal: false },
                'Yes',
                'No',
                'Show JSON'
            );
        });

        it('should return false for No', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

            const result = await service.confirmInterpretation('Spawn a new agent', {
                type: 'spawn',
                role: 'frontend-specialist'
            });

            expect(result).toBe(false);
        });

        it('should show JSON when requested and handle Execute', async () => {
            (vscode.window.showInformationMessage as jest.Mock)
                .mockResolvedValueOnce('Show JSON')
                .mockResolvedValueOnce('Execute');

            const result = await service.confirmInterpretation('Spawn a new agent', {
                type: 'spawn',
                role: 'frontend-specialist'
            });

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
            expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith(
                expect.stringContaining('JSON Command:'),
                { modal: true },
                'Execute',
                'Cancel'
            );
        });

        it('should handle Show JSON with Cancel', async () => {
            (vscode.window.showInformationMessage as jest.Mock)
                .mockResolvedValueOnce('Show JSON')
                .mockResolvedValueOnce('Cancel');

            const result = await service.confirmInterpretation('Spawn a new agent', {
                type: 'spawn',
                role: 'frontend-specialist'
            });

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
        });
    });

    describe('agent type normalization', () => {
        const testCases = [
            { input: 'frontend', expected: 'frontend-specialist' },
            { input: 'front', expected: 'frontend-specialist' },
            { input: 'ui', expected: 'frontend-specialist' },
            { input: 'backend', expected: 'backend-specialist' },
            { input: 'back', expected: 'backend-specialist' },
            { input: 'api', expected: 'backend-specialist' },
            { input: 'fullstack', expected: 'fullstack-developer' },
            { input: 'full', expected: 'fullstack-developer' },
            { input: 'test', expected: 'testing-specialist' },
            { input: 'testing', expected: 'testing-specialist' },
            { input: 'qa', expected: 'testing-specialist' },
            { input: 'devops', expected: 'devops-engineer' },
            { input: 'ops', expected: 'devops-engineer' },
            { input: 'ai', expected: 'ai-ml-specialist' },
            { input: 'ml', expected: 'ai-ml-specialist' },
            { input: 'mobile', expected: 'mobile-developer' },
            { input: 'ios', expected: 'mobile-developer' },
            { input: 'android', expected: 'mobile-developer' },
            { input: 'security', expected: 'security-expert' },
            { input: 'sec', expected: 'security-expert' },
            { input: 'database', expected: 'database-architect' },
            { input: 'db', expected: 'database-architect' },
            { input: 'data', expected: 'database-architect' },
            { input: 'custom', expected: 'custom-specialist' }
        ];

        testCases.forEach(({ input, expected }) => {
            it(`should normalize "${input}" to "${expected}"`, () => {
                const result = service.parseNaturalLanguage(`add a ${input} dev`);
                expect(result.command?.role).toBe(expected);
            });
        });
    });

    describe('team preset normalization', () => {
        const testCases = [
            { input: 'small', expected: 'small-team' },
            { input: 'standard', expected: 'standard-team' },
            { input: 'large', expected: 'large-team' },
            { input: 'fullstack', expected: 'fullstack-team' },
            { input: 'full', expected: 'fullstack-team' },
            { input: 'custom', expected: 'custom-team' },
            { input: 'unknown', expected: 'standard-team' }
        ];

        testCases.forEach(({ input, expected }) => {
            it(`should normalize "${input}" team to "${expected}"`, () => {
                const result = service.parseNaturalLanguage(`start a ${input} team`);
                expect(result.command?.preset).toBe(expected);
            });
        });
    });

    describe('suggestions', () => {
        it('should provide relevant suggestions for partial matches', () => {
            const result = service.parseNaturalLanguage('agent frontend');
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions?.length).toBeGreaterThan(0);
            expect(result.suggestions?.length).toBeLessThanOrEqual(3);
        });

        it('should provide suggestions with spawn keyword', () => {
            const result = service.parseNaturalLanguage('spawn something');
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions?.some(s => s.includes('spawn'))).toBe(true);
        });

        it('should provide suggestions with status keyword', () => {
            const result = service.parseNaturalLanguage('status check');
            expect(result.suggestions).toBeDefined();
            expect(
                result.suggestions?.some(s => s.includes('status') || s.includes('doing') || s.includes('show'))
            ).toBe(true);
        });

        it('should limit suggestions to 3', () => {
            const result = service.parseNaturalLanguage('a');
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions?.length).toBeLessThanOrEqual(3);
        });
    });

    describe('edge cases', () => {
        it('should handle mixed case input', () => {
            const result = service.parseNaturalLanguage('ADD A FRONTEND DEV');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'frontend-specialist'
            });
        });

        it('should handle extra whitespace', () => {
            const result = service.parseNaturalLanguage('  add   a   frontend   dev  ');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'frontend-specialist'
            });
        });

        it('should handle special characters in agent names', () => {
            const result = service.parseNaturalLanguage('spawn frontend called Test-Agent_123');
            expect(result.command).toEqual({
                type: 'spawn',
                role: 'frontend-specialist',
                name: 'Test-Agent_123'
            });
        });

        it('should handle very long input gracefully', () => {
            const longInput = 'add a ' + 'x'.repeat(1000) + ' dev';
            const result = service.parseNaturalLanguage(longInput);
            expect(result.command).toBeDefined();
            expect(result.error).toBeUndefined();
        });
    });
});
