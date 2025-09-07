import { ErrorHandler } from '../../../services/ErrorHandler';
import { ILoggingService, INotificationService, ErrorSeverity } from '../../../services/interfaces';

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;
    let mockLoggingService: jest.Mocked<ILoggingService>;
    let mockNotificationService: jest.Mocked<INotificationService>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();

        // Mock LoggingService
        mockLoggingService = {
            log: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        } as any;

        // Mock NotificationService
        mockNotificationService = {
            showInformation: jest.fn().mockResolvedValue(undefined),
            showWarning: jest.fn().mockResolvedValue(undefined),
            showError: jest.fn().mockResolvedValue(undefined),
            showInputBox: jest.fn(),
            showQuickPick: jest.fn()
        } as any;

        errorHandler = new ErrorHandler(mockLoggingService, mockNotificationService);
    });

    describe('handleError', () => {
        it('should log errors and show notifications based on severity', () => {
            const error = new Error('Test error');

            // Test high severity
            errorHandler.handleError(error, 'TestContext', 'high');
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'TestContext: Test error',
                expect.objectContaining({
                    name: 'Error',
                    severity: 'high',
                    context: 'TestContext'
                })
            );
            expect(mockNotificationService.showError).toHaveBeenCalledWith('Critical Error: TestContext: Test error');

            // Test medium severity
            errorHandler.handleError(error, 'TestContext', 'medium');
            expect(mockNotificationService.showWarning).toHaveBeenCalledWith('Error: TestContext: Test error');

            // Test low severity
            errorHandler.handleError(error, 'TestContext', 'low');
            expect(mockNotificationService.showInformation).toHaveBeenCalledWith('TestContext: Test error');
        });

        it('should handle errors without context', () => {
            const error = new Error('No context error');
            errorHandler.handleError(error);

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'No context error',
                expect.objectContaining({
                    name: 'Error',
                    severity: 'medium',
                    context: 'unknown'
                })
            );
        });

        it('should throttle notifications for non-high severity errors', () => {
            const error = new Error('Repeated error');
            const context = 'RepeatContext';

            // Should show first 5 notifications within a minute
            for (let i = 0; i < 5; i++) {
                errorHandler.handleError(error, context, 'medium');
            }
            expect(mockNotificationService.showWarning).toHaveBeenCalledTimes(5);

            // 6th error should not show notification
            errorHandler.handleError(error, context, 'medium');
            expect(mockNotificationService.showWarning).toHaveBeenCalledTimes(5);
            expect(mockLoggingService.error).toHaveBeenCalledTimes(6); // But still logged
        });

        it('should always show high severity errors regardless of frequency', () => {
            const error = new Error('Critical error');
            const context = 'CriticalContext';

            // Should show all high severity notifications
            for (let i = 0; i < 10; i++) {
                errorHandler.handleError(error, context, 'high');
            }
            expect(mockNotificationService.showError).toHaveBeenCalledTimes(10);
        });

        it('should add context to specific error types', () => {
            const typeError = new TypeError('Cannot read property');
            errorHandler.handleError(typeError, 'TestContext');

            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                expect.stringContaining('(Type error - check data types)')
            );

            const refError = new ReferenceError('x is not defined');
            errorHandler.handleError(refError, 'TestContext');

            expect(mockNotificationService.showWarning).toHaveBeenCalledWith(
                expect.stringContaining('(Reference error - check variable names)')
            );
        });
    });

    describe('handleAsync', () => {
        it('should handle successful async operations', async () => {
            const result = await errorHandler.handleAsync(
                async () => 'success',
                'AsyncContext'
            );

            expect(result).toBe('success');
            expect(mockLoggingService.error).not.toHaveBeenCalled();
        });

        it('should handle failed async operations and re-throw', async () => {
            const error = new Error('Async error');

            await expect(
                errorHandler.handleAsync(
                    async () => { throw error; },
                    'AsyncContext'
                )
            ).rejects.toThrow('Async error');

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'AsyncContext: Async error',
                expect.objectContaining({
                    name: 'Error',
                    context: 'AsyncContext'
                })
            );
        });

        it('should convert non-Error objects to Error', async () => {
            await expect(
                errorHandler.handleAsync(
                    async () => { throw 'string error'; },
                    'AsyncContext'
                )
            ).rejects.toThrow('string error');

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'AsyncContext: string error',
                expect.objectContaining({
                    name: 'Error'
                })
            );
        });
    });

    describe('wrapSync', () => {
        it('should handle successful sync operations', () => {
            const result = errorHandler.wrapSync(
                () => 'success',
                'SyncContext'
            );

            expect(result).toBe('success');
            expect(mockLoggingService.error).not.toHaveBeenCalled();
        });

        it('should handle failed sync operations and re-throw', () => {
            const error = new Error('Sync error');

            expect(() =>
                errorHandler.wrapSync(
                    () => { throw error; },
                    'SyncContext'
                )
            ).toThrow('Sync error');

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'SyncContext: Sync error',
                expect.objectContaining({
                    name: 'Error',
                    context: 'SyncContext'
                })
            );
        });

        it('should convert non-Error objects to Error', () => {
            expect(() =>
                errorHandler.wrapSync(
                    () => { throw 'string error'; },
                    'SyncContext'
                )
            ).toThrow('string error');

            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'SyncContext: string error',
                expect.objectContaining({
                    name: 'Error'
                })
            );
        });
    });

    describe('withRetry', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const promise = errorHandler.withRetry(operation, 3, 'RetryContext');
            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
            expect(mockLoggingService.warn).not.toHaveBeenCalled();
        });

        it('should retry on failure and succeed on subsequent attempt', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('First fail'))
                .mockRejectedValueOnce(new Error('Second fail'))
                .mockResolvedValueOnce('success');

            const promise = errorHandler.withRetry(operation, 3, 'RetryContext');

            // Let all timers and promises resolve
            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
            expect(mockLoggingService.warn).toHaveBeenCalledTimes(2);
            expect(mockLoggingService.warn).toHaveBeenCalledWith(
                'Attempt 1/3 failed, retrying...',
                expect.objectContaining({
                    context: 'RetryContext',
                    error: 'First fail',
                    attempt: 1
                })
            );
        });

        it('should throw after all retries fail', async () => {
            const error = new Error('Persistent error');
            const operation = jest.fn().mockRejectedValue(error);

            const promise = errorHandler.withRetry(operation, 3, 'RetryContext');

            // Let all timers and promises resolve
            await jest.runAllTimersAsync();

            await expect(promise).rejects.toThrow('Persistent error');

            expect(operation).toHaveBeenCalledTimes(3);
            expect(mockLoggingService.error).toHaveBeenCalledWith(
                'All 3 attempts failed',
                expect.objectContaining({
                    context: 'RetryContext',
                    error: 'Persistent error',
                    attempts: 3
                })
            );
            expect(mockNotificationService.showError).toHaveBeenCalledWith(
                expect.stringContaining('Persistent error')
            );
        });

        it('should use exponential backoff for retries', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValueOnce('success');

            const promise = errorHandler.withRetry(operation, 3, 'RetryContext');

            // First attempt fails immediately
            await jest.advanceTimersByTimeAsync(0);
            expect(operation).toHaveBeenCalledTimes(1);

            // Wait 1 second for first retry
            await jest.advanceTimersByTimeAsync(1000);
            expect(operation).toHaveBeenCalledTimes(2);

            // Wait 2 seconds for second retry
            await jest.advanceTimersByTimeAsync(2000);
            expect(operation).toHaveBeenCalledTimes(3);

            const result = await promise;
            expect(result).toBe('success');
        });
    });

    describe('categorizeError', () => {
        it('should categorize TypeError as high severity', () => {
            const error = new TypeError('Cannot read property of undefined');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('high');
        });

        it('should categorize file not found errors as high severity', () => {
            const error = new Error('ENOENT: file not found');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('high');
        });

        it('should categorize permission errors as high severity', () => {
            const error = new Error('EACCES: permission denied');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('high');
        });

        it('should categorize ReferenceError as medium severity', () => {
            const error = new ReferenceError('x is not defined');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('medium');
        });

        it('should categorize SyntaxError as medium severity', () => {
            const error = new SyntaxError('Unexpected token');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('medium');
        });

        it('should categorize timeout errors as medium severity', () => {
            const error = new Error('Request timeout');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('medium');
        });

        it('should categorize unknown errors as low severity', () => {
            const error = new Error('Some random error');
            const severity = errorHandler.categorizeError(error);
            expect(severity).toBe('low');
        });
    });

    describe('clearErrorTracking', () => {
        it('should reset error frequency tracking', () => {
            const error = new Error('Test error');
            const context = 'TestContext';

            // Fill up the error limit
            for (let i = 0; i < 5; i++) {
                errorHandler.handleError(error, context, 'medium');
            }
            expect(mockNotificationService.showWarning).toHaveBeenCalledTimes(5);

            // Next error should not show
            errorHandler.handleError(error, context, 'medium');
            expect(mockNotificationService.showWarning).toHaveBeenCalledTimes(5);

            // Clear tracking
            errorHandler.clearErrorTracking();

            // Now errors should show again
            errorHandler.handleError(error, context, 'medium');
            expect(mockNotificationService.showWarning).toHaveBeenCalledTimes(6);
        });
    });
});
