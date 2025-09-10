import * as vscode from 'vscode';
import { IConductorViewModel, ILogger, IWebviewHost, WebviewHostFactory } from '../services/interfaces';
import { createWebviewHost } from '../ui/WebviewHost';
import { ConductorTemplate } from '../templates/ConductorTemplate';
import { PanelBinder } from './panelBinder';

export class ConductorPanel {
    private static currentPanel: ConductorPanel | undefined;
    private webviewHost: IWebviewHost;
    private template: ConductorTemplate;
    private panelBinder: PanelBinder;
    private disposed = false;

    public constructor(
        webviewHost: IWebviewHost,
        private context: vscode.ExtensionContext,
        private viewModel: IConductorViewModel,
        private loggingService: ILogger
    ) {
        this.webviewHost = webviewHost;
        this.template = new ConductorTemplate(context);
        this.panelBinder = PanelBinder.create(loggingService);

        // Use the shared panel binder to handle common patterns
        this.panelBinder.bindWebviewToViewModel(
            this.webviewHost,
            this.viewModel,
            (state, webviewHost) => this.template.generateConductorHTML(state, webviewHost),
            {
                onDispose: () => {
                    this.disposed = true;
                    ConductorPanel.currentPanel = undefined;
                    // Dispose the view model if it has a dispose method
                    if (this.viewModel && typeof this.viewModel.dispose === 'function') {
                        this.viewModel.dispose();
                    }
                }
            }
        );
    }

    public static create(
        context: vscode.ExtensionContext,
        viewModel: IConductorViewModel,
        loggingService: ILogger,
        webviewHostFactory: WebviewHostFactory = createWebviewHost
    ): ConductorPanel {
        const panel = vscode.window.createWebviewPanel('nofxConductor', 'NofX Conductor', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
        });

        const webviewHost = webviewHostFactory(panel, loggingService);
        ConductorPanel.currentPanel = new ConductorPanel(webviewHost, context, viewModel, loggingService);

        return ConductorPanel.currentPanel;
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        viewModel: IConductorViewModel,
        loggingService: ILogger
    ): ConductorPanel {
        if (ConductorPanel.currentPanel) {
            ConductorPanel.currentPanel.reveal();
            return ConductorPanel.currentPanel;
        }

        return ConductorPanel.create(context, viewModel, loggingService);
    }

    public reveal() {
        this.webviewHost.reveal();
    }

    public dispose() {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        ConductorPanel.currentPanel = undefined;

        // Dispose panel binder (handles all subscriptions)
        this.panelBinder.dispose();

        // Dispose webview host
        this.webviewHost.dispose();
    }
}
