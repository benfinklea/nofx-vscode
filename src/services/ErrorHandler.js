"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
class ErrorHandler {
    constructor(loggingService, notificationService) {
        this.loggingService = loggingService;
        this.notificationService = notificationService;
        this.errorCounts = new Map();
        this.lastErrorTimes = new Map();
        this.maxErrorFrequency = 5;
        this.errorWindowMs = 60000;
    }
    shouldShowNotification(context, severity) {
        if (severity === 'high') {
            return true;
        }
        const now = Date.now();
        const lastTime = this.lastErrorTimes.get(context) || 0;
        const count = this.errorCounts.get(context) || 0;
        if (now - lastTime > this.errorWindowMs) {
            this.errorCounts.set(context, 0);
            this.lastErrorTimes.set(context, now);
            return true;
        }
        if (count < this.maxErrorFrequency) {
            this.errorCounts.set(context, count + 1);
            this.lastErrorTimes.set(context, now);
            return true;
        }
        return false;
    }
    getErrorMessage(error, context) {
        let message = error.message || 'An unknown error occurred';
        if (context) {
            message = `${context}: ${message}`;
        }
        if (error.name === 'TypeError') {
            message += ' (Type error - check data types)';
        }
        else if (error.name === 'ReferenceError') {
            message += ' (Reference error - check variable names)';
        }
        else if (error.name === 'SyntaxError') {
            message += ' (Syntax error - check code syntax)';
        }
        return message;
    }
    getNotificationMessage(error, context, severity) {
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
    logError(error, context, severity) {
        const logMessage = context ? `${context}: ${error.message}` : error.message;
        const logData = {
            name: error.name,
            stack: error.stack,
            severity: severity || 'medium',
            context: context || 'unknown'
        };
        this.loggingService.error(logMessage, logData);
    }
    handleError(error, context, severity = 'medium') {
        this.logError(error, context, severity);
        if (this.shouldShowNotification(context || 'unknown', severity)) {
            const notificationMessage = this.getNotificationMessage(error, context, severity);
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
    async handleAsync(operation, context) {
        try {
            return await operation();
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.handleError(err, context);
            throw err;
        }
    }
    wrapSync(operation, context) {
        try {
            return operation();
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.handleError(err, context);
            throw err;
        }
    }
    async withRetry(operation, maxRetries = 3, context) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < maxRetries) {
                    const retryMessage = `Attempt ${attempt}/${maxRetries} failed, retrying...`;
                    this.loggingService.warn(retryMessage, {
                        context,
                        error: lastError.message,
                        attempt
                    });
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                else {
                    this.loggingService.error(`All ${maxRetries} attempts failed`, {
                        context,
                        error: lastError.message,
                        attempts: maxRetries
                    });
                }
            }
        }
        this.handleError(lastError, context, 'high');
        throw lastError;
    }
    categorizeError(error) {
        if (error.name === 'TypeError' && error.message.includes('Cannot read property')) {
            return 'high';
        }
        if (error.message.includes('ENOENT') || error.message.includes('file not found')) {
            return 'high';
        }
        if (error.message.includes('permission denied') || error.message.includes('EACCES')) {
            return 'high';
        }
        if (error.name === 'ReferenceError') {
            return 'medium';
        }
        if (error.name === 'SyntaxError') {
            return 'medium';
        }
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
            return 'medium';
        }
        return 'low';
    }
    clearErrorTracking() {
        this.errorCounts.clear();
        this.lastErrorTimes.clear();
    }
    getErrorStats() {
        const stats = [];
        for (const [context, count] of this.errorCounts.entries()) {
            const lastTime = this.lastErrorTimes.get(context) || 0;
            stats.push({ context, count, lastTime });
        }
        return stats;
    }
    dispose() {
        this.errorCounts.clear();
        this.lastErrorTimes.clear();
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=ErrorHandler.js.map