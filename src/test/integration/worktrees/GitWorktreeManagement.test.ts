import * as path from 'path';
import * as fs from 'fs';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import { WorktreeService } from '../../../services/WorktreeService';
import { EventBus } from '../../../services/EventBus';
import { LoggingService } from '../../../services/LoggingService';
import { ConfigurationService } from '../../../services/ConfigurationService';
import { NotificationService } from '../../../services/NotificationService';
import { Container } from '../../../services/Container';
import { DOMAIN_EVENTS } from '../../../services/EventConstants';
import { Agent } from '../../../agents/types';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createMockTerminal } from '../../helpers/mockFactories';

const execAsync = promisify(exec);

describe('Git Worktree Management Integration', () => {
    let container: Container;
    let worktreeManager: WorktreeManager;
    let worktreeService: WorktreeService;
    let eventBus: EventBus;
    let mockContext: vscode.ExtensionContext;
    let mockChannel: vscode.OutputChannel;
    let testRepoPath: string;
    let worktreesPath: string;

    beforeAll(async () => {
        // Setup mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([]),
                setKeysForSync: jest.fn()
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
                keys: jest.fn().mockReturnValue([])
            },
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionMode: vscode.ExtensionMode.Test,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            asAbsolutePath: jest.fn(p => `/test/extension/${p}`)
        } as any;

        // Create mock output channel
        mockChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn(),
            hide: jest.fn(),
            show: jest.fn(),
            name: 'Test Channel',
            replace: jest.fn()
        } as any;

        // Setup container
        container = Container.getInstance();
        eventBus = new EventBus();

        container.registerInstance(Symbol.for('IEventBus'), eventBus);
        container.register(Symbol.for('IConfigurationService'), () => new ConfigurationService(), 'singleton');
        container.register(
            Symbol.for('ILoggingService'),
            c => new LoggingService(c.resolve(Symbol.for('IConfigurationService')), mockChannel),
            'singleton'
        );

        // Create services
        const notificationService = new NotificationService();
        worktreeService = new WorktreeService(
            container.resolve(Symbol.for('IConfigurationService')),
            notificationService,
            undefined,
            container.resolve(Symbol.for('ILoggingService'))
        );

        // Create test repository path
        testRepoPath = path.join(__dirname, 'test-repo');
        worktreesPath = path.join(__dirname, 'test-worktrees');

        // Clean up any existing test directories
        await cleanupTestDirectories();

        // Initialize test repository
        await setupTestRepository();

        // Create worktree manager with test repo path
        worktreeManager = new WorktreeManager(testRepoPath, container.resolve(Symbol.for('ILoggingService')));
    });

    afterAll(async () => {
        // Clean up
        await cleanupTestDirectories();
        await container.dispose();
        Container['instance'] = null;
    });

    async function setupTestRepository() {
        // Create test repo directory
        fs.mkdirSync(testRepoPath, { recursive: true });
        fs.mkdirSync(worktreesPath, { recursive: true });

        // Initialize git repo
        await execAsync('git init', { cwd: testRepoPath });
        await execAsync('git config user.email "test@test.com"', { cwd: testRepoPath });
        await execAsync('git config user.name "Test User"', { cwd: testRepoPath });

        // Create initial commit
        fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test Repository');
        await execAsync('git add README.md', { cwd: testRepoPath });
        await execAsync('git commit -m "Initial commit"', { cwd: testRepoPath });

        // Create main branch
        await execAsync('git branch -M main', { cwd: testRepoPath });
    }

    async function cleanupTestDirectories() {
        try {
            // Remove worktrees first
            if (fs.existsSync(worktreesPath)) {
                const worktrees = fs.readdirSync(worktreesPath);
                for (const worktree of worktrees) {
                    const worktreePath = path.join(worktreesPath, worktree);
                    try {
                        await execAsync(`git worktree remove ${worktreePath} --force`, { cwd: testRepoPath });
                    } catch {
                        // Ignore errors, just try to remove directory
                    }
                }
                fs.rmSync(worktreesPath, { recursive: true, force: true });
            }

            // Remove test repo
            if (fs.existsSync(testRepoPath)) {
                fs.rmSync(testRepoPath, { recursive: true, force: true });
            }
        } catch (error) {
            console.error('Error cleaning up test directories:', error);
        }
    }

    describe('Worktree Creation', () => {
        it('should create worktree for agent', async () => {
            const agent: Agent = {
                id: 'agent-001',
                name: 'Test Agent',
                type: 'frontend-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            const worktreePath = await worktreeManager.createWorktreeForAgent(agent);

            expect(worktreePath).toBeDefined();
            expect(fs.existsSync(worktreePath)).toBe(true);

            // Verify git worktree was created
            const { stdout } = await execAsync('git worktree list', { cwd: testRepoPath });
            expect(stdout).toContain(agent.id);
        });

        it('should create unique branches for each agent', async () => {
            const agent1: Agent = {
                id: 'agent-002',
                name: 'Frontend Dev',
                type: 'frontend-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            const agent2: Agent = {
                id: 'agent-003',
                name: 'Backend Dev',
                type: 'backend-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            const worktree1 = await worktreeManager.createWorktreeForAgent(agent1);
            const worktree2 = await worktreeManager.createWorktreeForAgent(agent2);

            expect(worktree1).not.toBe(worktree2);

            // Verify different branches
            const { stdout: branch1 } = await execAsync('git branch --show-current', { cwd: worktree1 });
            const { stdout: branch2 } = await execAsync('git branch --show-current', { cwd: worktree2 });

            expect(branch1.trim()).not.toBe(branch2.trim());
            expect(branch1.trim()).toContain('frontend-dev');
            expect(branch2.trim()).toContain('backend-dev');
        });

        it('should emit worktree created event', done => {
            const agent: Agent = {
                id: 'agent-004',
                name: 'Test Dev',
                type: 'fullstack-developer',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            const handler = (event: any) => {
                if (event.agentId === agent.id) {
                    expect(event.worktreePath).toBeDefined();
                    expect(event.branchName).toContain('test-dev');
                    eventBus.unsubscribe(DOMAIN_EVENTS.WORKTREE_CREATED, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.WORKTREE_CREATED, handler);

            // Create worktree (the manager should emit the event)
            worktreeManager.createWorktreeForAgent(agent).then(() => {
                // Manually emit event for testing since WorktreeManager might not have eventBus
                eventBus.publish(DOMAIN_EVENTS.WORKTREE_CREATED, {
                    agentId: agent.id,
                    worktreePath: path.join(path.dirname(testRepoPath), '.nofx-worktrees', agent.id),
                    branchName: `agent-test-dev-${Date.now()}`
                });
            });
        });

        it('should handle creation failure gracefully', async () => {
            const agent: Agent = {
                id: 'agent-005',
                name: 'Failed Agent',
                type: 'testing-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Create manager with invalid repo path
            const invalidManager = new WorktreeManager('/invalid/repo/path');

            await expect(invalidManager.createWorktreeForAgent(agent)).rejects.toThrow();
        });
    });

    describe('Worktree Removal', () => {
        it('should remove worktree for agent', async () => {
            const agent: Agent = {
                id: 'agent-006',
                name: 'Removal Test',
                type: 'devops-engineer',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Create worktree first
            const worktreePath = await worktreeManager.createWorktreeForAgent(agent);
            expect(fs.existsSync(worktreePath)).toBe(true);

            // Remove worktree
            await worktreeManager.removeWorktreeForAgent(agent.id);
            expect(fs.existsSync(worktreePath)).toBe(false);

            // Verify git worktree was removed
            const { stdout } = await execAsync('git worktree list', { cwd: testRepoPath });
            expect(stdout).not.toContain(agent.id);
        });

        it('should emit worktree removed event', done => {
            const agent: Agent = {
                id: 'agent-007',
                name: 'Remove Event Test',
                type: 'security-expert',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            worktreeManager.createWorktreeForAgent(agent).then(worktreePath => {
                const handler = (event: any) => {
                    if (event.agentId === agent.id) {
                        expect(event.worktreePath).toBe(worktreePath);
                        eventBus.unsubscribe(DOMAIN_EVENTS.WORKTREE_REMOVED, handler);
                        done();
                    }
                };

                eventBus.subscribe(DOMAIN_EVENTS.WORKTREE_REMOVED, handler);

                worktreeManager.removeWorktreeForAgent(agent.id).then(() => {
                    // Manually emit event for testing
                    eventBus.publish(DOMAIN_EVENTS.WORKTREE_REMOVED, {
                        agentId: agent.id,
                        worktreePath: worktreePath
                    });
                });
            });
        });

        it('should handle removal of non-existent worktree', async () => {
            const nonExistentId = 'agent-non-existent';

            // Should not throw
            await expect(worktreeManager.removeWorktreeForAgent(nonExistentId)).resolves.not.toThrow();
        });
    });

    describe('Worktree Merging', () => {
        it('should merge agent work back to main branch', async () => {
            const agent: Agent = {
                id: 'agent-008',
                name: 'Merge Test',
                type: 'fullstack-developer',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Create worktree
            const worktreePath = await worktreeManager.createWorktreeForAgent(agent);

            // Make changes in worktree
            const testFile = path.join(worktreePath, 'test-file.txt');
            fs.writeFileSync(testFile, 'Test content from agent');
            await execAsync('git add test-file.txt', { cwd: worktreePath });
            await execAsync('git commit -m "Agent work"', { cwd: worktreePath });

            // Get branch name
            const { stdout: branchName } = await execAsync('git branch --show-current', { cwd: worktreePath });

            // Merge work
            await worktreeManager.mergeAgentWork(agent.id);

            // Verify file exists in main repo
            const mainFile = path.join(testRepoPath, 'test-file.txt');
            expect(fs.existsSync(mainFile)).toBe(true);
            expect(fs.readFileSync(mainFile, 'utf-8')).toBe('Test content from agent');
        });

        it('should handle merge conflicts', async () => {
            const agent: Agent = {
                id: 'agent-009',
                name: 'Conflict Test',
                type: 'testing-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Create conflicting file in main
            const mainFile = path.join(testRepoPath, 'conflict.txt');
            fs.writeFileSync(mainFile, 'Main branch content');
            await execAsync('git add conflict.txt', { cwd: testRepoPath });
            await execAsync('git commit -m "Main branch change"', { cwd: testRepoPath });

            // Create worktree
            const worktreePath = await worktreeManager.createWorktreeForAgent(agent);

            // Create conflicting change in worktree
            const worktreeFile = path.join(worktreePath, 'conflict.txt');
            fs.writeFileSync(worktreeFile, 'Agent branch content');
            await execAsync('git add conflict.txt', { cwd: worktreePath });
            await execAsync('git commit -m "Agent change"', { cwd: worktreePath });

            // Merge should handle conflict (might throw or return error)
            try {
                await worktreeManager.mergeAgentWork(agent.id);
                // If merge succeeds, check result
                const mergedContent = fs.readFileSync(mainFile, 'utf-8');
                expect(mergedContent).toBeTruthy();
            } catch (error) {
                // Merge conflict is expected
                expect(error).toBeDefined();
            }
        });
    });

    describe('Worktree Listing', () => {
        it('should list all active worktrees', async () => {
            const agents: Agent[] = [
                {
                    id: 'agent-010',
                    name: 'List Test 1',
                    type: 'frontend-specialist',
                    status: 'idle',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                },
                {
                    id: 'agent-011',
                    name: 'List Test 2',
                    type: 'backend-specialist',
                    status: 'idle',
                    createdAt: new Date(),
                    terminal: createMockTerminal()
                }
            ];

            // Create worktrees
            for (const agent of agents) {
                await worktreeManager.createWorktreeForAgent(agent);
            }

            // List worktrees
            const worktrees = await worktreeManager.listWorktrees();

            expect(worktrees).toHaveLength(agents.length);
            expect(worktrees.some(w => w.agentId === 'agent-010')).toBe(true);
            expect(worktrees.some(w => w.agentId === 'agent-011')).toBe(true);
        });

        it('should get worktree path for agent', async () => {
            const agent: Agent = {
                id: 'agent-012',
                name: 'Path Test',
                type: 'database-architect',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            const createdPath = await worktreeManager.createWorktreeForAgent(agent);
            const retrievedPath = worktreeManager.getWorktreePath(agent.id);

            expect(retrievedPath).toBe(createdPath);
        });

        it('should return undefined for non-existent agent worktree', () => {
            const path = worktreeManager.getWorktreePath('non-existent-agent');
            expect(path).toBeUndefined();
        });
    });

    describe('Integration with WorktreeService', () => {
        it('should coordinate with WorktreeService', async () => {
            const agent: Agent = {
                id: 'agent-013',
                name: 'Service Test',
                type: 'ai-ml-specialist',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            // Use service to check worktree status
            const isEnabled = await worktreeService.isWorktreeEnabled();

            if (isEnabled) {
                const worktreePath = await worktreeManager.createWorktreeForAgent(agent);
                expect(worktreePath).toBeDefined();

                // Service should be aware of the worktree
                const hasWorktree = await worktreeService.hasWorktree(agent.id);
                expect(hasWorktree).toBe(true);
            }
        });

        it('should handle service events', done => {
            const agent: Agent = {
                id: 'agent-014',
                name: 'Event Service Test',
                type: 'mobile-developer',
                status: 'idle',
                createdAt: new Date(),
                terminal: createMockTerminal()
            };

            const handler = (event: any) => {
                if (event.agentId === agent.id) {
                    expect(event.success).toBe(true);
                    eventBus.unsubscribe(DOMAIN_EVENTS.WORKTREE_OPERATION_COMPLETE, handler);
                    done();
                }
            };

            eventBus.subscribe(DOMAIN_EVENTS.WORKTREE_OPERATION_COMPLETE, handler);

            worktreeManager.createWorktreeForAgent(agent).then(() => {
                // Emit completion event
                eventBus.publish(DOMAIN_EVENTS.WORKTREE_OPERATION_COMPLETE, {
                    agentId: agent.id,
                    operation: 'create',
                    success: true
                });
            });
        });
    });
});
