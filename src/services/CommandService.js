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
exports.CommandService = void 0;
const vscode = __importStar(require("vscode"));
class CommandService {
    constructor(loggingService, errorHandler) {
        this.disposables = [];
        this.registeredCommands = new Set();
        this.commandDisposables = new Map();
        this.loggingService = loggingService;
        this.errorHandler = errorHandler;
    }
    register(commandId, handler, thisArg) {
        if (this.registeredCommands.has(commandId)) {
            this.loggingService?.warn(`Command ${commandId} is already registered, returning existing disposable`);
            return this.commandDisposables.get(commandId);
        }
        const disposable = vscode.commands.registerCommand(commandId, handler, thisArg);
        this.disposables.push(disposable);
        this.registeredCommands.add(commandId);
        this.commandDisposables.set(commandId, disposable);
        this.loggingService?.debug(`Command registered: ${commandId}`);
        return disposable;
    }
    registerTextEditorCommand(commandId, handler, thisArg) {
        if (this.registeredCommands.has(commandId)) {
            this.loggingService?.warn(`Text editor command ${commandId} is already registered, returning existing disposable`);
            return this.commandDisposables.get(commandId);
        }
        const disposable = vscode.commands.registerTextEditorCommand(commandId, handler, thisArg);
        this.disposables.push(disposable);
        this.registeredCommands.add(commandId);
        this.commandDisposables.set(commandId, disposable);
        this.loggingService?.debug(`Text editor command registered: ${commandId}`);
        return disposable;
    }
    async execute(commandId, ...args) {
        try {
            this.loggingService?.debug(`Executing command: ${commandId}`);
            return await vscode.commands.executeCommand(commandId, ...args);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Error executing command ${commandId}`);
            throw error;
        }
    }
    async getCommands(filterInternal = true) {
        return await vscode.commands.getCommands(filterInternal);
    }
    async verifyCommands() {
        const config = vscode.workspace.getConfiguration('nofx');
        const testMode = config.get('testMode', false);
        const isDev = process.env.NODE_ENV === 'development';
        if (!testMode && !isDev) {
            this.loggingService?.debug('Command verification skipped (not in test/dev mode)');
            return;
        }
        try {
            const registeredCommands = await this.getCommands(true);
            const registeredSet = new Set(registeredCommands);
            const packageJsonPath = vscode.Uri.joinPath(vscode.Uri.file(vscode.extensions.getExtension('nofx.nofx')?.extensionPath || ''), 'package.json');
            const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonPath);
            const packageJson = JSON.parse(packageJsonContent.toString());
            const expectedCommands = packageJson.contributes?.commands?.map((cmd) => cmd.command) || [];
            const missingCommands = expectedCommands.filter((cmd) => !registeredSet.has(cmd));
            if (missingCommands.length > 0) {
                this.loggingService?.warn(`Missing commands detected: ${missingCommands.join(', ')}`);
                vscode.window.showWarningMessage(`NofX: ${missingCommands.length} commands are not registered. Check the NofX output channel for details.`);
            }
            else {
                this.loggingService?.info(`All ${expectedCommands.length} expected commands are registered`);
                vscode.window.showInformationMessage(`NofX: All ${expectedCommands.length} commands verified successfully`);
            }
            const nofxCommands = registeredCommands.filter(cmd => cmd.startsWith('nofx.'));
            const extraCommands = nofxCommands.filter(cmd => !expectedCommands.includes(cmd));
            if (extraCommands.length > 0) {
                this.loggingService?.debug(`Extra commands registered: ${extraCommands.join(', ')}`);
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Error verifying commands');
            vscode.window.showErrorMessage(`NofX: Failed to verify commands - ${err.message}`);
        }
    }
    hasCommand(commandId) {
        return this.registeredCommands.has(commandId);
    }
    unregister(commandId) {
        const disposable = this.commandDisposables.get(commandId);
        if (disposable) {
            disposable.dispose();
            this.registeredCommands.delete(commandId);
            this.commandDisposables.delete(commandId);
            const index = this.disposables.indexOf(disposable);
            if (index > -1) {
                this.disposables.splice(index, 1);
            }
        }
    }
    dispose() {
        this.loggingService?.debug(`Disposing CommandService with ${this.disposables.length} commands`);
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.registeredCommands.clear();
        this.commandDisposables.clear();
    }
}
exports.CommandService = CommandService;
//# sourceMappingURL=CommandService.js.map