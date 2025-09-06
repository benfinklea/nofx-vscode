"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebviewHost = exports.WebviewHost = void 0;
const crypto_1 = require("crypto");
class WebviewHost {
    constructor(panel, loggingService) {
        this.subscriptions = [];
        this.panel = panel;
        this.loggingService = loggingService;
        this.nonce = this.generateNonce();
        this.loggingService?.debug('WebviewHost: Created for panel', {
            viewType: panel.viewType,
            title: panel.title
        });
    }
    static create(panel, loggingService) {
        return new WebviewHost(panel, loggingService);
    }
    postMessage(data) {
        try {
            const result = this.panel.webview.postMessage(data);
            this.loggingService?.debug('WebviewHost: Posted message', {
                command: data.command,
                hasData: !!data.data
            });
            return result;
        }
        catch (error) {
            this.loggingService?.error('WebviewHost: Error posting message', error);
            throw error;
        }
    }
    setHtml(content) {
        try {
            this.panel.webview.html = content;
            this.loggingService?.debug('WebviewHost: Set HTML content', {
                contentLength: content.length
            });
        }
        catch (error) {
            this.loggingService?.error('WebviewHost: Error setting HTML', error);
            throw error;
        }
    }
    onDidReceiveMessage(handler) {
        const disposable = this.panel.webview.onDidReceiveMessage((message) => {
            try {
                this.loggingService?.debug('WebviewHost: Received message', {
                    command: message.command
                });
                handler(message);
            }
            catch (error) {
                this.loggingService?.error('WebviewHost: Error handling message', error);
            }
        });
        this.subscriptions.push(disposable);
        return disposable;
    }
    reveal(viewColumn) {
        this.panel.reveal(viewColumn);
        this.loggingService?.debug('WebviewHost: Revealed panel');
    }
    get visible() {
        return this.panel.visible;
    }
    get active() {
        return this.panel.active;
    }
    get title() {
        return this.panel.title;
    }
    set title(value) {
        this.panel.title = value;
        this.loggingService?.debug('WebviewHost: Set title', { title: value });
    }
    get webview() {
        return this.panel.webview;
    }
    get viewColumn() {
        return this.panel.viewColumn;
    }
    onDidChangeViewState(listener) {
        const disposable = this.panel.onDidChangeViewState(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }
    onDidDispose(listener) {
        const disposable = this.panel.onDidDispose(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }
    asWebviewUri(uri) {
        return this.panel.webview.asWebviewUri(uri);
    }
    getNonce() {
        return this.nonce;
    }
    generateNonce() {
        return (0, crypto_1.randomBytes)(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }
    dispose() {
        this.loggingService?.debug('WebviewHost: Disposing');
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.panel.dispose();
    }
}
exports.WebviewHost = WebviewHost;
const createWebviewHost = (panel, logging) => {
    return WebviewHost.create(panel, logging);
};
exports.createWebviewHost = createWebviewHost;
//# sourceMappingURL=WebviewHost.js.map