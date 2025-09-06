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
exports.EnhancedConductorPanel = void 0;
const vscode = __importStar(require("vscode"));
const WebviewHost_1 = require("../ui/WebviewHost");
const ConductorTemplate_1 = require("../templates/ConductorTemplate");
const panelBinder_1 = require("./panelBinder");
class EnhancedConductorPanel {
    constructor(webviewHost, context, viewModel, loggingService) {
        this.context = context;
        this.viewModel = viewModel;
        this.loggingService = loggingService;
        this.disposed = false;
        this.webviewHost = webviewHost;
        this.template = new ConductorTemplate_1.ConductorTemplate(context);
        this.panelBinder = panelBinder_1.PanelBinder.create(loggingService);
        this.panelBinder.bindWebviewToViewModel(this.webviewHost, this.viewModel, (state, webviewHost) => this.template.generateEnhancedConductorHTML(state, webviewHost), {
            onDispose: () => {
                this.disposed = true;
                EnhancedConductorPanel.currentPanel = undefined;
                if (this.viewModel && typeof this.viewModel.dispose === 'function') {
                    this.viewModel.dispose();
                }
            }
        });
    }
    static create(context, viewModel, loggingService, webviewHostFactory = WebviewHost_1.createWebviewHost) {
        const panel = vscode.window.createWebviewPanel('nofxConductorEnhanced', 'NofX Conductor - Agent Orchestration Dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'webview')
            ]
        });
        const webviewHost = webviewHostFactory(panel, loggingService);
        EnhancedConductorPanel.currentPanel = new EnhancedConductorPanel(webviewHost, context, viewModel, loggingService);
        return EnhancedConductorPanel.currentPanel;
    }
    static createOrShow(context, viewModel, loggingService) {
        if (EnhancedConductorPanel.currentPanel) {
            EnhancedConductorPanel.currentPanel.reveal();
            return EnhancedConductorPanel.currentPanel;
        }
        return EnhancedConductorPanel.create(context, viewModel, loggingService);
    }
    reveal() {
        this.webviewHost.reveal();
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        EnhancedConductorPanel.currentPanel = undefined;
        this.panelBinder.dispose();
        this.webviewHost.dispose();
    }
}
exports.EnhancedConductorPanel = EnhancedConductorPanel;
//# sourceMappingURL=EnhancedConductorPanel.js.map