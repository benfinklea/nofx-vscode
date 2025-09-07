import * as vscode from 'vscode';
import { ILoggingService, LogLevel, IConfigurationService, CONFIG_KEYS } from './interfaces';

export class LoggingService implements ILoggingService {
    private readonly mainChannel: vscode.OutputChannel;
    private readonly channels: Map<string, vscode.OutputChannel> = new Map();
    private readonly timers: Map<string, number> = new Map();
    private readonly disposables: vscode.Disposable[] = [];
    private currentLogLevel: LogLevel = 'info';

    constructor(
        private configService: IConfigurationService | undefined,
        mainChannel: vscode.OutputChannel
    ) {
        this.mainChannel = mainChannel;
        this.channels.set('main', this.mainChannel);

        // Initialize log level from configuration if available
        if (this.configService) {
            this.updateLogLevel();

            // Listen for configuration changes
            const disposable = this.configService.onDidChange(() => {
                this.updateLogLevel();
            });
            this.disposables.push(disposable);
        }
    }

    /**
     * Set the configuration service after construction to avoid circular dependency
     */
    public setConfigurationService(configService: IConfigurationService): void {
        if (this.configService) return; // Already set

        this.configService = configService;
        this.updateLogLevel();

        // Listen for configuration changes
        const disposable = this.configService.onDidChange(() => {
            this.updateLogLevel();
        });
        this.disposables.push(disposable);
    }

    private updateLogLevel(): void {
        const raw = this.configService?.getLogLevel?.();
        if (!raw) {
            this.currentLogLevel = 'info';
            return;
        }

        const configLevel = String(raw).toLowerCase() as LogLevel;
        if (['debug', 'info', 'warn', 'error'].includes(configLevel)) {
            this.currentLogLevel = configLevel;
        } else {
            this.currentLogLevel = 'info';
        }
    }

    private _isLevelEnabled(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        const currentIndex = levels.indexOf(this.currentLogLevel);
        const targetIndex = levels.indexOf(level);
        return targetIndex >= currentIndex;
    }

    private formatMessage(level: LogLevel, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);

        let formattedMessage = `[${timestamp}] ${levelStr} ${message}`;

        if (data !== undefined) {
            if (typeof data === 'object') {
                formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
            } else {
                formattedMessage += ` ${data}`;
            }
        }

        return formattedMessage;
    }

    private log(level: LogLevel, message: string, data?: any): void {
        if (!this._isLevelEnabled(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, data);

        // Write to main channel
        this.mainChannel.appendLine(formattedMessage);

        // Console fallback for development
        if (this.currentLogLevel === 'debug') {
            const consoleMethod =
                level === 'error'
                    ? console.error
                    : level === 'warn'
                      ? console.warn
                      : level === 'info'
                        ? console.info
                        : console.log;
            consoleMethod(formattedMessage);
        }
    }

    debug(message: string, data?: any): void {
        this.log('debug', message, data);
    }

    info(message: string, data?: any): void {
        this.log('info', message, data);
    }

    warn(message: string, data?: any): void {
        this.log('warn', message, data);
    }

    error(message: string, data?: any): void {
        this.log('error', message, data);
    }

    isLevelEnabled(level: LogLevel): boolean {
        return this._isLevelEnabled(level);
    }

    getChannel(name: string): vscode.OutputChannel {
        if (!this.channels.has(name)) {
            const channel = vscode.window.createOutputChannel(`NofX - ${name}`);
            this.channels.set(name, channel);
        }
        return this.channels.get(name)!;
    }

    time(label: string): void {
        this.timers.set(label, Date.now());
    }

    timeEnd(label: string): void {
        const startTime = this.timers.get(label);
        if (startTime !== undefined) {
            const duration = Date.now() - startTime;
            this.debug(`Timer ${label}: ${duration}ms`);
            this.timers.delete(label);
        }
    }

    onDidChangeConfiguration(callback: () => void): vscode.Disposable {
        if (this.configService) {
            return this.configService.onDidChange(callback);
        }
        // Return a no-op disposable if no config service
        return { dispose: () => {} };
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;

        // Only dispose channels created by this service, not the injected main channel
        this.channels.forEach((channel, name) => {
            if (name !== 'main') {
                channel.dispose();
            }
        });
        this.channels.clear();

        this.timers.clear();
    }
}
