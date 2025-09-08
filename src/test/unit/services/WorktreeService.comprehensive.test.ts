import * as vscode from 'vscode';
import { WorktreeService } from '../../../services/WorktreeService';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import {
    IConfigurationService,
    INotificationService,
    ILoggingService,
    IErrorHandler
} from '../../../services/interfaces';
import {
    createMockConfigurationService,
    createMockNotificationService,
    createMockLoggingService,
    createMockErrorHandler,
    setupVSCodeMocks
} from '../../helpers/mockFactories';

// Mock WorktreeManager static methods
jest.mock('../../../worktrees/WorktreeManager', () => ({
    WorktreeManager: jest.fn().mockImplementation(() => ({
        createWorktreeForAgent: jest.fn(),
        removeWorktreeForAgent: jest.fn(),
        mergeAgentWork: jest.fn(),
        getWorktreePath: jest.fn(),
        cleanupOrphanedWorktrees: jest.fn(),
        listWorktrees: jest.fn(),
        listWorktreesInfo: jest.fn(),
        getWorktreeStats: jest.fn()
    })),
    ...jest.requireActual('../../../worktrees/WorktreeManager')
}));

describe('WorktreeService - Comprehensive Tests', () => {
    let service: WorktreeService;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;
    let mockWorktreeManager: jest.Mocked<WorktreeManager>;
    let mockDisposable: vscode.Disposable;

    beforeEach(() => {
        setupVSCodeMocks();
        jest.clearAllMocks();

        // Setup mocks
        mockConfigService = createMockConfigurationService();
        mockNotificationService = createMockNotificationService();
        mockLoggingService = createMockLoggingService();
        mockErrorHandler = createMockErrorHandler();
        
        // Setup WorktreeManager mock
        mockWorktreeManager = new WorktreeManager('/test/workspace') as jest.Mocked<WorktreeManager>;
        
        // Default mock implementations
        mockConfigService.isUseWorktrees.mockReturnValue(true);
        mockConfigService.onDidChange.mockReturnValue({ dispose: jest.fn() });
        
        // Mock VS Code workspace
        (vscode.workspace as any).workspaceFolders = [{
            uri: { fsPath: '/test/workspace' },
            name: 'Test Workspace',
            index: 0
        }];
        
        // Mock WorktreeManager static method
        (WorktreeManager as any).isWorktreeAvailable = jest.fn().mockReturnValue(true);
        
        // Mock error handler to pass through
        mockErrorHandler.handleAsync.mockImplementation(async (fn) => {
            try {
                return await fn();
            } catch (error) {
                return undefined;
            }
        });
    });

    afterEach(() => {
        if (service) {
            service.dispose();
        }
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with worktrees enabled', () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );

            expect(mockConfigService.isUseWorktrees).toHaveBeenCalled();
            expect(mockConfigService.onDidChange).toHaveBeenCalled();
        });

        it('should initialize with worktrees disabled', () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService
            );

            expect(mockConfigService.isUseWorktrees).toHaveBeenCalled();
            expect(mockWorktreeManager.cleanupOrphanedWorktrees).not.toHaveBeenCalled();
        });

        it('should handle missing workspace folder', () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            expect(mockLoggingService?.debug).not.toHaveBeenCalled();
        });

        it('should handle missing worktree manager', () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                undefined,
                mockLoggingService
            );

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('WorktreeManager not available')
            );
        });

        it('should clean up orphaned worktrees on initialization', () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService
            );

            expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalled();
        });

        it('should show warning when git is not available', () => {
            (WorktreeManager as any).isWorktreeAvailable.mockReturnValue(false);

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService
            );

            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                expect.stringContaining('not a Git repository')
            );
        });

        it('should respond to configuration changes', () => {
            let configChangeCallback: any;
            mockConfigService.onDidChange.mockImplementation((callback) => {
                configChangeCallback = callback;
                return { dispose: jest.fn() };
            });

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService
            );

            // Initially disabled
            mockConfigService.isUseWorktrees.mockReturnValue(false);

            // Trigger config change
            configChangeCallback({
                affectsConfiguration: (key: string) => key === 'nofx.useWorktrees'
            });

            // Should re-initialize
            expect(mockConfigService.isUseWorktrees).toHaveBeenCalledTimes(2);
        });
    });

    describe('createForAgent', () => {
        beforeEach(() => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );
        });

        it('should create worktree for agent', async () => {
            const agent = {
                id: 'agent-1',
                name: 'Test Agent',
                type: 'frontend'
            };

            mockWorktreeManager.createWorktreeForAgent.mockResolvedValue('/test/.nofx-worktrees/agent-1');

            const result = await service.createForAgent(agent);

            expect(result).toBe('/test/.nofx-worktrees/agent-1');
            expect(mockWorktreeManager.createWorktreeForAgent).toHaveBeenCalledWith(agent);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Worktree created')
            );
        });

        it('should return undefined when worktrees disabled', async () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            
            // Re-create service with worktrees disabled
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );

            const result = await service.createForAgent({ id: 'agent-1' });

            expect(result).toBeUndefined();
            expect(mockWorktreeManager.createWorktreeForAgent).not.toHaveBeenCalled();
        });

        it('should return undefined when no worktree manager', async () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                undefined,
                mockLoggingService,
                mockErrorHandler
            );

            const result = await service.createForAgent({ id: 'agent-1' });

            expect(result).toBeUndefined();
        });

        it('should handle creation errors', async () => {
            mockWorktreeManager.createWorktreeForAgent.mockRejectedValue(
                new Error('Creation failed')
            );

            mockErrorHandler.handleAsync.mockImplementation(async (fn) => {
                try {
                    return await fn();
                } catch {
                    return undefined;
                }
            });

            const result = await service.createForAgent({ id: 'agent-1', name: 'Test' });

            expect(result).toBeUndefined();
            expect(mockErrorHandler.handleAsync).toHaveBeenCalled();
        });
    });

    describe('removeForAgent', () => {
        beforeEach(() => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );
        });

        it('should remove worktree without merging', async () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue('/test/.nofx-worktrees/agent-1');
            mockNotificationService.showInformation.mockResolvedValue('Remove Without Merging');

            const result = await service.removeForAgent('agent-1');

            expect(result).toBe(true);
            expect(mockWorktreeManager.removeWorktreeForAgent).toHaveBeenCalledWith('agent-1');
            expect(mockWorktreeManager.mergeAgentWork).not.toHaveBeenCalled();
        });

        it('should merge and remove worktree', async () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue('/test/.nofx-worktrees/agent-1');
            mockNotificationService.showInformation.mockResolvedValue('Merge & Remove');

            const result = await service.removeForAgent('agent-1');

            expect(result).toBe(true);
            expect(mockWorktreeManager.mergeAgentWork).toHaveBeenCalledWith('agent-1');
            expect(mockWorktreeManager.removeWorktreeForAgent).toHaveBeenCalledWith('agent-1');
        });

        it('should handle user cancellation', async () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue('/test/.nofx-worktrees/agent-1');
            mockNotificationService.showInformation.mockResolvedValue('Cancel');

            const result = await service.removeForAgent('agent-1');

            expect(result).toBe(false);
            expect(mockWorktreeManager.removeWorktreeForAgent).not.toHaveBeenCalled();
        });

        it('should return true when no worktree exists', async () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue(undefined);

            const result = await service.removeForAgent('agent-1');

            expect(result).toBe(true);
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        it('should return true when worktrees disabled', async () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );

            const result = await service.removeForAgent('agent-1');

            expect(result).toBe(true);
            expect(mockWorktreeManager.removeWorktreeForAgent).not.toHaveBeenCalled();
        });

        it('should handle removal errors', async () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue('/test/.nofx-worktrees/agent-1');
            mockNotificationService.showInformation.mockResolvedValue('Remove Without Merging');
            mockWorktreeManager.removeWorktreeForAgent.mockRejectedValue(
                new Error('Removal failed')
            );

            mockErrorHandler.handleAsync.mockImplementation(async (fn) => {
                try {
                    return await fn();
                } catch {
                    return false;
                }
            });

            const result = await service.removeForAgent('agent-1');

            expect(result).toBe(false);
        });
    });

    describe('mergeForAgent', () => {
        beforeEach(() => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );
        });

        it('should merge agent work', async () => {
            mockWorktreeManager.mergeAgentWork.mockResolvedValue(undefined);

            const result = await service.mergeForAgent('agent-1');

            expect(result).toBe(true);
            expect(mockWorktreeManager.mergeAgentWork).toHaveBeenCalledWith('agent-1');
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Worktree merged')
            );
        });

        it('should return true when worktrees disabled', async () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );

            const result = await service.mergeForAgent('agent-1');

            expect(result).toBe(true);
            expect(mockWorktreeManager.mergeAgentWork).not.toHaveBeenCalled();
        });

        it('should handle merge errors', async () => {
            mockWorktreeManager.mergeAgentWork.mockRejectedValue(
                new Error('Merge conflict')
            );

            mockErrorHandler.handleAsync.mockImplementation(async (fn) => {
                try {
                    return await fn();
                } catch {
                    return false;
                }
            });

            const result = await service.mergeForAgent('agent-1');

            expect(result).toBe(false);
        });
    });

    describe('getWorktreePath', () => {
        it('should return worktree path', () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue('/test/.nofx-worktrees/agent-1');
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            const result = service.getWorktreePath('agent-1');

            expect(result).toBe('/test/.nofx-worktrees/agent-1');
            expect(mockWorktreeManager.getWorktreePath).toHaveBeenCalledWith('agent-1');
        });

        it('should return undefined when no worktree manager', () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                undefined
            );

            const result = service.getWorktreePath('agent-1');

            expect(result).toBeUndefined();
        });

        it('should return undefined when worktree does not exist', () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue(undefined);
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            const result = service.getWorktreePath('non-existent');

            expect(result).toBeUndefined();
        });
    });

    describe('isAvailable', () => {
        it('should return true when worktrees available', () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            const result = service.isAvailable();

            expect(result).toBe(true);
        });

        it('should return false when worktrees disabled', () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            const result = service.isAvailable();

            expect(result).toBe(false);
        });

        it('should return false when git not available', () => {
            (WorktreeManager as any).isWorktreeAvailable.mockReturnValue(false);
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            const result = service.isAvailable();

            expect(result).toBe(false);
        });

        it('should return false when no workspace', () => {
            (vscode.workspace as any).workspaceFolders = undefined;
            
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            const result = service.isAvailable();

            expect(result).toBe(false);
        });
    });

    describe('cleanupOrphaned', () => {
        beforeEach(() => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );
        });

        it('should cleanup orphaned worktrees', async () => {
            mockWorktreeManager.cleanupOrphanedWorktrees.mockResolvedValue(undefined);

            await service.cleanupOrphaned();

            expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalled();
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                expect.stringContaining('Orphaned worktrees cleaned up')
            );
        });

        it('should handle missing worktree manager', async () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                undefined,
                mockLoggingService,
                mockErrorHandler
            );

            await service.cleanupOrphaned();

            expect(mockErrorHandler.handleAsync).not.toHaveBeenCalled();
        });

        it('should handle cleanup errors', async () => {
            mockWorktreeManager.cleanupOrphanedWorktrees.mockRejectedValue(
                new Error('Cleanup failed')
            );

            await service.cleanupOrphaned();

            expect(mockErrorHandler.handleAsync).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should dispose all resources', () => {
            const mockDispose = jest.fn();
            mockConfigService.onDidChange.mockReturnValue({ dispose: mockDispose });

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService
            );

            service.dispose();

            expect(mockDispose).toHaveBeenCalled();
        });

        it('should clear worktree manager reference', () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            service.dispose();

            // After disposal, getWorktreePath should return undefined
            const result = service.getWorktreePath('any-agent');
            expect(result).toBeUndefined();
        });

        it('should handle multiple dispose calls', () => {
            const mockDispose = jest.fn();
            mockConfigService.onDidChange.mockReturnValue({ dispose: mockDispose });

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager
            );

            service.dispose();
            service.dispose(); // Second call should not error

            expect(mockDispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle null error handler', async () => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                undefined // No error handler
            );

            const agent = { id: 'agent-1', name: 'Test' };
            mockWorktreeManager.createWorktreeForAgent.mockResolvedValue('/test/path');

            const result = await service.createForAgent(agent);

            // Should work without error handler
            expect(result).toBeUndefined(); // Because no error handler to pass through
        });

        it('should handle configuration service errors', () => {
            mockConfigService.isUseWorktrees.mockImplementation(() => {
                throw new Error('Config error');
            });

            expect(() => {
                service = new WorktreeService(
                    mockConfigService,
                    mockNotificationService,
                    mockWorktreeManager
                );
            }).toThrow('Config error');
        });

        it('should handle workspace folder with special characters', () => {
            (vscode.workspace as any).workspaceFolders = [{
                uri: { fsPath: '/test/work space/project@2024' },
                name: 'Special Project',
                index: 0
            }];

            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService
            );

            expect(WorktreeManager.isWorktreeAvailable).toHaveBeenCalledWith(
                '/test/work space/project@2024'
            );
        });
    });

    describe('Concurrent Operations', () => {
        beforeEach(() => {
            service = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );
        });

        it('should handle concurrent create operations', async () => {
            const agents = [
                { id: 'agent-1', name: 'Agent 1' },
                { id: 'agent-2', name: 'Agent 2' },
                { id: 'agent-3', name: 'Agent 3' }
            ];

            mockWorktreeManager.createWorktreeForAgent.mockImplementation(async (agent: any) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return `/test/.nofx-worktrees/${agent.id}`;
            });

            const results = await Promise.all(
                agents.map(agent => service.createForAgent(agent))
            );

            expect(results).toHaveLength(3);
            results.forEach((result, index) => {
                expect(result).toBe(`/test/.nofx-worktrees/agent-${index + 1}`);
            });
        });

        it('should handle concurrent remove operations', async () => {
            const agentIds = ['agent-1', 'agent-2', 'agent-3'];

            agentIds.forEach(id => {
                mockWorktreeManager.getWorktreePath.mockReturnValueOnce(`/test/.nofx-worktrees/${id}`);
            });
            mockNotificationService.showInformation.mockResolvedValue('Remove Without Merging');

            const results = await Promise.all(
                agentIds.map(id => service.removeForAgent(id))
            );

            expect(results).toEqual([true, true, true]);
            expect(mockWorktreeManager.removeWorktreeForAgent).toHaveBeenCalledTimes(3);
        });
    });
});