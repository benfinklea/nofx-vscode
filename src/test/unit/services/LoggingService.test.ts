import * as vscode from 'vscode';
import { LoggingService } from '../../../services/LoggingService';
import { IConfigurationService, LogLevel } from '../../../services/interfaces';

jest.mock('vscode');

describe('LoggingService', () => {
    let loggingService: LoggingService;
    let mockMainChannel: vscode.OutputChannel;
    let mockConfigService: jest.Mocked<IConfigurationService>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleInfoSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        // Mock output channel
        mockMainChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
            clear: jest.fn(),
            replace: jest.fn() as any,
            name: 'Test Channel'
        };

        // Mock configuration service
        mockConfigService = {
            getLogLevel: jest.fn().mockReturnValue('info'),
            onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
            get: jest.fn(),
            getAll: jest.fn(),
            update: jest.fn(),
            validateAll: jest.fn(),
            validateKey: jest.fn(),
            validateObject: jest.fn(),
            getRecentProjects: jest.fn(),
            addRecentProject: jest.fn(),
            removeRecentProject: jest.fn(),
            clearRecentProjects: jest.fn(),
            getApiCredentials: jest.fn(),
            setApiCredentials: jest.fn(),
            clearApiCredentials: jest.fn(),
            getQuickPickSettings: jest.fn(),
            updateQuickPickSettings: jest.fn(),
            getFeatureFlags: jest.fn(),
            isFeatureEnabled: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        loggingService = new LoggingService(mockConfigService, mockMainChannel);
    });

    afterEach(() => {
        jest.clearAllMocks();
        consoleLogSpy.mockRestore();
        consoleInfoSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        loggingService.dispose();
    });

    describe('constructor', () => {
        it('should initialize with main channel', () => {
            expect(loggingService.getChannel('main')).toBe(mockMainChannel);
        });

        it('should initialize without config service', () => {
            const service = new LoggingService(undefined, mockMainChannel);
            expect(() => service.info('test')).not.toThrow();
            service.dispose();
        });

        it('should update log level from config service', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            const service = new LoggingService(mockConfigService, mockMainChannel);

            service.debug('test message');
            expect(mockMainChannel.appendLine).toHaveBeenCalled();

            service.dispose();
        });

        it('should listen to config changes', () => {
            const mockDisposable = { dispose: jest.fn() };
            mockConfigService.onDidChange.mockReturnValue(mockDisposable);

            const service = new LoggingService(mockConfigService, mockMainChannel);

            expect(mockConfigService.onDidChange).toHaveBeenCalled();

            service.dispose();
            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('setConfigurationService', () => {
        it('should set config service after construction', () => {
            const service = new LoggingService(undefined, mockMainChannel);

            service.setConfigurationService(mockConfigService);

            expect(mockConfigService.onDidChange).toHaveBeenCalled();
            service.dispose();
        });

        it('should not set config service if already set', () => {
            const service = new LoggingService(mockConfigService, mockMainChannel);
            const callCount = mockConfigService.onDidChange.mock.calls.length;

            service.setConfigurationService(mockConfigService);

            expect(mockConfigService.onDidChange).toHaveBeenCalledTimes(callCount);
            service.dispose();
        });
    });

    describe('log level filtering', () => {
        it('should log debug messages when level is debug', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.debug('debug message');
            loggingService.info('info message');
            loggingService.warn('warn message');
            loggingService.error('error message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledTimes(4);
        });

        it('should not log debug messages when level is info', () => {
            mockConfigService.getLogLevel.mockReturnValue('info');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.debug('debug message');
            loggingService.info('info message');
            loggingService.warn('warn message');
            loggingService.error('error message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledTimes(3);
            expect(mockMainChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('debug message'));
        });

        it('should only log warn and error when level is warn', () => {
            mockConfigService.getLogLevel.mockReturnValue('warn');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.debug('debug message');
            loggingService.info('info message');
            loggingService.warn('warn message');
            loggingService.error('error message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledTimes(2);
        });

        it('should only log error when level is error', () => {
            mockConfigService.getLogLevel.mockReturnValue('error');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.debug('debug message');
            loggingService.info('info message');
            loggingService.warn('warn message');
            loggingService.error('error message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledTimes(1);
            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('error message'));
        });

        it('should handle invalid log levels gracefully', () => {
            mockConfigService.getLogLevel.mockReturnValue('invalid');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.info('test message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('test message'));
        });

        it('should handle null/undefined log level', () => {
            mockConfigService.getLogLevel.mockReturnValue(null);
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.info('test message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('test message'));
        });
    });

    describe('message formatting', () => {
        it('should format messages with timestamp and level', () => {
            loggingService.info('test message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T.*\] INFO\s+test message/)
            );
        });

        it('should format objects as JSON', () => {
            const data = { key: 'value', nested: { prop: 123 } };
            loggingService.info('test message', data);

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining(JSON.stringify(data, null, 2))
            );
        });

        it('should append primitive data inline', () => {
            loggingService.info('test message', 'additional info');

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('test message additional info')
            );
        });

        it('should handle undefined data', () => {
            loggingService.info('test message');

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringMatching(/test message$/));
        });

        it('should handle circular references in objects', () => {
            const obj: any = { a: 1 };
            obj.circular = obj;

            // JSON.stringify will throw on circular reference
            expect(() => loggingService.info('circular test', obj)).toThrow();
        });
    });

    describe('console output', () => {
        it('should log to console in debug mode', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.debug('debug msg');
            loggingService.info('info msg');
            loggingService.warn('warn msg');
            loggingService.error('error msg');

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('debug msg'));
            expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('info msg'));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('warn msg'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('error msg'));
        });

        it('should not log to console in non-debug mode', () => {
            mockConfigService.getLogLevel.mockReturnValue('info');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.info('info msg');

            expect(consoleInfoSpy).not.toHaveBeenCalled();
        });
    });

    describe('isLevelEnabled', () => {
        it('should correctly determine if level is enabled', () => {
            mockConfigService.getLogLevel.mockReturnValue('info');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            expect(loggingService.isLevelEnabled('debug')).toBe(false);
            expect(loggingService.isLevelEnabled('info')).toBe(true);
            expect(loggingService.isLevelEnabled('warn')).toBe(true);
            expect(loggingService.isLevelEnabled('error')).toBe(true);
        });

        it('should handle invalid levels', () => {
            expect(loggingService.isLevelEnabled('invalid' as LogLevel)).toBe(false);
        });
    });

    describe('getChannel', () => {
        it('should return existing channel', () => {
            const mainChannel = loggingService.getChannel('main');
            expect(mainChannel).toBe(mockMainChannel);
        });

        it('should create new channel if not exists', () => {
            const mockNewChannel = {
                appendLine: jest.fn(),
                dispose: jest.fn()
            } as any;

            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockNewChannel);

            const channel = loggingService.getChannel('custom');

            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('NofX - custom');
            expect(channel).toBe(mockNewChannel);
        });

        it('should reuse created channels', () => {
            const mockNewChannel = {
                appendLine: jest.fn(),
                dispose: jest.fn()
            } as any;

            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockNewChannel);

            const channel1 = loggingService.getChannel('custom');
            const channel2 = loggingService.getChannel('custom');

            expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1);
            expect(channel1).toBe(channel2);
        });
    });

    describe('timing functions', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should track time between time() and timeEnd()', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.time('operation');

            jest.advanceTimersByTime(150);

            loggingService.timeEnd('operation');

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Timer operation: 150ms'));
        });

        it('should handle timeEnd without time', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.timeEnd('non-existent');

            expect(mockMainChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('Timer non-existent'));
        });

        it('should handle multiple timers', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.time('timer1');
            jest.advanceTimersByTime(100);

            loggingService.time('timer2');
            jest.advanceTimersByTime(50);

            loggingService.timeEnd('timer1');
            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Timer timer1: 150ms'));

            jest.advanceTimersByTime(25);

            loggingService.timeEnd('timer2');
            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Timer timer2: 75ms'));
        });

        it('should clear timer after timeEnd', () => {
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.time('operation');
            jest.advanceTimersByTime(100);
            loggingService.timeEnd('operation');

            // Clear mock calls
            jest.clearAllMocks();

            // Second timeEnd should not log anything
            loggingService.timeEnd('operation');
            expect(mockMainChannel.appendLine).not.toHaveBeenCalled();
        });
    });

    describe('onDidChangeConfiguration', () => {
        it('should delegate to config service', () => {
            const callback = jest.fn();
            const mockDisposable = { dispose: jest.fn() };
            mockConfigService.onDidChange.mockReturnValue(mockDisposable);

            const disposable = loggingService.onDidChangeConfiguration(callback);

            expect(mockConfigService.onDidChange).toHaveBeenCalledWith(callback);
            expect(disposable).toBe(mockDisposable);
        });

        it('should return no-op disposable without config service', () => {
            const service = new LoggingService(undefined, mockMainChannel);
            const callback = jest.fn();

            const disposable = loggingService.onDidChangeConfiguration(callback);

            expect(disposable.dispose).toBeDefined();
            expect(() => disposable.dispose()).not.toThrow();

            service.dispose();
        });
    });

    describe('dispose', () => {
        it('should dispose all disposables', () => {
            const mockDisposable = { dispose: jest.fn() };
            mockConfigService.onDidChange.mockReturnValue(mockDisposable);

            const service = new LoggingService(mockConfigService, mockMainChannel);

            service.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should dispose created channels but not main channel', () => {
            const mockCustomChannel = {
                appendLine: jest.fn(),
                dispose: jest.fn()
            } as any;

            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockCustomChannel);

            loggingService.getChannel('custom');

            loggingService.dispose();

            expect(mockCustomChannel.dispose).toHaveBeenCalled();
            expect(mockMainChannel.dispose).not.toHaveBeenCalled();
        });

        it('should clear timers', () => {
            loggingService.time('timer1');
            loggingService.time('timer2');

            loggingService.dispose();

            // Timers should be cleared, no output expected
            mockConfigService.getLogLevel.mockReturnValue('debug');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            loggingService.timeEnd('timer1');
            loggingService.timeEnd('timer2');

            expect(mockMainChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('Timer'));
        });

        it('should handle multiple dispose calls', () => {
            loggingService.dispose();
            expect(() => loggingService.dispose()).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('should handle very long messages', () => {
            const longMessage = 'a'.repeat(10000);
            loggingService.info(longMessage);

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(longMessage));
        });

        it('should handle special characters in messages', () => {
            const specialMessage = 'Test \n\r\t\b\f\v\0 message';
            loggingService.info(specialMessage);

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(specialMessage));
        });

        it('should handle error objects', () => {
            const error = new Error('Test error');
            error.stack = 'Error stack trace';

            loggingService.error('An error occurred', error);

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Test error'));
        });

        it('should handle null and undefined values', () => {
            loggingService.info('null value', null);
            loggingService.info('undefined value', undefined);

            expect(mockMainChannel.appendLine).toHaveBeenCalledTimes(2);
        });

        it('should handle arrays', () => {
            const array = [1, 2, 3, { nested: true }];
            loggingService.info('array data', array);

            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining(JSON.stringify(array, null, 2))
            );
        });

        it('should handle configuration changes dynamically', () => {
            mockConfigService.getLogLevel.mockReturnValue('error');
            loggingService = new LoggingService(mockConfigService, mockMainChannel);

            // Initially only error should log
            loggingService.info('info message 1');
            expect(mockMainChannel.appendLine).not.toHaveBeenCalled();

            // Change config
            mockConfigService.getLogLevel.mockReturnValue('info');
            const changeCallback = mockConfigService.onDidChange.mock.calls[0][0];
            changeCallback();

            // Now info should log
            loggingService.info('info message 2');
            expect(mockMainChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('info message 2'));
        });
    });
});
