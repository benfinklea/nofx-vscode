import * as vscode from 'vscode';
import { INotificationService } from './interfaces';

export class NotificationService implements INotificationService {

    async showInformation(message: string, ...items: string[]): Promise<string | undefined> {
        return await vscode.window.showInformationMessage(message, ...items);
    }

    async showWarning(message: string, ...items: string[]): Promise<string | undefined> {
        return await vscode.window.showWarningMessage(message, ...items);
    }

    async showError(message: string, ...items: string[]): Promise<string | undefined> {
        return await vscode.window.showErrorMessage(message, ...items);
    }

    async showQuickPick<T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions): Promise<T | undefined>;
    async showQuickPick<T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions & { canPickMany: true }): Promise<T[] | undefined>;
    async showQuickPick<T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions): Promise<T | T[] | undefined> {
        return await vscode.window.showQuickPick(items, options);
    }

    async showInputBox(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        return await vscode.window.showInputBox(options);
    }

    async withProgress<T>(options: vscode.ProgressOptions, task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>): Promise<T> {
        return await vscode.window.withProgress(options, task);
    }

    async confirm(message: string, confirmText: string = 'Yes'): Promise<boolean> {
        const result = await vscode.window.showInformationMessage(
            message,
            { title: confirmText, isCloseAffordance: false },
            { title: 'Cancel', isCloseAffordance: true }
        );
        return result?.title === confirmText;
    }

    async confirmDestructive(message: string, confirmText: string = 'Delete'): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            message,
            { title: confirmText, isCloseAffordance: false },
            { title: 'Cancel', isCloseAffordance: true }
        );
        return result?.title === confirmText;
    }
}
