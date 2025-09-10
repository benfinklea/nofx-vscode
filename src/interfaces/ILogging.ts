// Simplified logging interfaces - entrepreneur friendly

export interface ILogger {
    log(message: string, level?: LogLevel): void;
    error(message: string, error?: Error | any): void;
    info?(message: string, data?: any): void;
    warn?(message: string, data?: any): void;
    debug?(message: string, data?: any): void;
    isLevelEnabled?(level: string): boolean;
    onDidChangeConfiguration?(): any;
}

export interface ILogQuery {
    getLogs(options?: LogQueryOptions): LogEntry[];
}

export type LogLevel = 'trace' | 'debug' | 'agents' | 'info' | 'warn' | 'error' | 'none';

export interface LogQueryOptions {
    level?: LogLevel;
    limit?: number;
    since?: Date;
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    error?: Error;
}
