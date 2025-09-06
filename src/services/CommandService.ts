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
            this.loggingService?.warn(`Command ${commandId} is already registered, returning existing disposable`);
            return this.commandDisposables.get(commandId)!;
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
            this.loggingService?.warn(`Text editor command ${commandId} is already registered, returning existing disposable`);
            return this.commandDisposables.get(commandId)!;
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

    /**
     * Development-only command to verify all expected commands are registered.
     * This compares the commands in package.json against actually registered commands.
     */
    async verifyCommands(): Promise<void> {
        // Only run in development mode or when explicitly enabled
        const config = vscode.workspace.getConfiguration('nofx');
        const testMode = config.get<boolean>('testMode', false);
        const isDev = process.env.NODE_ENV === 'development';

        if (!testMode && !isDev) {
            this.loggingService?.debug('Command verification skipped (not in test/dev mode)');
            return;
        }

        try {
            // Get all registered commands
            const registeredCommands = await this.getCommands(true);
            const registeredSet = new Set(registeredCommands);

            // Get expected commands from package.json
            const packageJsonPath = vscode.Uri.joinPath(
                vscode.Uri.file(vscode.extensions.getExtension('nofx.nofx')?.extensionPath || ''),
                'package.json'
            );

            const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonPath);
            const packageJson = JSON.parse(packageJsonContent.toString());
            const expectedCommands = packageJson.contributes?.commands?.map((cmd: any) => cmd.command) || [];

            // Find missing commands
            const missingCommands = expectedCommands.filter((cmd: string) => !registeredSet.has(cmd));

            // Log results
            if (missingCommands.length > 0) {
                this.loggingService?.warn(`Missing commands detected: ${missingCommands.join(', ')}`);
                vscode.window.showWarningMessage(
                    `NofX: ${missingCommands.length} commands are not registered. Check the NofX output channel for details.`
                );
            } else {
                this.loggingService?.info(`All ${expectedCommands.length} expected commands are registered`);
                vscode.window.showInformationMessage(
                    `NofX: All ${expectedCommands.length} commands verified successfully`
                );
            }

            // Also log any extra registered nofx commands not in package.json
            const nofxCommands = registeredCommands.filter(cmd => cmd.startsWith('nofx.'));
            const extraCommands = nofxCommands.filter(cmd => !expectedCommands.includes(cmd));

            if (extraCommands.length > 0) {
                this.loggingService?.debug(`Extra commands registered: ${extraCommands.join(', ')}`);
            }

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.handleError(err, 'Error verifying commands');
            vscode.window.showErrorMessage(`NofX: Failed to verify commands - ${err.message}`);
        }
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
