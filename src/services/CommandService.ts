import * as vscode from 'vscode';
import { ICommandService, ILoggingService, IErrorHandler } from './interfaces';

export class CommandService implements ICommandService {
    private disposables: vscode.Disposable[] = [];
    private registeredCommands = new Set<string>();
    private commandDisposables = new Map<string, vscode.Disposable>();
    private loggingService?: ILoggingService;
    private errorHandler?: IErrorHandler;

    constructor(loggingService?: ILoggingService, errorHandler?: IErrorHandler) {
        this.loggingService = loggingService;
        this.errorHandler = errorHandler;
    }

    register(commandId: string, handler: (...args: any[]) => any, thisArg?: any): vscode.Disposable {
        if (this.registeredCommands.has(commandId)) {
            this.loggingService?.warn(`Command ${commandId} is already registered`);
        }
        
        const disposable = vscode.commands.registerCommand(commandId, handler, thisArg);
        this.disposables.push(disposable);
        this.registeredCommands.add(commandId);
        this.commandDisposables.set(commandId, disposable);
        
        this.loggingService?.debug(`Command registered: ${commandId}`);
        return disposable;
    }

    registerTextEditorCommand(commandId: string, handler: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void, thisArg?: any): vscode.Disposable {
        if (this.registeredCommands.has(commandId)) {
            this.loggingService?.warn(`Text editor command ${commandId} is already registered`);
        }
        
        const disposable = vscode.commands.registerTextEditorCommand(commandId, handler, thisArg);
        this.disposables.push(disposable);
        this.registeredCommands.add(commandId);
        this.commandDisposables.set(commandId, disposable);
        
        this.loggingService?.debug(`Text editor command registered: ${commandId}`);
        return disposable;
    }

    async execute(commandId: string, ...args: any[]): Promise<any> {
        try {
            this.loggingService?.debug(`Executing command: ${commandId}`);
            return await vscode.commands.executeCommand(commandId, ...args);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, `Error executing command ${commandId}`);
            throw error;
        }
    }

    async getCommands(filterInternal: boolean = true): Promise<string[]> {
        return await vscode.commands.getCommands(filterInternal);
    }

    hasCommand(commandId: string): boolean {
        return this.registeredCommands.has(commandId);
    }

    unregister(commandId: string): void {
        const disposable = this.commandDisposables.get(commandId);
        if (disposable) {
            disposable.dispose();
            this.registeredCommands.delete(commandId);
            this.commandDisposables.delete(commandId);
            
            // Remove from main disposables array
            const index = this.disposables.indexOf(disposable);
            if (index > -1) {
                this.disposables.splice(index, 1);
            }
        }
    }

    dispose(): void {
        this.loggingService?.debug(`Disposing CommandService with ${this.disposables.length} commands`);
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.registeredCommands.clear();
        this.commandDisposables.clear();
    }
}