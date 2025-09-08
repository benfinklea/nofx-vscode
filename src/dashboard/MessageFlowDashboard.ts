import * as vscode from 'vscode';
import { IDashboardViewModel, ILoggingService, IWebviewHost, WebviewHostFactory } from '../services/interfaces';
import { createWebviewHost } from '../ui/WebviewHost';
import { DashboardTemplate } from '../templates/DashboardTemplate';

export class MessageFlowDashboard {
    private static currentPanel: MessageFlowDashboard | undefined;
    private webviewHost: IWebviewHost;
    private template: DashboardTemplate;
    private disposables: vscode.Disposable[] = [];
    private disposed = false;

    constructor(
        webviewHost: IWebviewHost,
        private context: vscode.ExtensionContext,
        private viewModel: IDashboardViewModel,
        private loggingService: ILoggingService
    ) {
        this.webviewHost = webviewHost;
        this.template = new DashboardTemplate(context);
    }

    public static create(
        context: vscode.ExtensionContext,
        viewModel: IDashboardViewModel,
        loggingService: ILoggingService,
        webviewHostFactory: WebviewHostFactory = createWebviewHost
    ): MessageFlowDashboard {
        const panel = vscode.window.createWebviewPanel(
            'nofxMessageFlow',
            '📊 NofX Message Flow',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
            }
        );

        const webviewHost = webviewHostFactory(panel, loggingService);
        MessageFlowDashboard.currentPanel = new MessageFlowDashboard(webviewHost, context, viewModel, loggingService);
        MessageFlowDashboard.currentPanel.show();

        return MessageFlowDashboard.currentPanel;
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        viewModel: IDashboardViewModel,
        loggingService: ILoggingService
    ): MessageFlowDashboard {
        if (MessageFlowDashboard.currentPanel) {
            MessageFlowDashboard.currentPanel.reveal();
            return MessageFlowDashboard.currentPanel;
        }

        return MessageFlowDashboard.create(context, viewModel, loggingService);
    }

    public async show() {
        try {
            this.loggingService.info('MessageFlowDashboard: Initializing dashboard');

            // Ensure we have a valid viewModel
            if (!this.viewModel) {
                throw new Error('Dashboard viewModel is not available');
            }

            // Get initial state with fallback
            let initialState;
            try {
                initialState = await this.viewModel.getDashboardState();
            } catch (error) {
                this.loggingService.error('Failed to get initial dashboard state, using fallback', error);
                initialState = {
                    connections: [],
                    messages: [],
                    stats: { activeConnections: 0, totalMessages: 0, successRate: 0, averageResponseTime: 0 },
                    filters: {}
                };
            }

            // Set initial HTML content with error boundary
            try {
                const html = this.template.generateDashboardHTML(initialState, this.webviewHost);
                this.webviewHost.setHtml(html);
            } catch (error) {
                this.loggingService.error('Failed to generate dashboard HTML', error);
                this.webviewHost.setHtml(this.generateErrorHTML('Failed to load dashboard template'));
                return;
            }

            // Subscribe to view model state changes with error handling
            this.disposables.push(
                this.viewModel.subscribe(state => {
                    if (this.disposed) {
                        return; // Don't process if already disposed
                    }

                    // TypeScript doesn't know postMessage returns a Promise, handle it safely
                    const postResult = this.webviewHost?.postMessage({
                        command: 'updateState',
                        state
                    });

                    // Check if it's a Promise (has a catch method)
                    if (postResult && typeof (postResult as any).catch === 'function') {
                        (postResult as any).catch((error: any) => {
                            this.loggingService.warn('Failed to post state update to webview', error);
                        });
                    }
                })
            );

            // Handle messages from webview with error boundary
            this.disposables.push(
                this.webviewHost.onDidReceiveMessage(message => {
                    if (this.disposed) {
                        return; // Don't process if already disposed
                    }

                    try {
                        this.viewModel.handleCommand(message.command, message.data);
                    } catch (error) {
                        this.loggingService.error('Error handling webview command', {
                            error,
                            command: message.command
                        });
                    }
                })
            );

            // Handle panel disposal with cleanup
            this.disposables.push(
                this.webviewHost.onDidDispose(() => {
                    this.loggingService.info('Dashboard webview disposed');
                    this.dispose();
                })
            );

            this.loggingService.info('MessageFlowDashboard: Initialization complete');
        } catch (error) {
            this.loggingService.error('Failed to initialize MessageFlowDashboard', error);

            // Show error state in dashboard
            if (this.webviewHost) {
                this.webviewHost.setHtml(this.generateErrorHTML('Dashboard initialization failed'));
            }
        }
    }

    private generateErrorHTML(message: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NofX Dashboard Error</title>
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            color: var(--vscode-foreground); 
            background: var(--vscode-editor-background);
            padding: 20px;
            text-align: center;
        }
        .error { color: var(--vscode-errorForeground); }
    </style>
</head>
<body>
    <h1>📊 NofX Message Flow Dashboard</h1>
    <div class="error">
        <h2>⚠️ Error</h2>
        <p>${message}</p>
        <p>Please check the VS Code output console for more details.</p>
        <button onclick="window.location.reload()">Retry</button>
    </div>
</body>
</html>`;
    }

    public reveal() {
        this.webviewHost.reveal();
    }

    public dispose() {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        MessageFlowDashboard.currentPanel = undefined;

        // Dispose all subscriptions
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Dispose webview host
        this.webviewHost.dispose();
    }
}
