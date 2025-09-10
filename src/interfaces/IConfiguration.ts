// Simplified configuration interface - single method pattern
import * as vscode from 'vscode';

export interface IConfiguration {
    get<T>(key: string, defaultValue?: T): T;
    set(key: string, value: any): void;
    has(key: string): boolean;

    // Additional methods for backward compatibility
    update(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void>;
    getAiProvider(): string;
    getAiPath(): string;
    getMaxAgents(): number;
    isAutoAssignTasks(): boolean;
    isUseWorktrees(): boolean;
    onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;
}
