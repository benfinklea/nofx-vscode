import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    SERVICE_TOKENS
} from '../services/interfaces';
import { AgentManager } from '../agents/AgentManager';
import { AgentPersistence } from '../persistence/AgentPersistence';

export class PersistenceCommands implements ICommandHandler {
    private readonly agentManager: AgentManager;
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;

    constructor(container: IContainer) {
        this.agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
    }

    register(): void {
        this.commandService.register('nofx.exportSessions', this.exportSessions.bind(this));
        this.commandService.register('nofx.archiveSessions', this.archiveSessions.bind(this));
        this.commandService.register('nofx.clearPersistence', this.clearPersistence.bind(this));
    }

    private async exportSessions(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace open. Cannot export sessions.');
            return;
        }

        const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
        const exportPath = await persistence.exportSessionsAsMarkdown();

        const selection = await this.notificationService.showInformation(
            `Sessions exported to: ${exportPath}`,
            'Open File'
        );

        if (selection === 'Open File') {
            const uri = vscode.Uri.file(exportPath);
            await vscode.window.showTextDocument(uri);
        }
    }

    private async archiveSessions(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace open. Cannot archive sessions.');
            return;
        }

        // Get archive name from user
        const archiveName = await this.notificationService.showInputBox({
            prompt: 'Enter archive name',
            value: `archive-${new Date().toISOString().split('T')[0]}`,
            validateInput: (value: string): string | undefined => {
                if (!value || value.trim().length === 0) {
                    return 'Archive name is required';
                }
                if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
                    return 'Archive name can only contain letters, numbers, hyphens, and underscores';
                }
                return undefined;
            }
        });

        if (!archiveName) {
            return;
        }

        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Archiving sessions...',
            cancellable: false
        }, async (progress) => {
            try {
                const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);
                const archivePath = await persistence.archiveSessions(archiveName);

                progress.report({ increment: 100 });

                const selection = await this.notificationService.showInformation(
                    `Sessions archived to: ${archivePath}`,
                    'Show in Explorer'
                );

                if (selection === 'Show in Explorer') {
                    const uri = vscode.Uri.file(path.dirname(archivePath));
                    await vscode.commands.executeCommand('revealInExplorer', uri);
                }
            } catch (error) {
                await this.notificationService.showError(
                    `Failed to archive sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        });
    }

    private async clearPersistence(): Promise<void> {
        const confirmed = await this.notificationService.confirmDestructive(
            'Clear all saved agent data and sessions? This cannot be undone.',
            'Clear All'
        );

        if (!confirmed) {
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace open');
            return;
        }

        await this.notificationService.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Clearing persistence data...',
            cancellable: false
        }, async (progress) => {
            try {
                const persistence = new AgentPersistence(workspaceFolder.uri.fsPath);

                // Clear agent data
                progress.report({ message: 'Clearing agent data...', increment: 33 });
                await persistence.clearAll();

                // Clear .nofx directory
                progress.report({ message: 'Clearing .nofx directory...', increment: 33 });
                const nofxDir = path.join(workspaceFolder.uri.fsPath, '.nofx');
                try {
                    await fsPromises.access(nofxDir);
                    await this.clearDirectory(nofxDir);
                } catch (error) {
                    // Directory doesn't exist, ignore
                }

                // Clear active agents
                progress.report({ message: 'Clearing active agents...', increment: 34 });
                const agents = this.agentManager.getActiveAgents();
                for (const agent of agents) {
                    await this.agentManager.removeAgent(agent.id);
                }

                await this.notificationService.showInformation('All persistence data cleared');
            } catch (error) {
                await this.notificationService.showError(
                    `Failed to clear persistence: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        });
    }

    private async clearDirectory(dirPath: string): Promise<void> {
        const files = await fsPromises.readdir(dirPath);

        for (const file of files) {
            // Skip templates directory
            if (file === 'templates') {
                continue;
            }

            const filePath = path.join(dirPath, file);
            const stat = await fsPromises.stat(filePath);

            if (stat.isDirectory()) {
                // Recursively remove subdirectory
                await this.removeDirectory(filePath);
            } else {
                // Remove file
                await fsPromises.unlink(filePath);
            }
        }
    }

    private async removeDirectory(dirPath: string): Promise<void> {
        await fsPromises.rm(dirPath, { recursive: true, force: true });
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}
