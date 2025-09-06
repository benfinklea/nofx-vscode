import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    ILoggingService,
    SERVICE_TOKENS
} from '../services/interfaces';
import { PickItem } from '../types/ui';

export class UtilityCommands implements ICommandHandler {
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly loggingService?: ILoggingService;

    constructor(container: IContainer) {
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolveOptional<ILoggingService>(SERVICE_TOKENS.LoggingService);
    }

    register(): void {
        this.commandService.register('nofx.testClaude', this.testClaude.bind(this));
        this.commandService.register('nofx.debug.verifyCommands', this.verifyCommands.bind(this));
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

    /**
     * Debug command to verify all expected commands are registered.
     * Only runs in test mode or development.
     */
    private async verifyCommands(): Promise<void> {
        // Check if we're in test mode or development
        const config = vscode.workspace.getConfiguration('nofx');
        const testMode = config.get<boolean>('testMode', false);
        const isDev = process.env.NODE_ENV === 'development';

        if (!testMode && !isDev) {
            await this.notificationService.showWarning(
                'Command verification is only available in test mode. Set nofx.testMode to true in settings.'
            );
            return;
        }

        try {
            // Get all registered commands
            const registeredCommands = await this.commandService.getCommands(true);
            const registeredSet = new Set(registeredCommands);

            // Get expected commands from package.json
            const extension = vscode.extensions.getExtension('nofx.nofx');
            if (!extension) {
                throw new Error('NofX extension not found');
            }

            const packageJson = extension.packageJSON;
            const expectedCommands = packageJson.contributes?.commands?.map((cmd: any) => cmd.command) || [];

            // Find missing commands
            const missingCommands = expectedCommands.filter((cmd: string) => !registeredSet.has(cmd));

            // Log results
            const outputChannel = vscode.window.createOutputChannel('NofX Command Verification');
            outputChannel.show();
            outputChannel.appendLine('=== NofX Command Verification ===');
            outputChannel.appendLine(`Total expected commands: ${expectedCommands.length}`);
            outputChannel.appendLine(`Total registered commands: ${registeredCommands.filter(cmd => cmd.startsWith('nofx.')).length}`);
            outputChannel.appendLine('');

            if (missingCommands.length > 0) {
                outputChannel.appendLine('❌ Missing Commands:');
                missingCommands.forEach((cmd: string) => {
                    outputChannel.appendLine(`  - ${cmd}`);
                });

                this.loggingService?.warn(`Missing commands detected: ${missingCommands.join(', ')}`);
                await this.notificationService.showWarning(
                    `${missingCommands.length} commands are not registered. Check the output channel for details.`
                );
            } else {
                outputChannel.appendLine('✅ All expected commands are registered!');

                this.loggingService?.info(`All ${expectedCommands.length} expected commands are registered`);
                await this.notificationService.showInformation(
                    `All ${expectedCommands.length} commands verified successfully!`
                );
            }

            // Also log any extra registered nofx commands not in package.json
            const nofxCommands = registeredCommands.filter(cmd => cmd.startsWith('nofx.'));
            const extraCommands = nofxCommands.filter(cmd => !expectedCommands.includes(cmd));

            if (extraCommands.length > 0) {
                outputChannel.appendLine('');
                outputChannel.appendLine('📝 Extra Commands (not in package.json):');
                extraCommands.forEach((cmd: string) => {
                    outputChannel.appendLine(`  - ${cmd}`);
                });

                this.loggingService?.debug(`Extra commands registered: ${extraCommands.join(', ')}`);
            }

            outputChannel.appendLine('');
            outputChannel.appendLine('=== End of Verification ===');

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error('Error verifying commands', err);
            await this.notificationService.showError(`Failed to verify commands: ${err.message}`);
        }
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}
