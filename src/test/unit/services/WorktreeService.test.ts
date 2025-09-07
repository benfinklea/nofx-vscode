import * as vscode from 'vscode';
import { WorktreeService } from '../../../services/WorktreeService';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';

// Mock interfaces for testing
interface IConfigurationService {
    isUseWorktrees(): boolean;
    onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;
}

interface INotificationService {
    showWarning(message: string): void;
    showInformation(message: string, ...buttons: string[]): Promise<string | undefined>;
}

interface ILoggingService {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, error?: any): void;
}

interface IErrorHandler {
    handleAsync<T>(operation: () => Promise<T>, context: string): Promise<T>;
}

// Mock VS Code API
const mockWorkspaceFolder = {
    uri: { fsPath: '/test/workspace' },
    name: 'test-workspace',
    index: 0
};

const mockDisposable = {
    dispose: jest.fn()
};

const mockConfigurationChangeEvent = {
    affectsConfiguration: jest.fn()
};

Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    value: [mockWorkspaceFolder],
    configurable: true
});

describe('WorktreeService', () => {
    let worktreeService: WorktreeService;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let mockNotificationService: jest.Mocked<INotificationService>;
    let mockWorktreeManager: jest.Mocked<WorktreeManager>;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockErrorHandler: jest.Mocked<IErrorHandler>;

    const mockAgent = {
        id: 'agent-123',
        name: 'Test Agent',
        type: 'frontend',
        status: 'active'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock configuration service
        mockConfigService = {
            isUseWorktrees: jest.fn().mockReturnValue(true),
            onDidChange: jest.fn().mockReturnValue(mockDisposable)
        };

        // Setup mock notification service
        mockNotificationService = {
            showWarning: jest.fn(),
            showInformation: jest.fn().mockResolvedValue('Merge & Remove')
        };

        // Setup mock worktree manager
        mockWorktreeManager = {
            createWorktreeForAgent: jest.fn().mockResolvedValue('/test/.nofx-worktrees/agent-123'),
            removeWorktreeForAgent: jest.fn().mockResolvedValue(undefined),
            mergeAgentWork: jest.fn().mockResolvedValue(undefined),
            getWorktreePath: jest.fn().mockReturnValue('/test/.nofx-worktrees/agent-123'),
            cleanupOrphanedWorktrees: jest.fn().mockResolvedValue(undefined),
            listWorktreesInfo: jest.fn().mockResolvedValue([]),
            listWorktrees: jest.fn().mockReturnValue([])
        } as any;

        // Setup mock logging service
        mockLoggingService = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        // Setup mock error handler
        mockErrorHandler = {
            handleAsync: jest.fn().mockImplementation((operation) => operation())
        };

        // Mock static method
        jest.spyOn(WorktreeManager, 'isWorktreeAvailable').mockReturnValue(true);

        worktreeService = new WorktreeService(
            mockConfigService,
            mockNotificationService,
            mockWorktreeManager,
            mockLoggingService,
            mockErrorHandler
        );
    });

    afterEach(() => {
        worktreeService?.dispose();
        jest.restoreAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with all dependencies', () => {
            expect(worktreeService).toBeInstanceOf(WorktreeService);
            expect(mockConfigService.onDidChange).toHaveBeenCalled();
            expect(mockConfigService.isUseWorktrees).toHaveBeenCalled();
        });

        it('should initialize without worktree manager', () => {
            const serviceWithoutManager = new WorktreeService(
                mockConfigService,
                mockNotificationService
            );

            expect(serviceWithoutManager).toBeInstanceOf(WorktreeService);
            serviceWithoutManager.dispose();
        });

        it('should handle workspace folder not available', () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [],
                configurable: true
            });

            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            expect(service).toBeInstanceOf(WorktreeService);
            service.dispose();

            // Restore workspace folders
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [mockWorkspaceFolder],
                configurable: true
            });
        });

        it('should register configuration change listener', () => {
            expect(mockConfigService.onDidChange).toHaveBeenCalled();

            // Simulate configuration change
            const changeHandler = mockConfigService.onDidChange.mock.calls[0][0];
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(true);

            changeHandler(mockConfigurationChangeEvent);

            expect(mockConfigurationChangeEvent.affectsConfiguration).toHaveBeenCalledWith('nofx.useWorktrees');
        });

        it('should ignore non-worktree configuration changes', () => {
            const changeHandler = mockConfigService.onDidChange.mock.calls[0][0];
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(false);

            changeHandler(mockConfigurationChangeEvent);

            expect(mockConfigurationChangeEvent.affectsConfiguration).toHaveBeenCalledWith('nofx.useWorktrees');
            // Should not trigger reinitialization
        });

        it('should handle worktrees disabled', () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);

            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            expect(service.isAvailable()).toBe(false);
            service.dispose();
        });

        it('should warn when worktrees not available in repository', () => {
            jest.spyOn(WorktreeManager, 'isWorktreeAvailable').mockReturnValue(false);

            new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                'Git worktrees requested but not available in this repository'
            );
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                'Git worktrees are enabled but this is not a Git repository. Agents will use the main workspace.'
            );
        });

        it('should cleanup orphaned worktrees on initialization', () => {
            expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalled();
        });

        it('should handle missing worktree manager gracefully', () => {
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                undefined,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                'WorktreeManager not available, skipping worktree initialization'
            );
            service.dispose();
        });
    });

    describe('createForAgent', () => {
        it('should create worktree for agent successfully', async () => {
            const worktreePath = await worktreeService.createForAgent(mockAgent);

            expect(worktreePath).toBe('/test/.nofx-worktrees/agent-123');
            expect(mockWorktreeManager.createWorktreeForAgent).toHaveBeenCalledWith(mockAgent);
            expect(mockLoggingService.debug).toHaveBeenCalledWith(
                `Worktree created for agent ${mockAgent.name}: /test/.nofx-worktrees/agent-123`
            );
        });

        it('should return undefined when worktrees disabled', async () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const worktreePath = await service.createForAgent(mockAgent);

            expect(worktreePath).toBeUndefined();
            expect(mockWorktreeManager.createWorktreeForAgent).not.toHaveBeenCalled();
            service.dispose();
        });

        it('should return undefined when no worktree manager', async () => {
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                undefined,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const worktreePath = await service.createForAgent(mockAgent);

            expect(worktreePath).toBeUndefined();
            service.dispose();
        });

        it('should handle error during worktree creation', async () => {
            const error = new Error('Git worktree creation failed');
            mockErrorHandler.handleAsync.mockRejectedValue(error);

            const worktreePath = await worktreeService.createForAgent(mockAgent);

            expect(worktreePath).toBeUndefined();
            expect(mockErrorHandler.handleAsync).toHaveBeenCalledWith(
                expect.any(Function),
                `Failed to create worktree for ${mockAgent.name}`
            );
        });

        it('should handle error handler returning undefined', async () => {
            mockErrorHandler.handleAsync.mockResolvedValue(undefined);

            const worktreePath = await worktreeService.createForAgent(mockAgent);

            expect(worktreePath).toBeUndefined();
        });

        it('should handle complex agent names', async () => {
            const complexAgent = {
                ...mockAgent,
                name: 'Complex Agent Name With Spaces & Special-Characters'
            };

            await worktreeService.createForAgent(complexAgent);

            expect(mockWorktreeManager.createWorktreeForAgent).toHaveBeenCalledWith(complexAgent);
            expect(mockLoggingService.debug).toHaveBeenCalled();
        });
    });

    describe('removeForAgent', () => {
        it('should remove worktree with merge confirmation', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Merge & Remove');

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(true);
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith(
                'Agent has a worktree. Merge changes before removing?',
                'Merge & Remove', 'Remove Without Merging', 'Cancel'
            );
            expect(mockWorktreeManager.mergeAgentWork).toHaveBeenCalledWith('agent-123');
            expect(mockWorktreeManager.removeWorktreeForAgent).toHaveBeenCalledWith('agent-123');
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Worktree merged for agent agent-123');
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Worktree removed for agent agent-123');
        });

        it('should remove worktree without merging', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Remove Without Merging');

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(true);
            expect(mockWorktreeManager.mergeAgentWork).not.toHaveBeenCalled();
            expect(mockWorktreeManager.removeWorktreeForAgent).toHaveBeenCalledWith('agent-123');
        });

        it('should handle user cancellation', async () => {
            mockNotificationService.showInformation.mockResolvedValue('Cancel');

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(false);
            expect(mockWorktreeManager.mergeAgentWork).not.toHaveBeenCalled();
            expect(mockWorktreeManager.removeWorktreeForAgent).not.toHaveBeenCalled();
        });

        it('should handle undefined user response', async () => {
            mockNotificationService.showInformation.mockResolvedValue(undefined);

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(false);
        });

        it('should return true when worktrees disabled', async () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const result = await service.removeForAgent('agent-123');

            expect(result).toBe(true);
            service.dispose();
        });

        it('should return true when no worktree manager', async () => {
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                undefined,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const result = await service.removeForAgent('agent-123');

            expect(result).toBe(true);
            service.dispose();
        });

        it('should return true when no worktree exists', async () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue(undefined);

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(true);
            expect(mockNotificationService.showInformation).not.toHaveBeenCalled();
        });

        it('should handle error during removal', async () => {
            mockErrorHandler.handleAsync.mockResolvedValue(false);

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(false);
            expect(mockErrorHandler.handleAsync).toHaveBeenCalledWith(
                expect.any(Function),
                'Error removing worktree for agent agent-123'
            );
        });

        it('should handle error handler returning undefined', async () => {
            mockErrorHandler.handleAsync.mockResolvedValue(undefined);

            const result = await worktreeService.removeForAgent('agent-123');

            expect(result).toBe(false);
        });
    });

    describe('mergeForAgent', () => {
        it('should merge agent work successfully', async () => {
            const result = await worktreeService.mergeForAgent('agent-123');

            expect(result).toBe(true);
            expect(mockWorktreeManager.mergeAgentWork).toHaveBeenCalledWith('agent-123');
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Worktree merged for agent agent-123');
        });

        it('should return true when worktrees disabled', async () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const result = await service.mergeForAgent('agent-123');

            expect(result).toBe(true);
            service.dispose();
        });

        it('should return true when no worktree manager', async () => {
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                undefined,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const result = await service.mergeForAgent('agent-123');

            expect(result).toBe(true);
            service.dispose();
        });

        it('should handle error during merge', async () => {
            mockErrorHandler.handleAsync.mockResolvedValue(false);

            const result = await worktreeService.mergeForAgent('agent-123');

            expect(result).toBe(false);
            expect(mockErrorHandler.handleAsync).toHaveBeenCalledWith(
                expect.any(Function),
                'Error merging agent work'
            );
        });

        it('should handle error handler returning undefined', async () => {
            mockErrorHandler.handleAsync.mockResolvedValue(undefined);

            const result = await worktreeService.mergeForAgent('agent-123');

            expect(result).toBe(false);
        });
    });

    describe('getWorktreePath', () => {
        it('should return worktree path when available', () => {
            const path = worktreeService.getWorktreePath('agent-123');

            expect(path).toBe('/test/.nofx-worktrees/agent-123');
            expect(mockWorktreeManager.getWorktreePath).toHaveBeenCalledWith('agent-123');
        });

        it('should return undefined when no worktree manager', () => {
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                undefined,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const path = service.getWorktreePath('agent-123');

            expect(path).toBeUndefined();
            service.dispose();
        });

        it('should return undefined when worktree not found', () => {
            mockWorktreeManager.getWorktreePath.mockReturnValue(undefined);

            const path = worktreeService.getWorktreePath('nonexistent-agent');

            expect(path).toBeUndefined();
        });
    });

    describe('isAvailable', () => {
        it('should return true when worktrees enabled and available', () => {
            const available = worktreeService.isAvailable();

            expect(available).toBe(true);
        });

        it('should return false when worktrees disabled', () => {
            mockConfigService.isUseWorktrees.mockReturnValue(false);
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            const available = service.isAvailable();

            expect(available).toBe(false);
            service.dispose();
        });

        it('should return false when no workspace folder', () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [],
                configurable: true
            });

            const available = worktreeService.isAvailable();

            expect(available).toBe(false);

            // Restore workspace folders
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [mockWorkspaceFolder],
                configurable: true
            });
        });

        it('should return false when git worktrees not available', () => {
            jest.spyOn(WorktreeManager, 'isWorktreeAvailable').mockReturnValue(false);

            const available = worktreeService.isAvailable();

            expect(available).toBe(false);
        });

        it('should handle workspace folder undefined', () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });

            const available = worktreeService.isAvailable();

            expect(available).toBe(false);

            // Restore workspace folders
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [mockWorkspaceFolder],
                configurable: true
            });
        });
    });

    describe('cleanupOrphaned', () => {
        it('should cleanup orphaned worktrees successfully', async () => {
            await worktreeService.cleanupOrphaned();

            expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalled();
            expect(mockLoggingService.debug).toHaveBeenCalledWith('Orphaned worktrees cleaned up');
        });

        it('should handle no worktree manager', async () => {
            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                undefined,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            await service.cleanupOrphaned();

            // Should not throw or call any methods
            expect(mockLoggingService.debug).not.toHaveBeenCalledWith('Orphaned worktrees cleaned up');
            service.dispose();
        });

        it('should handle errors during cleanup', async () => {
            const error = new Error('Cleanup failed');
            mockErrorHandler.handleAsync.mockRejectedValue(error);

            await worktreeService.cleanupOrphaned();

            expect(mockErrorHandler.handleAsync).toHaveBeenCalledWith(
                expect.any(Function),
                'Error cleaning up orphaned worktrees'
            );
        });

        it('should handle error handler returning undefined', async () => {
            mockErrorHandler.handleAsync.mockResolvedValue(undefined);

            await worktreeService.cleanupOrphaned();

            expect(mockErrorHandler.handleAsync).toHaveBeenCalled();
        });
    });

    describe('configuration changes', () => {
        it('should reinitialize when worktree configuration changes', () => {
            const originalCleanup = mockWorktreeManager.cleanupOrphanedWorktrees;
            mockWorktreeManager.cleanupOrphanedWorktrees = jest.fn().mockResolvedValue(undefined);

            const changeHandler = mockConfigService.onDidChange.mock.calls[0][0];
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(true);

            changeHandler(mockConfigurationChangeEvent);

            expect(mockConfigService.isUseWorktrees).toHaveBeenCalledTimes(2); // Initial + change
            expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalledTimes(2); // Initial + change

            mockWorktreeManager.cleanupOrphanedWorktrees = originalCleanup;
        });

        it('should handle configuration change when worktrees become disabled', () => {
            mockConfigService.isUseWorktrees.mockReturnValueOnce(true).mockReturnValueOnce(false);

            const changeHandler = mockConfigService.onDidChange.mock.calls[0][0];
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(true);

            changeHandler(mockConfigurationChangeEvent);

            expect(worktreeService.isAvailable()).toBe(false);
        });

        it('should handle configuration change when worktrees become enabled', () => {
            mockConfigService.isUseWorktrees.mockReturnValueOnce(false).mockReturnValueOnce(true);

            const service = new WorktreeService(
                mockConfigService as IConfigurationService,
                mockNotificationService as INotificationService,
                mockWorktreeManager,
                mockLoggingService as ILoggingService,
                mockErrorHandler as IErrorHandler
            );

            expect(service.isAvailable()).toBe(false);

            const changeHandler = mockConfigService.onDidChange.mock.calls[1][0];
            mockConfigurationChangeEvent.affectsConfiguration.mockReturnValue(true);

            changeHandler(mockConfigurationChangeEvent);

            expect(service.isAvailable()).toBe(true);
            service.dispose();
        });
    });

    describe('resource management', () => {
        it('should dispose all resources correctly', () => {
            worktreeService.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should handle disposal when no disposables', () => {
            const service = new WorktreeService(
                mockConfigService,
                mockNotificationService
            );

            expect(() => service.dispose()).not.toThrow();
        });

        it('should clear worktree manager on disposal', () => {
            worktreeService.dispose();

            // Subsequent operations should handle missing manager gracefully
            expect(worktreeService.getWorktreePath('test')).toBeUndefined();
        });

        it('should be safe to dispose multiple times', () => {
            worktreeService.dispose();

            expect(() => worktreeService.dispose()).not.toThrow();
            expect(mockDisposable.dispose).toHaveBeenCalledTimes(1); // Should not be called again
        });
    });

    describe('edge cases', () => {
        it('should handle agent with undefined properties', async () => {
            const malformedAgent = { id: undefined, name: undefined } as any;

            const worktreePath = await worktreeService.createForAgent(malformedAgent);

            expect(mockWorktreeManager.createWorktreeForAgent).toHaveBeenCalledWith(malformedAgent);
        });

        it('should handle empty agent ID', async () => {
            const result = await worktreeService.removeForAgent('');

            expect(mockWorktreeManager.getWorktreePath).toHaveBeenCalledWith('');
        });

        it('should handle null agent ID gracefully', async () => {
            const result = await worktreeService.removeForAgent(null as any);

            expect(mockWorktreeManager.getWorktreePath).toHaveBeenCalledWith(null);
        });

        it('should handle concurrent operations', async () => {
            const promises = [
                worktreeService.createForAgent(mockAgent),
                worktreeService.mergeForAgent('agent-123'),
                worktreeService.removeForAgent('agent-456')
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            expect(mockWorktreeManager.createWorktreeForAgent).toHaveBeenCalled();
            expect(mockWorktreeManager.mergeAgentWork).toHaveBeenCalled();
        });

        it('should handle workspace folder with special characters', () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [{
                    uri: { fsPath: '/test/workspace with spaces & special-chars' },
                    name: 'special-workspace',
                    index: 0
                }],
                configurable: true
            });

            const available = worktreeService.isAvailable();

            expect(WorktreeManager.isWorktreeAvailable).toHaveBeenCalledWith('/test/workspace with spaces & special-chars');

            // Restore workspace folders
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [mockWorkspaceFolder],
                configurable: true
            });
        });
    });

    describe('integration scenarios', () => {
        it('should handle full agent lifecycle', async () => {
            // Create worktree
            const worktreePath = await worktreeService.createForAgent(mockAgent);
            expect(worktreePath).toBeDefined();

            // Check availability
            expect(worktreeService.isAvailable()).toBe(true);

            // Get path
            const path = worktreeService.getWorktreePath(mockAgent.id);
            expect(path).toBeDefined();

            // Merge work
            const mergeResult = await worktreeService.mergeForAgent(mockAgent.id);
            expect(mergeResult).toBe(true);

            // Remove worktree
            const removeResult = await worktreeService.removeForAgent(mockAgent.id);
            expect(removeResult).toBe(true);
        });

        it('should handle multiple agents simultaneously', async () => {
            const agents = [
                { id: 'agent-1', name: 'Agent 1', type: 'frontend' },
                { id: 'agent-2', name: 'Agent 2', type: 'backend' },
                { id: 'agent-3', name: 'Agent 3', type: 'testing' }
            ];

            const createPromises = agents.map(agent => worktreeService.createForAgent(agent));
            const paths = await Promise.all(createPromises);

            expect(paths).toHaveLength(3);
            paths.forEach(path => expect(path).toBeDefined());
        });

        it('should handle service restart scenario', () => {
            // Dispose original service
            worktreeService.dispose();

            // Create new service instance
            const newService = new WorktreeService(
                mockConfigService,
                mockNotificationService,
                mockWorktreeManager,
                mockLoggingService,
                mockErrorHandler
            );

            expect(newService.isAvailable()).toBe(true);
            newService.dispose();
        });
    });
});
