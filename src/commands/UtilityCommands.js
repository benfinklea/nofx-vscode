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
exports.UtilityCommands = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const interfaces_1 = require("../services/interfaces");
class UtilityCommands {
    constructor(container) {
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolveOptional(interfaces_1.SERVICE_TOKENS.LoggingService);
    }
    register() {
        this.commandService.register('nofx.testClaude', this.testClaude.bind(this));
        this.commandService.register('nofx.debug.verifyCommands', this.verifyCommands.bind(this));
    }
    async testClaude() {
        const testTypes = [
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
                await this.notificationService.showInformation('Claude started in interactive mode. Type your messages and press Enter.');
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
                setTimeout(() => {
                    try {
                        fs.unlinkSync(testFile);
                    }
                    catch (error) {
                    }
                }, 5000);
                break;
        }
        await this.notificationService.showInformation('Claude test started. Check the terminal for output.');
    }
    async verifyCommands() {
        const config = vscode.workspace.getConfiguration('nofx');
        const testMode = config.get('testMode', false);
        const isDev = process.env.NODE_ENV === 'development';
        if (!testMode && !isDev) {
            await this.notificationService.showWarning('Command verification is only available in test mode. Set nofx.testMode to true in settings.');
            return;
        }
        try {
            const registeredCommands = await this.commandService.getCommands(true);
            const registeredSet = new Set(registeredCommands);
            const extension = vscode.extensions.getExtension('nofx.nofx');
            if (!extension) {
                throw new Error('NofX extension not found');
            }
            const packageJson = extension.packageJSON;
            const expectedCommands = packageJson.contributes?.commands?.map((cmd) => cmd.command) || [];
            const missingCommands = expectedCommands.filter((cmd) => !registeredSet.has(cmd));
            const outputChannel = vscode.window.createOutputChannel('NofX Command Verification');
            outputChannel.show();
            outputChannel.appendLine('=== NofX Command Verification ===');
            outputChannel.appendLine(`Total expected commands: ${expectedCommands.length}`);
            outputChannel.appendLine(`Total registered commands: ${registeredCommands.filter(cmd => cmd.startsWith('nofx.')).length}`);
            outputChannel.appendLine('');
            if (missingCommands.length > 0) {
                outputChannel.appendLine('❌ Missing Commands:');
                missingCommands.forEach((cmd) => {
                    outputChannel.appendLine(`  - ${cmd}`);
                });
                this.loggingService?.warn(`Missing commands detected: ${missingCommands.join(', ')}`);
                await this.notificationService.showWarning(`${missingCommands.length} commands are not registered. Check the output channel for details.`);
            }
            else {
                outputChannel.appendLine('✅ All expected commands are registered!');
                this.loggingService?.info(`All ${expectedCommands.length} expected commands are registered`);
                await this.notificationService.showInformation(`All ${expectedCommands.length} commands verified successfully!`);
            }
            const nofxCommands = registeredCommands.filter(cmd => cmd.startsWith('nofx.'));
            const extraCommands = nofxCommands.filter(cmd => !expectedCommands.includes(cmd));
            if (extraCommands.length > 0) {
                outputChannel.appendLine('');
                outputChannel.appendLine('📝 Extra Commands (not in package.json):');
                extraCommands.forEach((cmd) => {
                    outputChannel.appendLine(`  - ${cmd}`);
                });
                this.loggingService?.debug(`Extra commands registered: ${extraCommands.join(', ')}`);
            }
            outputChannel.appendLine('');
            outputChannel.appendLine('=== End of Verification ===');
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error('Error verifying commands', err);
            await this.notificationService.showError(`Failed to verify commands: ${err.message}`);
        }
    }
    dispose() {
    }
}
exports.UtilityCommands = UtilityCommands;
//# sourceMappingURL=UtilityCommands.js.map