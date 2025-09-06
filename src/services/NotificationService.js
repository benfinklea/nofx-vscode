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
exports.NotificationService = void 0;
const vscode = __importStar(require("vscode"));
class NotificationService {
    async showInformation(message, ...items) {
        return await vscode.window.showInformationMessage(message, ...items);
    }
    async showWarning(message, ...items) {
        return await vscode.window.showWarningMessage(message, ...items);
    }
    async showError(message, ...items) {
        return await vscode.window.showErrorMessage(message, ...items);
    }
    async showQuickPick(items, options) {
        return await vscode.window.showQuickPick(items, options);
    }
    async showInputBox(options) {
        return await vscode.window.showInputBox(options);
    }
    async withProgress(options, task) {
        return await vscode.window.withProgress(options, task);
    }
    async confirm(message, confirmText = 'Yes') {
        const result = await vscode.window.showInformationMessage(message, { title: confirmText, isCloseAffordance: false }, { title: 'Cancel', isCloseAffordance: true });
        return result?.title === confirmText;
    }
    async confirmDestructive(message, confirmText = 'Delete') {
        const result = await vscode.window.showWarningMessage(message, { title: confirmText, isCloseAffordance: false }, { title: 'Cancel', isCloseAffordance: true });
        return result?.title === confirmText;
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=NotificationService.js.map