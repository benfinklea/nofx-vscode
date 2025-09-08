import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OUTPUT_CHANNELS } from '../constants/outputChannels';
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
import { AIProviderResolver } from '../services/AIProviderResolver';

export class UtilityCommands implements ICommandHandler {
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly loggingService?: ILoggingService;
    private readonly aiResolver: AIProviderResolver;

    constructor(container: IContainer) {
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolveOptional<ILoggingService>(SERVICE_TOKENS.LoggingService);
        this.aiResolver = new AIProviderResolver(this.configService);
    }

    register(): void {
        this.commandService.register('nofx.testClaude', this.testClaude.bind(this));
        this.commandService.register('nofx.debug.verifyCommands', this.verifyCommands.bind(this));
        this.commandService.register('nofx.selectAiProvider', this.selectAiProvider.bind(this));
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

        const aiCommand = this.aiResolver.getAiCommand();
        const terminal = vscode.window.createTerminal('Claude Test');
        terminal.show();

        const testValue = testType.value;
        switch (testValue) {
            case 'simple':
                terminal.sendText(`${aiCommand} "What is 2+2?"`);
                break;

            case 'interactive':
                terminal.sendText(aiCommand);
                await this.notificationService.showInformation(
                    `${this.aiResolver.getCurrentProviderDescription()} started in interactive mode. Type your messages and press Enter.`
                );
                break;

            case 'heredoc':
                const heredocScript = `
cat << 'EOF' | ${aiCommand}
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

                const testFile = path.join(workspaceFolder.uri.fsPath, '.ai-test.txt');
                fs.writeFileSync(testFile, 'What programming languages do you know?');
                terminal.sendText(`${aiCommand} < "${testFile}"`);

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
            `${this.aiResolver.getCurrentProviderDescription()} test started. Check the terminal for output.`
        );
    }

    private async selectAiProvider(): Promise<void> {
        const providers = this.aiResolver.getAllProviders();
        const currentProvider = this.configService.getAiProvider();

        const providerItems: PickItem<string>[] = [
            { label: '$(zap) Claude Code', description: 'Anthropic Claude Code CLI (Recommended)', value: 'claude' },
            { label: '$(tools) Aider', description: 'AI pair programming in the terminal', value: 'aider' },
            {
                label: '$(github) GitHub Copilot CLI',
                description: 'GitHub Copilot command line interface',
                value: 'copilot'
            },
            { label: '$(cursor) Cursor AI', description: 'Cursor AI chat interface', value: 'cursor' },
            { label: '$(code) Codeium', description: 'Codeium AI coding assistant', value: 'codeium' },
            { label: '$(play) Continue.dev', description: 'Open-source AI code assistant', value: 'continue' },
            { label: '$(settings-gear) Custom Command', description: 'Use a custom AI CLI command', value: 'custom' }
        ];

        // Mark current provider
        const selectedItem = providerItems.find(item => item.value === currentProvider);
        if (selectedItem) {
            selectedItem.label = `$(check) ${selectedItem.label.replace('$(check) ', '')}`;
        }

        const selectedProvider = await this.notificationService.showQuickPick(providerItems, {
            placeHolder: `Current: ${this.aiResolver.getCurrentProviderDescription()}`,
            title: 'Select AI Provider for NofX Agents'
        });

        if (!selectedProvider) {
            return;
        }

        // Update the provider
        try {
            await this.configService.update('aiProvider', selectedProvider.value);

            // If custom was selected, also prompt for the custom command
            if (selectedProvider.value === 'custom') {
                const customCommand = await vscode.window.showInputBox({
                    prompt: 'Enter your custom AI CLI command',
                    placeHolder: 'e.g., /usr/local/bin/my-ai-tool, python ai_wrapper.py, etc.',
                    value: this.configService.getAiPath()
                });

                if (customCommand) {
                    await this.configService.update('aiPath', customCommand);
                    await this.notificationService.showInformation(
                        `✅ AI Provider set to custom command: ${customCommand}`
                    );
                } else {
                    // Revert provider selection if they cancelled custom input
                    await this.configService.update('aiProvider', currentProvider);
                    return;
                }
            } else {
                const config = providers[selectedProvider.value];
                if (config) {
                    await this.notificationService.showInformation(
                        `✅ AI Provider set to ${config.name}. All new agents will use: ${config.command}`
                    );
                }
            }

            // Log the change
            this.loggingService?.info(`AI provider changed from ${currentProvider} to ${selectedProvider.value}`);

            // Show info about system prompt support
            if (!this.aiResolver.supportsSystemPrompt()) {
                await this.notificationService.showInformation(
                    `⚠️ Note: ${selectedProvider.label.replace(/\$\([^)]+\)\s*/, '')} doesn't support system prompts. ` +
                        `Agents will start without context and you'll need to manually provide instructions.`
                );
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error(`Failed to update AI provider: ${err.message}`, err);
            await this.notificationService.showError(`Failed to update AI provider: ${err.message}`);
        }
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
            const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNELS.COMMAND_VERIFICATION);
            outputChannel.show();
            outputChannel.appendLine('=== NofX Command Verification ===');
            outputChannel.appendLine(`Total expected commands: ${expectedCommands.length}`);
            outputChannel.appendLine(
                `Total registered commands: ${registeredCommands.filter(cmd => cmd.startsWith('nofx.')).length}`
            );
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
