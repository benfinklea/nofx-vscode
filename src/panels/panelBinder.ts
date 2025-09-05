import * as vscode from 'vscode';
import { IWebviewHost, ILoggingService } from '../services/interfaces';

/**
 * Shared utility for binding webview panels to view models
 * Handles common patterns like state subscription, message handling, and HTML generation
 */
export class PanelBinder {
    private disposables: vscode.Disposable[] = [];
    private disposed = false;

    constructor(private loggingService?: ILoggingService) {}

    /**
     * Bind a webview host to a view model with common patterns
     * @param webviewHost The webview host to bind
     * @param viewModel The view model to bind to
     * @param templateGenerator Function to generate HTML content
     * @param options Additional binding options
     */
    bindWebviewToViewModel<T extends { subscribe: (callback: (state: any) => void) => vscode.Disposable; handleCommand: (command: string, data?: any) => Promise<void> }>(
        webviewHost: IWebviewHost,
        viewModel: T,
        templateGenerator: (state: any, webviewHost: IWebviewHost) => string,
        options: {
            initialState?: any;
            onDispose?: () => void;
        } = {}
    ): void {
        if (this.disposed) {
            this.loggingService?.warn('PanelBinder: Attempting to bind after disposal');
            return;
        }

        this.loggingService?.debug('PanelBinder: Binding webview to view model');

        // Subscribe to view model state changes
        this.disposables.push(
            viewModel.subscribe((state) => {
                this.loggingService?.debug('PanelBinder: State changed, posting to webview');
                webviewHost.postMessage({
                    command: 'setState',
                    state
                }).then(success => {
                    if (!success) {
                        this.loggingService?.error('PanelBinder: Failed to post message to webview');
                    }
                });
            })
        );

        // Handle messages from webview
        this.disposables.push(
            webviewHost.onDidReceiveMessage((message) => {
                this.loggingService?.debug('PanelBinder: Received message from webview', { command: message.command });
                viewModel.handleCommand(message.command, message.data);
            })
        );

        // Set initial HTML content
        const initialState = options.initialState || viewModel.getViewState?.() || viewModel.getDashboardState?.() || {};
        webviewHost.setHtml(templateGenerator(initialState, webviewHost));

        // Handle webview disposal
        this.disposables.push(
            webviewHost.onDidDispose(() => {
                this.loggingService?.debug('PanelBinder: Webview disposed');
                this.dispose();
                options.onDispose?.();
            })
        );
    }

    /**
     * Create a panel binder with logging service
     */
    static create(loggingService?: ILoggingService): PanelBinder {
        return new PanelBinder(loggingService);
    }

    /**
     * Dispose all subscriptions
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.loggingService?.debug('PanelBinder: Disposing');

        // Dispose all subscriptions
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
