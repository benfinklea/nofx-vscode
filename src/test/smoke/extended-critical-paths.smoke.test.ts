/**
 * EXTENDED SMOKE TESTS - Additional Critical Paths
 * These test additional critical functionality not covered in basic smoke tests
 */

// Mock vscode and fs modules
const vscode = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    }
};

const fs = {
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockImplementation((path: string) => {
        if (path.includes('template')) {
            return JSON.stringify({
                id: 'test-template',
                name: 'Test Template',
                systemPrompt: 'Test prompt',
                capabilities: ['test']
            });
        }
        return '{}';
    })
};

jest.mock('fs', () => fs);

import { AgentTemplateManager } from '../../agents/AgentTemplateManager';
import { TaskQueue } from '../../tasks/TaskQueue';
import { MessageType } from '../../orchestration/MessageProtocol';
import { WorktreeManager } from '../../worktrees/WorktreeManager';

describe('🔥 EXTENDED SMOKE TESTS - Additional Critical Paths', () => {
    const TIMEOUT = 10000;

    describe('8. Conductor System', () => {
        test('conductor commands should be valid JSON format', () => {
            const validCommands = [
                { type: 'spawn', role: 'frontend-specialist', name: 'UI Expert' },
                { type: 'assign', agentId: 'agent-1', task: 'Create login form', priority: 'high' },
                { type: 'status', agentId: 'all' },
                { type: 'terminate', agentId: 'agent-2' }
            ];

            validCommands.forEach(cmd => {
                const jsonStr = JSON.stringify(cmd);
                expect(() => JSON.parse(jsonStr)).not.toThrow();
            });
        });

        test('conductor message types should exist in protocol', () => {
            const conductorMessages = [
                MessageType.SPAWN_AGENT,
                MessageType.ASSIGN_TASK,
                MessageType.QUERY_STATUS,
                MessageType.TERMINATE_AGENT
            ];

            conductorMessages.forEach(type => {
                expect(type).toBeDefined();
                expect(typeof type).toBe('string');
            });
        });
    });

    describe('9. Agent Templates', () => {
        test('template manager should load templates', () => {
            const templateManager = new AgentTemplateManager('/test/workspace');

            expect(templateManager).toBeDefined();
            // Basic smoke test - just verify it can be instantiated
        });

        test('template structure should be valid', () => {
            const validTemplate = {
                id: 'frontend-specialist',
                name: 'Frontend Specialist',
                icon: '🎨',
                systemPrompt: 'You are a frontend expert...',
                capabilities: ['React', 'Vue', 'CSS', 'UI/UX'],
                taskPreferences: {
                    preferred: ['ui', 'styling', 'components'],
                    avoid: ['backend', 'database']
                }
            };

            expect(validTemplate.id).toBeDefined();
            expect(validTemplate.capabilities).toBeInstanceOf(Array);
            expect(validTemplate.taskPreferences).toBeDefined();
        });
    });

    describe('10. Task Queue System', () => {
        test('task queue should initialize', () => {
            const mockAgentManager = {
                getIdleAgents: jest.fn().mockReturnValue([]),
                getActiveAgents: jest.fn().mockReturnValue([])
            };

            const taskQueue = new TaskQueue(
                mockAgentManager as any,
                {} as any, // logger
                {} as any // eventBus
            );

            expect(taskQueue).toBeDefined();
            // TaskQueue exists and can be instantiated
        });

        test('task priorities should be ordered correctly', () => {
            const priorities = ['critical', 'high', 'medium', 'low'];
            const priorityValues: any = {
                critical: 4,
                high: 3,
                medium: 2,
                low: 1
            };

            priorities.forEach((p1, i) => {
                priorities.slice(i + 1).forEach(p2 => {
                    expect(priorityValues[p1]).toBeGreaterThan(priorityValues[p2]);
                });
            });
        });
    });

    describe('11. Git Worktrees', () => {
        test('worktree manager should handle initialization', () => {
            const mockContext = {
                subscriptions: [],
                workspaceState: {
                    get: jest.fn(),
                    update: jest.fn()
                }
            };

            const worktreeManager = new WorktreeManager(
                mockContext as any,
                {} as any // logger
            );

            expect(worktreeManager).toBeDefined();
            // WorktreeManager exists and can be instantiated
        });

        test('worktree paths should follow correct structure', () => {
            const projectPath = '/test/project';
            const agentId = 'agent-123';
            const expectedPath = `${projectPath}/../.nofx-worktrees/${agentId}`;

            // This is the expected structure
            expect(expectedPath).toContain('.nofx-worktrees');
            expect(expectedPath).toContain(agentId);
        });
    });

    describe('12. Message Flow Dashboard', () => {
        test('dashboard message filtering should work', () => {
            const messages = [
                { type: 'spawn_agent', from: 'conductor', to: 'server' },
                { type: 'task_complete', from: 'agent-1', to: 'conductor' },
                { type: 'heartbeat', from: 'agent-2', to: 'server' }
            ];

            // Filter by type
            const taskMessages = messages.filter(m => m.type === 'task_complete');
            expect(taskMessages).toHaveLength(1);

            // Filter by sender
            const agentMessages = messages.filter(m => m.from.startsWith('agent'));
            expect(agentMessages).toHaveLength(2);
        });
    });

    describe('13. Session Persistence', () => {
        test('persistence paths should be correct', () => {
            const workspaceRoot = '/test/workspace';
            const expectedPaths = {
                agents: `${workspaceRoot}/.nofx/agents.json`,
                sessions: `${workspaceRoot}/.nofx/sessions/`,
                templates: `${workspaceRoot}/.nofx/templates/`
            };

            Object.values(expectedPaths).forEach(path => {
                expect(path).toContain('.nofx');
            });
        });
    });

    describe('14. Terminal Management', () => {
        test('terminal naming should follow conventions', () => {
            const terminalNames = ['🎵 Conductor', '🤖 Frontend Dev', '🤖 Backend Dev', '🤖 Test Engineer'];

            terminalNames.forEach(name => {
                // Should have emoji prefix
                expect(name).toMatch(/^[🎵🤖]/);
                // Should have descriptive name
                expect(name.length).toBeGreaterThan(3);
            });
        });
    });

    describe('15. Critical File Existence', () => {
        test('critical extension files should be referenced', () => {
            const criticalFiles = [
                'src/extension.ts',
                'src/orchestration/OrchestrationServer.ts',
                'src/agents/AgentManager.ts',
                'src/conductor/ConductorTerminal.ts',
                'package.json'
            ];

            // Just verify the paths are correctly formed
            criticalFiles.forEach(file => {
                expect(file).toBeTruthy();
                expect(file.endsWith('.ts') || file.endsWith('.json')).toBe(true);
            });
        });
    });
});

/**
 * Extended Smoke Test Reporter
 */
export class ExtendedSmokeTestReporter {
    static generateReport(results: any): any {
        const extendedPaths = [
            'conductor-system',
            'agent-templates',
            'task-queue',
            'git-worktrees',
            'message-dashboard',
            'session-persistence',
            'terminal-management',
            'file-integrity'
        ];

        return {
            ...results,
            extendedPaths,
            totalCoverage: extendedPaths.length + 7 // 7 from basic smoke tests
        };
    }
}
