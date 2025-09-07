import * as vscode from 'vscode';
import { Container } from '../../services/Container';
import { SERVICE_TOKENS, IContainer } from '../../services/interfaces';
import { setupExtension, teardownExtension, getExtensionContainer } from './setup';

/**
 * Centralized test harness for managing container lifecycle
 */
export class TestHarness {
    private static container: IContainer | null = null;
    private static context: vscode.ExtensionContext | null = null;
    private static isInitialized = false;
    private static suiteContainers = new Map<string, IContainer>();

    /**
     * Initialize the test harness once per suite
     * Creates a fresh container for isolation
     */
    static async initialize(suiteName?: string): Promise<{ container: IContainer; context: vscode.ExtensionContext }> {
        // Setup extension on first initialization
        if (!this.isInitialized) {
            this.context = await setupExtension();
            this.isInitialized = true;
        }

        // Get or create a container for this suite
        const key = suiteName || 'default';

        // Try to get container from activated extension first
        let container = getExtensionContainer();

        if (!container) {
            // Fallback: create a fresh container for this suite
            container = new Container();

            // Register the extension context
            if (this.context) {
                container.registerInstance(SERVICE_TOKENS.ExtensionContext, this.context);
            }
        }

        // Store container for this suite
        this.suiteContainers.set(key, container);
        this.container = container;

        if (!container || !this.context) {
            throw new Error('Failed to initialize test harness');
        }

        return { container, context: this.context };
    }

    /**
     * Get the container instance
     */
    static getContainer(): IContainer {
        if (!this.container) {
            throw new Error('Container not initialized. Call TestHarness.initialize() first');
        }
        return this.container;
    }

    /**
     * Get the extension context
     */
    static getContext(): vscode.ExtensionContext {
        if (!this.context) {
            throw new Error('Context not initialized. Call TestHarness.initialize() first');
        }
        return this.context;
    }

    /**
     * Reset container state between tests
     * Creates a fresh container while preserving command registrations
     */
    static async resetContainer(suiteName?: string): Promise<void> {
        const key = suiteName || 'default';

        // Dispose current container if it exists
        if (this.container) {
            await this.container.dispose();
        }

        // Create a fresh container
        const newContainer = new Container();

        // Re-register extension context
        if (this.context) {
            newContainer.registerInstance(SERVICE_TOKENS.ExtensionContext, this.context);
        }

        // Update references
        this.suiteContainers.set(key, newContainer);
        this.container = newContainer;
    }

    /**
     * Dispose of the container and cleanup
     */
    static async dispose(suiteName?: string): Promise<void> {
        const key = suiteName || 'default';

        // Dispose specific suite container or all containers
        if (suiteName) {
            const container = this.suiteContainers.get(key);
            if (container) {
                await container.dispose();
                this.suiteContainers.delete(key);

                // Clear current container if it matches
                if (this.container === container) {
                    this.container = null;
                }
            }
        } else {
            // Dispose all suite containers
            for (const [, container] of this.suiteContainers) {
                await container.dispose();
            }
            this.suiteContainers.clear();
            this.container = null;
        }

        // Only cleanup extension if disposing everything
        if (!suiteName) {
            await teardownExtension();
            this.context = null;
            this.isInitialized = false;
        }
    }

    /**
     * Register a command handler for testing
     * This is useful when commands need to be registered in beforeEach
     */
    static registerCommand(command: string, handler: (...args: any[]) => any): vscode.Disposable {
        const disposable = vscode.commands.registerCommand(command, handler);

        // Add to extension context subscriptions if available
        if (this.context) {
            this.context.subscriptions.push(disposable);
        }

        return disposable;
    }
}
