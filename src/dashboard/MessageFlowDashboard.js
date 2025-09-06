"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageFlowDashboard = void 0;
const vscode = __importStar(require("vscode"));
const WebviewHost_1 = require("../ui/WebviewHost");
const DashboardTemplate_1 = require("../templates/DashboardTemplate");
class MessageFlowDashboard {
    constructor(webviewHost, context, viewModel, loggingService) {
        this.context = context;
        this.viewModel = viewModel;
        this.loggingService = loggingService;
        this.disposables = [];
        this.disposed = false;
        this.webviewHost = webviewHost;
        this.template = new DashboardTemplate_1.DashboardTemplate(context);
    }
    static create(context, viewModel, loggingService, webviewHostFactory = WebviewHost_1.createWebviewHost) {
        const panel = vscode.window.createWebviewPanel('nofxMessageFlow', '📊 NofX Message Flow', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'webview')
            ]
        });
        const webviewHost = webviewHostFactory(panel, loggingService);
        MessageFlowDashboard.currentPanel = new MessageFlowDashboard(webviewHost, context, viewModel, loggingService);
        MessageFlowDashboard.currentPanel.show();
        return MessageFlowDashboard.currentPanel;
    }
    static createOrShow(context, viewModel, loggingService) {
        if (MessageFlowDashboard.currentPanel) {
            MessageFlowDashboard.currentPanel.reveal();
            return MessageFlowDashboard.currentPanel;
        }
        return MessageFlowDashboard.create(context, viewModel, loggingService);
    }
    async show() {
        this.disposables.push(this.viewModel.subscribe((state) => {
            this.webviewHost?.postMessage({
                command: 'updateState',
                state
            }).then(success => {
                if (!success) {
                    this.loggingService.error('Failed to post message to webview');
                }
            });
        }));
        this.disposables.push(this.webviewHost.onDidReceiveMessage((message) => {
            this.viewModel.handleCommand(message.command, message.data);
        }));
        const state = await this.viewModel.getDashboardState();
        this.webviewHost.setHtml(this.template.generateDashboardHTML(state, this.webviewHost));
        this.disposables.push(this.webviewHost.onDidDispose(() => {
            if (this.viewModel && typeof this.viewModel.dispose === 'function') {
                this.viewModel.dispose();
            }
            this.dispose();
        }));
    }
    reveal() {
        this.webviewHost.reveal();
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        MessageFlowDashboard.currentPanel = undefined;
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        this.webviewHost.dispose();
    }
}
exports.MessageFlowDashboard = MessageFlowDashboard;
//# sourceMappingURL=MessageFlowDashboard.js.map