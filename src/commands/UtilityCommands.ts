import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    SERVICE_TOKENS
} from '../services/interfaces';
import { PickItem } from '../types/ui';

export class UtilityCommands implements ICommandHandler {
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;

    constructor(container: IContainer) {
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
    }

    register(): void {
        this.commandService.register('nofx.testClaude', this.testClaude.bind(this));
    }

    private async testClaude(): Promise<void> {
        const testTypes: PickItem<string>[] = [
            { label: '$(terminal) Simple Command', value: 'simple' },
            { label: '$(comment-discussion) Interactive Mode', value: 'interactive' },
            { label: '$(file-text) Heredoc Style', value: 'heredoc' },
            { label: '$(file-code) From File', value: 'file' }
        ];

        const testType = await this.notificationService.showQuickPick(testTypes, {
            placeHolder: 'Select Claude test type'
        });

        if (!testType) {
            return;
        }

        const claudePath = this.configService.getClaudePath();
        const terminal = vscode.window.createTerminal('Claude Test');
        terminal.show();

        const testValue = testType.value;
        switch (testValue) {
            case 'simple':
                terminal.sendText(`${claudePath} "What is 2+2?"`);
                break;

            case 'interactive':
                terminal.sendText(claudePath);
                await this.notificationService.showInformation(
                    'Claude started in interactive mode. Type your messages and press Enter.'
                );
                break;

            case 'heredoc':
                const heredocScript = `
cat << 'EOF' | ${claudePath}
Please write a haiku about coding.
EOF`;
                terminal.sendText(heredocScript.trim());
                break;

            case 'file':
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    await this.notificationService.showError('No workspace folder open');
                    terminal.dispose();
                    return;
                }

                const testFile = path.join(workspaceFolder.uri.fsPath, '.claude-test.txt');
                fs.writeFileSync(testFile, 'What programming languages do you know?');
                terminal.sendText(`${claudePath} < "${testFile}"`);
                
                // Clean up test file after a delay
                setTimeout(() => {
                    try {
                        fs.unlinkSync(testFile);
                    } catch (error) {
                        // Ignore cleanup errors
                    }
                }, 5000);
                break;
        }

        await this.notificationService.showInformation(
            'Claude test started. Check the terminal for output.'
        );
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}