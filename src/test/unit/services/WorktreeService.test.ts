import * as vscode from 'vscode';
import { WorktreeService } from '../../../services/WorktreeService';
import { WorktreeManager } from '../../../worktrees/WorktreeManager';
import { createMockConfigurationService, createMockLoggingService, createMockEventBus, createMockNotificationService, createMockContainer, createMockExtensionContext, createMockOutputChannel, createMockTerminal, setupVSCodeMocks } from './../../helpers/mockFactories';


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

jest.mock('vscode');

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
        mockConfigService = createMockConfigurationService();
        jest.clearAllMocks();

        // Setup mock configuration service
        mockConfigService = createMockConfigurationService();

        // Setup mock logging service
        mockLoggingService = createMockLoggingService();

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
                value: [
                    {
                        uri: { fsPath: '/test/workspace with spaces & special-chars' },
                        name: 'special-workspace',
                        index: 0
                    }
                ],
                configurable: true
            });

            const available = worktreeService.isAvailable();

            expect(WorktreeManager.isWorktreeAvailable).toHaveBeenCalledWith(
                '/test/workspace with spaces & special-chars'
            );

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
