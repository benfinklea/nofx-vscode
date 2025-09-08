import * as vscode from 'vscode';
import { AgentTreeProvider } from '../../../views/AgentTreeProvider';
import { ITreeStateManager, IUIStateManager } from '../../../services/interfaces';
import { normalizeAgentStatus, normalizeTaskStatus } from '../../../types/ui';
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

// Mock VS Code API
jest.mock('vscode');

describe('AgentTreeProvider', () => {
    let provider: AgentTreeProvider;
    let mockTreeStateManager: jest.Mocked<ITreeStateManager>;
    let mockUIStateManager: jest.Mocked<IUIStateManager>;
    let mockRefreshFire: jest.Mock;
    let mockDisposables: vscode.Disposable[];

    beforeEach(() => {
        const mockWorkspace = { getConfiguration: jest.fn().mockReturnValue({ get: jest.fn(), update: jest.fn() }) };
        (global as any).vscode = { workspace: mockWorkspace };
        jest.clearAllMocks();
        mockDisposables = [];
        mockRefreshFire = jest.fn();

        // Mock TreeStateManager
        mockTreeStateManager = {
            getSectionItems: jest.fn(),
            isSectionExpanded: jest.fn(),
            setTeamName: jest.fn(),
            subscribe: jest.fn().mockImplementation(callback => {
                const disposable = { dispose: jest.fn() };
                mockDisposables.push(disposable);
                return disposable;
            })
        } as any;

        // Mock UIStateManager
        mockUIStateManager = {
            subscribe: jest.fn().mockImplementation(callback => {
                const disposable = { dispose: jest.fn() };
                mockDisposables.push(disposable);
                return disposable;
            })
        } as any;

        // Mock EventEmitter
        (vscode.EventEmitter as any) = jest.fn().mockImplementation(() => ({
            fire: mockRefreshFire,
            event: jest.fn(),
            dispose: jest.fn()
        }));

        // Mock ThemeIcon
        (vscode.ThemeIcon as any) = jest.fn().mockImplementation((icon: string) => ({ id: icon }));

        // Mock TreeItemCollapsibleState
        (vscode.TreeItemCollapsibleState as any) = {
            None: 0,
            Collapsed: 1,
            Expanded: 2
        };

        provider = new AgentTreeProvider(mockTreeStateManager, mockUIStateManager);
    });

    describe('constructor', () => {
        it('should subscribe to tree state manager changes', () => {
            expect(mockTreeStateManager.subscribe).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should subscribe to UI state manager changes', () => {
            expect(mockUIStateManager.subscribe).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should trigger refresh when tree state changes', () => {
            const callback = mockTreeStateManager.subscribe.mock.calls[0][0];
            callback();
            expect(mockRefreshFire).toHaveBeenCalled();
        });

        it('should trigger refresh when UI state changes', () => {
            const callback = mockUIStateManager.subscribe.mock.calls[0][0];
            callback();
            expect(mockRefreshFire).toHaveBeenCalled();
        });
    });

    describe('getChildren', () => {
        it('should return tree items from section data when no element provided', async () => {
            const mockData = {
                teamName: 'Development Team',
                agents: [{ id: 'agent-1', name: 'Frontend Dev', type: 'frontend', status: 'idle' }],
                tasks: [
                    { id: 'task-1', title: 'Build UI', status: 'in-progress', priority: 'high' },
                    { id: 'task-2', title: 'Setup API', status: 'queued', priority: 'medium' }
                ],
                hasData: true
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);
            mockTreeStateManager.isSectionExpanded.mockReturnValue(true);

            const children = await provider.getChildren();

            expect(children).toHaveLength(3); // TeamSection, Task section header, task items
            expect(children[0]).toHaveProperty('contextValue', 'teamSection');
        });

        it('should return agents when expanding team section', async () => {
            const teamSection = {
                agents: [
                    { id: 'agent-1', name: 'Frontend Dev' },
                    { id: 'agent-2', name: 'Backend Dev' }
                ]
            };

            const children = await provider.getChildren(teamSection as any);

            expect(children).toHaveLength(2);
            expect(children[0]).toHaveProperty('contextValue', 'agent');
            expect(children[1]).toHaveProperty('contextValue', 'agent');
        });

        it('should return empty array for other elements', async () => {
            const otherElement = { contextValue: 'other' };
            const children = await provider.getChildren(otherElement as any);
            expect(children).toEqual([]);
        });

        it('should show message when no data available', async () => {
            const mockData = {
                hasData: false,
                agents: [],
                tasks: []
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);

            const children = await provider.getChildren();

            expect(children).toHaveLength(1);
            expect(children[0]).toHaveProperty('contextValue', 'message');
        });

        it('should filter tasks by status correctly', async () => {
            const mockData = {
                agents: [],
                tasks: [
                    { id: 'task-1', title: 'Active Task', status: 'in-progress' },
                    { id: 'task-2', title: 'Assigned Task', status: 'assigned' },
                    { id: 'task-3', title: 'Queued Task', status: 'queued' },
                    { id: 'task-4', title: 'Completed Task', status: 'completed' }
                ],
                hasData: true
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);

            const children = await provider.getChildren();

            // Should have section header + active/assigned tasks + pending tasks
            // Completed tasks should be filtered out
            const taskItems = children.filter(c => c.contextValue === 'task');
            expect(taskItems).toHaveLength(3); // Active, Assigned, Queued (not Completed)
        });
    });

    describe('getTreeItem', () => {
        it('should return the element as-is', () => {
            const element = { label: 'Test Item' };
            const result = provider.getTreeItem(element as any);
            expect(result).toBe(element);
        });
    });

    describe('refresh', () => {
        it('should fire the change event', () => {
            provider.refresh();
            expect(mockRefreshFire).toHaveBeenCalled();
        });
    });

    describe('setTeamName', () => {
        it('should delegate to tree state manager', () => {
            provider.setTeamName('New Team Name');
            expect(mockTreeStateManager.setTeamName).toHaveBeenCalledWith('New Team Name');
        });
    });

    describe('dispose', () => {
        it('should dispose all subscriptions', () => {
            provider.dispose();

            mockDisposables.forEach(disposable => {
                expect(disposable.dispose).toHaveBeenCalled();
            });
        });
    });

    describe('TreeItem classes', () => {
        it('should create TeamSectionItem with correct properties', async () => {
            const mockData = {
                teamName: 'Dev Team',
                agents: [{ id: 'agent-1', name: 'Agent 1' }],
                tasks: [],
                hasData: true
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);
            mockTreeStateManager.isSectionExpanded.mockReturnValue(true);

            const children = await provider.getChildren();
            const teamSection = children[0];

            expect(teamSection).toMatchObject({
                contextValue: 'teamSection',
                tooltip: 'Dev Team (1 agents)',
                command: {
                    command: 'nofx.openConductorTerminal',
                    title: 'Open Conductor',
                    arguments: []
                }
            });
        });

        it('should create AgentItem with correct properties', async () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Frontend Dev',
                type: 'frontend',
                status: 'working',
                currentTask: { title: 'Building UI' }
            };

            const teamSection = { agents: [mockAgent] };
            const children = await provider.getChildren(teamSection as any);
            const agentItem = children[0];

            expect(agentItem).toMatchObject({
                contextValue: 'agent',
                command: {
                    command: 'nofx.focusAgentTerminal',
                    title: 'Focus Agent Terminal',
                    arguments: ['agent-1']
                }
            });
        });

        it('should create TaskItem with correct properties', async () => {
            const mockData = {
                agents: [],
                tasks: [
                    {
                        id: 'task-1',
                        title: 'Test Task',
                        status: 'in-progress',
                        priority: 'high',
                        description: 'Task description'
                    }
                ],
                hasData: true
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);

            const children = await provider.getChildren();
            // First item is section header, second is the task
            const taskItem = children.find(c => c.contextValue === 'task');

            expect(taskItem).toBeDefined();
            expect(taskItem).toMatchObject({
                contextValue: 'task'
            });
        });

        it('should use ThemeIcon for all items', async () => {
            const mockData = {
                teamName: 'Team',
                agents: [{ id: 'agent-1', name: 'Agent', status: 'idle' }],
                tasks: [],
                hasData: true
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);
            mockTreeStateManager.isSectionExpanded.mockReturnValue(true);

            await provider.getChildren();

            expect(vscode.ThemeIcon).toHaveBeenCalledWith('organization');
        });

        it('should handle agent status normalization', async () => {
            const mockAgent = {
                id: 'agent-1',
                name: 'Agent',
                status: 'BUSY', // Non-normalized status
                type: 'frontend'
            };

            const teamSection = { agents: [mockAgent] };
            const children = await provider.getChildren(teamSection as any);

            // Should normalize status internally
            expect(children[0]).toBeDefined();
            expect(vscode.ThemeIcon).toHaveBeenCalled();
        });

        it('should set correct collapsible state based on expansion', async () => {
            const mockData = {
                teamName: 'Team',
                agents: [{ id: 'agent-1' }],
                tasks: [],
                hasData: true
            };

            mockTreeStateManager.getSectionItems.mockReturnValue(mockData);

            // Test expanded state
            mockTreeStateManager.isSectionExpanded.mockReturnValue(true);
            let children = await provider.getChildren();
            expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // Test collapsed state
            mockTreeStateManager.isSectionExpanded.mockReturnValue(false);
            children = await provider.getChildren();
            expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });
    });
});
