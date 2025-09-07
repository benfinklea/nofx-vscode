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
        // Subscribe to view model state changes
        this.disposables.push(
            this.viewModel.subscribe(state => {
                this.webviewHost
                    ?.postMessage({
                        command: 'updateState',
                        state
                    })
                    .then(success => {
                        if (!success) {
                            this.loggingService.error('Failed to post message to webview');
                        }
                    });
            })
        );

        // Handle messages from webview
        this.disposables.push(
            this.webviewHost.onDidReceiveMessage(message => {
                this.viewModel.handleCommand(message.command, message.data);
            })
        );

        // Set initial HTML content
        const state = await this.viewModel.getDashboardState();
        this.webviewHost.setHtml(this.template.generateDashboardHTML(state, this.webviewHost));

        // Handle panel disposal
        this.disposables.push(
            this.webviewHost.onDidDispose(() => {
                // Dispose the view model if it has a dispose method
                if (this.viewModel && typeof this.viewModel.dispose === 'function') {
                    this.viewModel.dispose();
                }
                this.dispose();
            })
        );
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
