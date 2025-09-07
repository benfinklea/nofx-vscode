import * as vscode from 'vscode';
import { IConductorViewModel, ILoggingService, IWebviewHost, WebviewHostFactory } from '../services/interfaces';
import { createWebviewHost } from '../ui/WebviewHost';
import { ConductorTemplate } from '../templates/ConductorTemplate';
import { PanelBinder } from './panelBinder';

export class EnhancedConductorPanel {
    private static currentPanel: EnhancedConductorPanel | undefined;
    private webviewHost: IWebviewHost;
    private template: ConductorTemplate;
    private panelBinder: PanelBinder;
    private disposed = false;

    public constructor(
        webviewHost: IWebviewHost,
        private context: vscode.ExtensionContext,
        private viewModel: IConductorViewModel,
        private loggingService: ILoggingService
    ) {
        this.webviewHost = webviewHost;
        this.template = new ConductorTemplate(context);
        this.panelBinder = PanelBinder.create(loggingService);

        // Use the shared panel binder to handle common patterns
        this.panelBinder.bindWebviewToViewModel(
            this.webviewHost,
            this.viewModel,
            (state, webviewHost) => this.template.generateEnhancedConductorHTML(state, webviewHost),
            {
                onDispose: () => {
                    this.disposed = true;
                    EnhancedConductorPanel.currentPanel = undefined;
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
        loggingService: ILoggingService,
        webviewHostFactory: WebviewHostFactory = createWebviewHost
    ): EnhancedConductorPanel {
        const panel = vscode.window.createWebviewPanel(
            'nofxConductorEnhanced',
            'NofX Conductor - Agent Orchestration Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
            }
        );

        const webviewHost = webviewHostFactory(panel, loggingService);
        EnhancedConductorPanel.currentPanel = new EnhancedConductorPanel(
            webviewHost,
            context,
            viewModel,
            loggingService
        );

        return EnhancedConductorPanel.currentPanel;
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        viewModel: IConductorViewModel,
        loggingService: ILoggingService
    ): EnhancedConductorPanel {
        if (EnhancedConductorPanel.currentPanel) {
            EnhancedConductorPanel.currentPanel.reveal();
            return EnhancedConductorPanel.currentPanel;
        }

        return EnhancedConductorPanel.create(context, viewModel, loggingService);
    }

    public reveal() {
        this.webviewHost.reveal();
    }

    public dispose() {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        EnhancedConductorPanel.currentPanel = undefined;

        // Dispose panel binder (handles all subscriptions)
        this.panelBinder.dispose();

        // Dispose webview host
        this.webviewHost.dispose();
    }
}
