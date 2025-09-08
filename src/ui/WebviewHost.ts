import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { IWebviewHost, ILoggingService, WebviewHostFactory } from '../services/interfaces';

export class WebviewHost implements IWebviewHost {
    private panel: vscode.WebviewPanel;
    private loggingService?: ILoggingService;
    private subscriptions: vscode.Disposable[] = [];
    private nonce: string;

    constructor(panel: vscode.WebviewPanel, loggingService?: ILoggingService) {
        this.panel = panel;
        this.loggingService = loggingService;
        this.nonce = this.generateNonce();

        this.loggingService?.debug('WebviewHost: Created for panel', {
            viewType: panel.viewType,
            title: panel.title
        });
    }

    static create(panel: vscode.WebviewPanel, loggingService?: ILoggingService): WebviewHost {
        return new WebviewHost(panel, loggingService);
    }

    postMessage(data: any): Thenable<boolean> {
        try {
            const result = this.panel.webview.postMessage(data);
            this.loggingService?.debug('WebviewHost: Posted message', {
                command: data.command,
                hasData: !!data.data
            });
            return result;
        } catch (error) {
            this.loggingService?.error('WebviewHost: Error posting message', error);
            throw error;
        }
    }

    setHtml(content: string): void {
        try {
            this.panel.webview.html = content;
            this.loggingService?.debug('WebviewHost: Set HTML content', {
                contentLength: content.length
            });
        } catch (error) {
            this.loggingService?.error('WebviewHost: Error setting HTML', error);
            throw error;
        }
    }

    onDidReceiveMessage(handler: (message: any) => void): vscode.Disposable {
        const disposable = this.panel.webview.onDidReceiveMessage(message => {
            try {
                this.loggingService?.debug('WebviewHost: Received message', {
                    command: message.command
                });
                handler(message);
            } catch (error) {
                this.loggingService?.error('WebviewHost: Error handling message', error);
            }
        });

        this.subscriptions.push(disposable);
        return disposable;
    }

    // Additional utility methods for webview management
    reveal(viewColumn?: vscode.ViewColumn): void {
        this.panel.reveal(viewColumn);
        this.loggingService?.debug('WebviewHost: Revealed panel');
    }

    get visible(): boolean {
        return this.panel.visible;
    }

    get active(): boolean {
        return this.panel.active;
    }

    get title(): string {
        return this.panel.title;
    }

    set title(value: string) {
        this.panel.title = value;
        this.loggingService?.debug('WebviewHost: Set title', { title: value });
    }

    get webview(): vscode.Webview {
        return this.panel.webview;
    }

    get viewColumn(): vscode.ViewColumn | undefined {
        return this.panel.viewColumn;
    }

    onDidChangeViewState(listener: (e: vscode.WebviewPanelOnDidChangeViewStateEvent) => any): vscode.Disposable {
        const disposable = this.panel.onDidChangeViewState(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }

    onDidDispose(listener: () => any): vscode.Disposable {
        const disposable = this.panel.onDidDispose(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }

    asWebviewUri(uri: vscode.Uri): vscode.Uri {
        return this.panel.webview.asWebviewUri(uri);
    }

    getNonce(): string {
        return this.nonce;
    }

    private generateNonce(): string {
        return randomBytes(16)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    dispose(): void {
        this.loggingService?.debug('WebviewHost: Disposing');

        // Dispose all subscriptions
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];

        // Dispose the panel
        this.panel.dispose();
    }
}

// Export the default factory function
export const createWebviewHost: WebviewHostFactory = (panel: vscode.WebviewPanel, logging?: ILoggingService) => {
    return WebviewHost.create(panel, logging);
};
