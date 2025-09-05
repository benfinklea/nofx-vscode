import * as vscode from 'vscode';
import { IErrorHandler, ErrorSeverity, ILoggingService, INotificationService } from './interfaces';

export class ErrorHandler implements IErrorHandler {
    private readonly errorCounts: Map<string, number> = new Map();
    private readonly lastErrorTimes: Map<string, number> = new Map();
    private readonly maxErrorFrequency = 5; // Max errors per minute per context
    private readonly errorWindowMs = 60000; // 1 minute window

    constructor(
        private loggingService: ILoggingService,
        private notificationService: INotificationService
    ) {}

    private shouldShowNotification(context: string, severity: ErrorSeverity): boolean {
        // Always show high severity errors
        if (severity === 'high') {
            return true;
        }

        // Check error frequency for medium and low severity
        const now = Date.now();
        const lastTime = this.lastErrorTimes.get(context) || 0;
        const count = this.errorCounts.get(context) || 0;

        // Reset counter if outside the time window
        if (now - lastTime > this.errorWindowMs) {
            this.errorCounts.set(context, 0);
            this.lastErrorTimes.set(context, now);
            return true;
        }

        // Show notification if under the frequency limit
        if (count < this.maxErrorFrequency) {
            this.errorCounts.set(context, count + 1);
            this.lastErrorTimes.set(context, now);
            return true;
        }

        return false;
    }

    private getErrorMessage(error: Error, context?: string): string {
        let message = error.message || 'An unknown error occurred';
        
        if (context) {
            message = `${context}: ${message}`;
        }

        // Add more context for common error types
        if (error.name === 'TypeError') {
            message += ' (Type error - check data types)';
        } else if (error.name === 'ReferenceError') {
            message += ' (Reference error - check variable names)';
        } else if (error.name === 'SyntaxError') {
            message += ' (Syntax error - check code syntax)';
        }

        return message;
    }

    private getNotificationMessage(error: Error, context?: string, severity?: ErrorSeverity): string {
        const baseMessage = this.getErrorMessage(error, context);
        
        switch (severity) {
            case 'high':
                return `Critical Error: ${baseMessage}`;
            case 'medium':
                return `Error: ${baseMessage}`;
            case 'low':
            default:
                return baseMessage;
        }
    }

    private logError(error: Error, context?: string, severity?: ErrorSeverity): void {
        const logMessage = context ? `${context}: ${error.message}` : error.message;
        const logData = {
            name: error.name,
            stack: error.stack,
            severity: severity || 'medium',
            context: context || 'unknown'
        };

        this.loggingService.error(logMessage, logData);
    }

    handleError(error: Error, context?: string, severity: ErrorSeverity = 'medium'): void {
        // Always log the error
        this.logError(error, context, severity);

        // Show notification based on severity and frequency
        if (this.shouldShowNotification(context || 'unknown', severity)) {
            const notificationMessage = this.getNotificationMessage(error, context, severity);
            
            // Use appropriate notification method based on severity
            switch (severity) {
                case 'high':
                    this.notificationService.showError(notificationMessage);
                    break;
                case 'medium':
                    this.notificationService.showWarning(notificationMessage);
                    break;
                case 'low':
                    this.notificationService.showInformation(notificationMessage);
                    break;
            }
        }
    }

    async handleAsync<T>(operation: () => Promise<T>, context?: string): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.handleError(err, context);
            throw err; // Re-throw to maintain error propagation
        }
    }

    wrapSync<T>(operation: () => T, context?: string): T {
        try {
            return operation();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.handleError(err, context);
            throw err; // Re-throw to maintain error propagation
        }
    }

    async withRetry<T>(
        operation: () => Promise<T>, 
        maxRetries: number = 3, 
        context?: string
    ): Promise<T> {
        let lastError: Error | undefined;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                if (attempt < maxRetries) {
                    const retryMessage = `Attempt ${attempt}/${maxRetries} failed, retrying...`;
                    this.loggingService.warn(retryMessage, { 
                        context, 
                        error: lastError.message,
                        attempt 
                    });
                    
                    // Exponential backoff: wait 1s, 2s, 4s, etc.
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    this.loggingService.error(`All ${maxRetries} attempts failed`, {
                        context,
                        error: lastError.message,
                        attempts: maxRetries
                    });
                }
            }
        }
        
        // If we get here, all retries failed
        this.handleError(lastError!, context, 'high');
        throw lastError!;
    }

    // Helper method for categorizing errors
    categorizeError(error: Error): ErrorSeverity {
        // High severity errors
        if (error.name === 'TypeError' && error.message.includes('Cannot read property')) {
            return 'high';
        }
        if (error.message.includes('ENOENT') || error.message.includes('file not found')) {
            return 'high';
        }
        if (error.message.includes('permission denied') || error.message.includes('EACCES')) {
            return 'high';
        }

        // Medium severity errors
        if (error.name === 'ReferenceError') {
            return 'medium';
        }
        if (error.name === 'SyntaxError') {
            return 'medium';
        }
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
            return 'medium';
        }

        // Low severity errors (default)
        return 'low';
    }

    // Method to clear error frequency tracking (useful for testing or manual reset)
    clearErrorTracking(): void {
        this.errorCounts.clear();
        this.lastErrorTimes.clear();
    }

    // Get error statistics for debugging
    getErrorStats(): { context: string; count: number; lastTime: number }[] {
        const stats: { context: string; count: number; lastTime: number }[] = [];
        
        for (const [context, count] of this.errorCounts.entries()) {
            const lastTime = this.lastErrorTimes.get(context) || 0;
            stats.push({ context, count, lastTime });
        }
        
        return stats;
    }

    dispose(): void {
        this.errorCounts.clear();
        this.lastErrorTimes.clear();
    }
}
