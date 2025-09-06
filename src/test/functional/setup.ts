import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Container } from '../../services/Container';

// Import extension module
let extension: any;
let extensionContext: vscode.ExtensionContext;

/**
 * Initialize and activate the extension for functional tests
 * This ensures all commands are properly registered
 */
export async function setupExtension(): Promise<vscode.ExtensionContext> {
    // Create mock extension context
    const workspaceFolder = path.join(__dirname, 'test-workspace-' + Date.now());
    fs.mkdirSync(workspaceFolder, { recursive: true });

    extensionContext = {
        subscriptions: [],
        workspaceState: {
            get: jest.fn().mockReturnValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([])
        },
        globalState: {
            get: jest.fn().mockReturnValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([]),
            setKeysForSync: jest.fn()
        },
        extensionPath: __dirname,
        extensionUri: vscode.Uri.file(__dirname),
        storagePath: path.join(workspaceFolder, '.storage'),
        globalStoragePath: path.join(workspaceFolder, '.global-storage'),
        logPath: path.join(workspaceFolder, '.logs'),
        extensionMode: vscode.ExtensionMode.Test,
        asAbsolutePath: (relativePath: string) => path.join(__dirname, relativePath),
        storageUri: vscode.Uri.file(path.join(workspaceFolder, '.storage')),
        globalStorageUri: vscode.Uri.file(path.join(workspaceFolder, '.global-storage')),
        logUri: vscode.Uri.file(path.join(workspaceFolder, '.logs')),
        secrets: {
            get: jest.fn().mockResolvedValue(undefined),
            store: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            onDidChange: new vscode.EventEmitter().event
        }
    } as any;

    // Set test mode configuration
    await vscode.workspace.getConfiguration('nofx').update('testMode', true, vscode.ConfigurationTarget.Workspace);

    // Try to import and activate the extension
    try {
        // Import the compiled extension module
        extension = require('../../../out/extension');

        // Activate the extension
        if (extension && typeof extension.activate === 'function') {
            await extension.activate(extensionContext);
        }
    } catch (error) {
        console.warn('Extension activation failed, commands may not be registered:', error);
        // Continue anyway - tests may still work with mocked services
    }

    return extensionContext;
}

/**
 * Clean up extension after tests
 */
export async function teardownExtension(): Promise<void> {
    // Deactivate extension if possible
    if (extension && typeof extension.deactivate === 'function') {
        try {
            await extension.deactivate();
        } catch (error) {
            console.warn('Extension deactivation failed:', error);
        }
    }

    // Dispose of all subscriptions
    if (extensionContext) {
        extensionContext.subscriptions.forEach((sub: vscode.Disposable) => {
            try {
                sub.dispose();
            } catch (error) {
                // Ignore disposal errors
            }
        });
    }

    // Reset test mode configuration
    await vscode.workspace.getConfiguration('nofx').update('testMode', undefined, vscode.ConfigurationTarget.Workspace);

    // Reset container if it exists
    try {
        const container = Container.getInstance();
        if (container && typeof container.reset === 'function') {
            container.reset();
        }
    } catch (error) {
        // Container may not be available, ignore
    }
}

/**
 * Setup mock workspace for tests that require one
 */
export function setupMockWorkspace(path?: string): void {
    const mockFolder = {
        uri: vscode.Uri.file(path || '/test/workspace'),
        name: 'Test Workspace',
        index: 0
    };

    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: [mockFolder],
        configurable: true
    });
}

/**
 * Clear mock workspace
 */
export function clearMockWorkspace(): void {
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true
    });
}
