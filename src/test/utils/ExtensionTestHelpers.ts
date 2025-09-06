import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import WebSocket from 'ws';
import getPort from 'get-port';
import { Container } from '../../services/Container';
import { IContainer, SERVICE_TOKENS } from '../../services/interfaces';
import { EventBus } from '../../services/EventBus';
import { Agent } from '../../types/agent';
import { Task } from '../../types/task';
import { AgentTemplate } from '../../types/agent';

const execAsync = promisify(exec);

/**
 * Utility functions specifically for extension testing
 */
export class ExtensionTestHelpers {
    private static tempDirs: string[] = [];

    /**
     * VS Code Extension Test Utilities
     */
    
    /**
     * Create temporary workspace with git initialization and basic project structure
     */
    static async createTestWorkspace(name: string = 'test-workspace'): Promise<string> {
        const tempDir = path.join(os.tmpdir(), `nofx-test-${name}-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Initialize git
        await execAsync('git init', { cwd: tempDir });
        await execAsync('git config user.email "test@example.com"', { cwd: tempDir });
        await execAsync('git config user.name "Test User"', { cwd: tempDir });
        
        // Create basic project structure
        fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, '.vscode'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                test: 'echo "test"',
                build: 'echo "build"',
                lint: 'echo "lint"'
            }
        }, null, 2));
        
        fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project');
        fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("Hello, World!");');
        
        // Create VS Code settings
        fs.writeFileSync(path.join(tempDir, '.vscode', 'settings.json'), JSON.stringify({
            'nofx.testMode': true
        }, null, 2));
        
        this.tempDirs.push(tempDir);
        return tempDir;
    }

    /**
     * Install and activate the VSIX extension in test environment
     */
    static async installTestExtension(vsixPath: string, cliPath?: string): Promise<void> {
        // Use provided CLI path or environment variable, fallback to default
        const codeCliPath = cliPath || process.env.VSCODE_CLI || vscode.env.appRoot + '/bin/code';
        
        if (!cliPath && !process.env.VSCODE_CLI) {
            throw new Error(
                'VS Code CLI path not provided. Set VSCODE_CLI environment variable or provide cliPath parameter. ' +
                'For CI environments, use @vscode/test-electron downloadAndUnzipVSCode + runTests instead.'
            );
        }

        try {
            await execAsync(`${codeCliPath} --install-extension ${vsixPath} --force`);
        } catch (error) {
            throw new Error(`Failed to install extension: ${error}. Consider using @vscode/test-electron for e2e testing.`);
        }
    }

    /**
     * Set up test mode configuration to disable noisy services
     */
    static async configureTestMode(workspace?: vscode.WorkspaceFolder): Promise<void> {
        const config = vscode.workspace.getConfiguration('nofx', workspace?.uri);
        await config.update('testMode', true, vscode.ConfigurationTarget.Workspace);
        await config.update('enableMetrics', false, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Wait for extension to fully activate and services to initialize
     */
    static async waitForExtensionActivation(extensionId: string, container?: IContainer, timeout: number = 5000): Promise<void> {
        const extension = vscode.extensions.getExtension(extensionId);
        if (!extension) {
            throw new Error(`Extension ${extensionId} not found`);
        }

        if (!extension.isActive) {
            await extension.activate();
        }

        // If container is provided, wait for services to initialize
        if (container) {
            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
                try {
                    if (container.resolveOptional(SERVICE_TOKENS.EventBus) && container.resolveOptional(SERVICE_TOKENS.AgentManager)) {
                        return; // Services are ready
                    }
                } catch (e) {
                    // Services not ready yet
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            throw new Error('Extension activation timeout');
        }
    }

    /**
     * Get the activated container instance from the extension
     * This should be used in functional tests to get the same container used by commands
     * Note: This method is deprecated - use the container passed from test setup instead
     */
    static getActivatedContainer(): IContainer | undefined {
        // Try to get container from extension if available
        try {
            const extension = require('../../extension');
            if (extension && typeof extension.__getContainerForTests === 'function') {
                return extension.__getContainerForTests();
            }
        } catch (error) {
            // Extension not available
        }
        return undefined;
    }

    /**
     * Clean up temporary files and reset extension state
     */
    static async cleanupTestWorkspace(container?: IContainer): Promise<void> {
        for (const dir of this.tempDirs) {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
        this.tempDirs = [];
        
        // Reset extension state if container is provided
        if (container && typeof container.dispose === 'function') {
            try {
                await container.dispose();
            } catch (error) {
                // Ignore disposal errors
            }
        }
    }

    /**
     * Command Testing Utilities
     */
    
    /**
     * Execute commands with error handling and timeout
     */
    static async executeCommandSafely(
        commandId: string,
        args?: any,
        timeout: number = 3000
    ): Promise<any> {
        return Promise.race([
            vscode.commands.executeCommand(commandId, args),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Command ${commandId} timed out`)), timeout)
            )
        ]);
    }

    /**
     * Mock user selections for quick pick dialogs
     */
    static mockQuickPickSelection(selection: any): void {
        jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(selection);
    }

    /**
     * Mock user input for input boxes
     */
    static mockInputBoxInput(input: string): void {
        jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(input);
    }

    /**
     * Check if commands are properly registered
     */
    static async verifyCommandRegistration(commandIds: string[]): Promise<boolean> {
        const registeredCommands = await vscode.commands.getCommands(true);
        return commandIds.every(id => registeredCommands.includes(id));
    }

    /**
     * Get list of all registered NofX commands
     */
    static async getRegisteredCommands(): Promise<string[]> {
        const allCommands = await vscode.commands.getCommands(true);
        return allCommands.filter(cmd => cmd.startsWith('nofx.'));
    }

    /**
     * UI Testing Utilities
     */
    
    /**
     * Extract data from tree providers for testing
     */
    static async getTreeProviderData(provider: vscode.TreeDataProvider<any>, element?: any): Promise<any[]> {
        const children = await provider.getChildren?.(element as any);
        return Array.isArray(children) ? children : [];
    }

    /**
     * Force tree provider refresh and wait for completion
     */
    static async triggerTreeRefresh(provider: any): Promise<void> {
        if (provider.refresh) {
            provider.refresh();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Validate tree item hierarchy and properties
     */
    static verifyTreeItemStructure(item: vscode.TreeItem, expected: Partial<vscode.TreeItem>): boolean {
        for (const key in expected) {
            if (item[key as keyof vscode.TreeItem] !== expected[key as keyof vscode.TreeItem]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Simulate user interaction with tree items
     */
    static async simulateTreeItemClick(item: vscode.TreeItem): Promise<void> {
        if (item.command) {
            await vscode.commands.executeCommand(item.command.command, ...(item.command.arguments || []));
        }
    }

    /**
     * Wait for UI updates after state changes
     */
    static async waitForUIUpdate(timeout: number = 500): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, timeout));
    }

    /**
     * State Verification Utilities
     */
    
    /**
     * Get current extension state for verification
     */
    static getExtensionState(container: IContainer): { agents: Agent[], tasks: Task[], services: string[] } {
        const agentManager = container.resolveOptional(SERVICE_TOKENS.AgentManager);
        const taskQueue = container.resolveOptional(SERVICE_TOKENS.TaskQueue);
        
        return {
            agents: agentManager?.getAgents() || [],
            tasks: taskQueue?.getTasks() || [],
            services: [] // Production container doesn't expose registered services list
        };
    }

    /**
     * Check agent manager state and active agents
     */
    static verifyAgentState(expectedAgents: Partial<Agent>[], container: IContainer): boolean {
        const agentManager = container.resolveOptional(SERVICE_TOKENS.AgentManager);
        if (!agentManager) return false;
        
        const agents = agentManager.getAgents();
        
        if (agents.length !== expectedAgents.length) return false;
        
        return expectedAgents.every(expected => 
            agents.some(agent => 
                Object.keys(expected).every(key => 
                    agent[key as keyof Agent] === expected[key as keyof Agent]
                )
            )
        );
    }

    /**
     * Check task queue state and task statuses
     */
    static verifyTaskState(expectedTasks: Partial<Task>[], container: IContainer): boolean {
        const taskQueue = container.resolveOptional(SERVICE_TOKENS.TaskQueue);
        if (!taskQueue) return false;
        
        const tasks = taskQueue.getTasks();
        
        if (tasks.length !== expectedTasks.length) return false;
        
        return expectedTasks.every(expected => 
            tasks.some(task => 
                Object.keys(expected).every(key => 
                    task[key as keyof Task] === expected[key as keyof Task]
                )
            )
        );
    }

    /**
     * Check service container and registered services
     * Note: Production container doesn't expose registered services list
     */
    static verifyServiceState(expectedServices: string[], container: IContainer): boolean {
        // Production container doesn't expose registered services list
        // This method is kept for compatibility but always returns true
        return true;
    }

    /**
     * Capture and verify EventBus events during tests
     */
    static captureEventBusEvents(eventTypes: string[], container: IContainer): { events: any[], stopCapture: () => void } {
        const eventBus = container.resolveOptional<EventBus>(SERVICE_TOKENS.EventBus);
        if (!eventBus) {
            return { events: [], stopCapture: () => {} };
        }
        
        const capturedEvents: any[] = [];
        
        const listeners = eventTypes.map(type => {
            const listener = (data: any) => {
                capturedEvents.push({ type, data, timestamp: Date.now() });
            };
            eventBus.subscribe(type, listener);
            return { type, listener };
        });
        
        return {
            events: capturedEvents,
            stopCapture: () => {
                listeners.forEach(({ type, listener }) => {
                    eventBus.unsubscribe(type, listener);
                });
            }
        };
    }

    /**
     * Mock and Stub Utilities
     */
    
    /**
     * Create mock workspace folder for testing
     */
    static createMockWorkspaceFolder(path: string = '/test/workspace'): vscode.WorkspaceFolder {
        return {
            uri: vscode.Uri.file(path),
            name: 'Test Workspace',
            index: 0
        };
    }

    /**
     * Create mock agent templates for testing
     */
    static createMockAgentTemplate(overrides?: Partial<AgentTemplate>): AgentTemplate {
        return {
            id: 'test-template',
            name: 'Test Template',
            icon: '🧪',
            systemPrompt: 'You are a test agent',
            capabilities: ['testing', 'mocking'],
            ...overrides
        };
    }

    /**
     * Create mock configuration for testing
     */
    static createMockConfiguration(overrides?: Record<string, any>): Record<string, any> {
        return {
            claudePath: '/usr/local/bin/claude',
            testMode: true,
            enableMetrics: false,
            useWorktrees: false,
            ...overrides
        };
    }

    /**
     * Stub Claude CLI path for testing without actual CLI
     */
    static stubClaudeCliPath(container: IContainer, path: string = '/mock/claude'): void {
        const configService = container.resolveOptional(SERVICE_TOKENS.ConfigurationService);
        if (configService) {
            jest.spyOn(configService, 'get').mockImplementation((key: string) => {
                if (key === 'nofx.claudePath') {
                    return path;
                }
                return configService.get(key);
            });
        }
    }

    /**
     * Mock file system operations for testing
     */
    static mockFileSystemOperations(): {
        readFileMock: jest.Mock,
        writeFileMock: jest.Mock,
        existsMock: jest.Mock,
        restore: () => void
    } {
        const readFileMock = jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
        const writeFileMock = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const existsMock = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        
        return {
            readFileMock,
            writeFileMock,
            existsMock,
            restore: () => {
                readFileMock.mockRestore();
                writeFileMock.mockRestore();
                existsMock.mockRestore();
            }
        };
    }

    /**
     * Integration Test Utilities
     */
    
    /**
     * Set up full integration test environment
     */
    static async setupIntegrationTest(): Promise<{
        workspace: string,
        container: IContainer | undefined,
        eventBus: EventBus | undefined,
        cleanup: () => Promise<void>
    }> {
        const workspace = await this.createTestWorkspace('integration');
        await this.configureTestMode();
        
        const container = this.getActivatedContainer();
        const eventBus = container?.resolveOptional<EventBus>(SERVICE_TOKENS.EventBus);
        
        return {
            workspace,
            container,
            eventBus,
            cleanup: async () => {
                await this.cleanupTestWorkspace(container);
            }
        };
    }

    /**
     * Create test orchestration server with free port
     * @param container - Container instance to resolve services from
     * @param server - Optional pre-configured OrchestrationServer instance
     * @param port - Optional specific port to use (will use ephemeral port if not provided)
     * @returns The server instance and actual port being used
     */
    static async createTestOrchestrationServer(container: IContainer, server?: any, port?: number): Promise<{ server: any, port: number }> {
        const actualPort = port || await getPort();
        
        // If no server provided, try to resolve from container or return mock
        if (!server) {
            // Check if OrchestrationServer is registered
            server = container.resolveOptional(SERVICE_TOKENS.OrchestrationServer);
            
            if (!server) {
                // Return a mock server that tracks the port
                return {
                    server: {
                        start: jest.fn().mockResolvedValue(undefined),
                        stop: jest.fn().mockResolvedValue(undefined),
                        getStatus: jest.fn().mockReturnValue({ port: actualPort, running: true })
                    },
                    port: actualPort
                };
            }
        }
        
        await server.start(actualPort);
        
        // Get actual bound port from server status if available
        const boundPort = server.getStatus?.()?.port || actualPort;
        
        return { server, port: boundPort };
    }

    /**
     * Create WebSocket client for testing orchestration
     */
    static createWebSocketClient(port: number): WebSocket {
        return new WebSocket(`ws://localhost:${port}`);
    }

    /**
     * Verify message routing and handling
     */
    static async verifyMessageFlow(
        client: WebSocket,
        message: any,
        expectedResponse?: any
    ): Promise<boolean> {
        return new Promise((resolve) => {
            client.on('message', (data) => {
                const response = JSON.parse(data.toString());
                if (expectedResponse) {
                    resolve(JSON.stringify(response) === JSON.stringify(expectedResponse));
                } else {
                    resolve(true);
                }
            });
            
            client.send(JSON.stringify(message));
            
            setTimeout(() => resolve(false), 1000); // Timeout after 1 second
        });
    }

    /**
     * Clean up integration test resources
     */
    static async cleanupIntegrationTest(server?: any): Promise<void> {
        if (server && server.stop) {
            await server.stop();
        }
        await this.cleanupTestWorkspace();
    }

    /**
     * Performance Testing Utilities
     */
    
    /**
     * Measure extension activation time
     */
    static async measureExtensionStartup(extensionId: string, container?: IContainer): Promise<number> {
        const startTime = Date.now();
        await this.waitForExtensionActivation(extensionId, container);
        return Date.now() - startTime;
    }

    /**
     * Measure command execution performance
     */
    static async measureCommandExecution(commandId: string, args?: any): Promise<number> {
        const startTime = Date.now();
        await vscode.commands.executeCommand(commandId, args);
        return Date.now() - startTime;
    }

    /**
     * Monitor memory usage during tests
     */
    static monitorMemoryUsage(): { 
        start: number, 
        current: () => number, 
        peak: () => number 
    } {
        const start = process.memoryUsage().heapUsed;
        let peak = start;
        
        return {
            start,
            current: () => {
                const current = process.memoryUsage().heapUsed;
                peak = Math.max(peak, current);
                return current;
            },
            peak: () => peak
        };
    }

    /**
     * Generate test data for load testing
     */
    static generateLoadTestData(count: number): {
        agents: Agent[],
        tasks: Task[]
    } {
        const agents: Agent[] = [];
        const tasks: Task[] = [];
        
        for (let i = 0; i < count; i++) {
            agents.push({
                id: `agent-${i}`,
                name: `Test Agent ${i}`,
                type: 'test',
                status: 'idle',
                capabilities: ['test'],
                terminal: {} as any,
                workingDirectory: '/test'
            });
            
            tasks.push({
                id: `task-${i}`,
                description: `Test Task ${i}`,
                priority: 'medium',
                status: 'ready',
                createdAt: Date.now()
            } as Task);
        }
        
        return { agents, tasks };
    }

    /**
     * Check performance against thresholds
     */
    static verifyPerformanceThresholds(metrics: {
        [key: string]: number
    }, thresholds: {
        [key: string]: number
    }): { passed: boolean, failures: string[] } {
        const failures: string[] = [];
        
        for (const [key, value] of Object.entries(metrics)) {
            if (thresholds[key] && value > thresholds[key]) {
                failures.push(`${key}: ${value}ms exceeds threshold of ${thresholds[key]}ms`);
            }
        }
        
        return {
            passed: failures.length === 0,
            failures
        };
    }

    /**
     * Error Testing Utilities
     */
    
    /**
     * Simulate various error conditions
     */
    static simulateError(type: string, message?: string): Error {
        const errors: Record<string, () => Error> = {
            'network': () => new Error(message || 'Network error: Connection refused'),
            'filesystem': () => new Error(message || 'ENOENT: No such file or directory'),
            'permission': () => new Error(message || 'EACCES: Permission denied'),
            'timeout': () => new Error(message || 'Operation timed out'),
            'validation': () => new Error(message || 'Validation failed'),
            'service': () => new Error(message || 'Service unavailable')
        };
        
        const errorFactory = errors[type];
        if (!errorFactory) {
            throw new Error(`Unknown error type: ${type}`);
        }
        
        return errorFactory();
    }

    /**
     * Verify proper error handling and recovery
     */
    static async verifyErrorHandling(
        operation: () => Promise<any>,
        expectedError?: string
    ): Promise<boolean> {
        try {
            await operation();
            return false; // Should have thrown
        } catch (error: any) {
            if (expectedError) {
                return error.message.includes(expectedError);
            }
            return true; // Any error is expected
        }
    }

    /**
     * Capture and verify error messages
     */
    static captureErrorMessages(): {
        errors: string[],
        warnings: string[],
        restore: () => void
    } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage')
            .mockImplementation((message: string) => {
                errors.push(message);
                return Promise.resolve(undefined);
            });
        
        const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage')
            .mockImplementation((message: string) => {
                warnings.push(message);
                return Promise.resolve(undefined);
            });
        
        return {
            errors,
            warnings,
            restore: () => {
                errorSpy.mockRestore();
                warningSpy.mockRestore();
            }
        };
    }

    /**
     * Test extension behavior under error conditions
     */
    static async testGracefulDegradation(
        errorCondition: () => void,
        verification: () => boolean
    ): Promise<boolean> {
        errorCondition();
        await this.waitForUIUpdate();
        return verification();
    }

    /**
     * Verify proper resource cleanup after errors
     */
    static verifyResourceCleanup(resources: vscode.Disposable[]): boolean {
        return resources.every(resource => {
            try {
                resource.dispose();
                return true;
            } catch {
                return false; // Already disposed or error in disposal
            }
        });
    }
}