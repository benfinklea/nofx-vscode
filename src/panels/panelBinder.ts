import * as vscode from 'vscode';
import { IWebviewHost, ILogger } from '../services/interfaces';

export class PanelBinder {
    private subscriptions: vscode.Disposable[] = [];
    private disposed = false;

    private constructor(private loggingService: ILogger) {}

    public static create(loggingService: ILogger): PanelBinder {
        return new PanelBinder(loggingService);
    }

    public bindWebviewToViewModel(
        webviewHost: IWebviewHost,
        viewModel: any,
        htmlGenerator: (state: any, webviewHost: IWebviewHost) => string,
        options: { onDispose?: () => void } = {}
    ): void {
        if (this.disposed) {
            this.loggingService.warn('PanelBinder: Attempted to bind after disposal');
            return;
        }

        // Set initial HTML via webviewHost.setHtml - handle async state
        const getInitialState = async () => {
            try {
                if (viewModel.getViewState) {
                    return viewModel.getViewState();
                } else if (viewModel.getDashboardState) {
                    return await viewModel.getDashboardState();
                }
                return {};
            } catch (error) {
                this.loggingService.error('PanelBinder: Error getting initial state', error);
                return {};
            }
        };

        // Handle both sync and async state
        getInitialState().then(initialState => {
            webviewHost.setHtml(htmlGenerator(initialState, webviewHost));
        });

        // Subscribe to viewModel state changes
        if (viewModel.subscribe) {
            this.subscriptions.push(
                viewModel.subscribe((state: any) => {
                    webviewHost.postMessage({ command: 'setState', state });
                })
            );
        }

        // Hook webviewHost.onDidReceiveMessage to viewModel.handleCommand
        this.subscriptions.push(
            webviewHost.onDidReceiveMessage((message: any) => {
                if (viewModel.handleCommand) {
                    viewModel.handleCommand(message.command, message.data);
                }
            })
        );

        // Hook webviewHost.onDidDispose to onDispose callback
        this.subscriptions.push(
            webviewHost.onDidDispose(() => {
                if (options.onDispose) {
                    options.onDispose();
                }
                this.dispose();
            })
        );
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.loggingService.debug('PanelBinder: Disposing');

        // Dispose all subscriptions
        this.subscriptions.forEach(subscription => {
            try {
                subscription.dispose();
            } catch (error) {
                this.loggingService.error('PanelBinder: Error disposing subscription', error);
            }
        });
        this.subscriptions = [];
    }
}
