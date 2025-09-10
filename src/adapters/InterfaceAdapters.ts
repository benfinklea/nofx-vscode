// Adapters for backward compatibility during migration

import { ILogger, ILogQuery } from '../interfaces/ILogging';
import { IEventEmitter, IEventSubscriber } from '../interfaces/IEvent';
import { IAgentLifecycle, IAgentQuery } from '../interfaces/IAgent';
import { ITaskManager } from '../interfaces/ITask';
import { IConfiguration } from '../interfaces/IConfiguration';

// Adapter to map old complex interfaces to new simple ones
export class InterfaceAdapter {
    // Map old logging methods to new simple interface
    static adaptLogging(oldLogger: any): ILogger & ILogQuery {
        return {
            log: (message: string, level?: any) => {
                // Map old method calls to new interface
                if (oldLogger.info && level === 'info') oldLogger.info(message);
                else if (oldLogger.warn && level === 'warn') oldLogger.warn(message);
                else if (oldLogger.error && level === 'error') oldLogger.error(message);
                else if (oldLogger.debug && level === 'debug') oldLogger.debug(message);
                else if (oldLogger.log) oldLogger.log(message);
            },
            error: (message: string, error?: Error) => {
                if (oldLogger.error) oldLogger.error(message, error);
            },
            getLogs: (options?: any) => {
                if (oldLogger.getLogs) return oldLogger.getLogs(options);
                return [];
            }
        };
    }

    // Map old event methods to new simple interface
    static adaptEvents(oldEventBus: any): IEventEmitter & IEventSubscriber {
        return {
            emit: (event: string, data?: any) => {
                if (oldEventBus.emit) oldEventBus.emit(event, data);
                else if (oldEventBus.fire) oldEventBus.fire(event, data);
                else if (oldEventBus.trigger) oldEventBus.trigger(event, data);
            },
            on: (event: string, handler: any) => {
                if (oldEventBus.on) oldEventBus.on(event, handler);
                else if (oldEventBus.subscribe) oldEventBus.subscribe(event, handler);
                else if (oldEventBus.addEventListener) oldEventBus.addEventListener(event, handler);
            },
            off: (event: string, handler: any) => {
                if (oldEventBus.off) oldEventBus.off(event, handler);
                else if (oldEventBus.unsubscribe) oldEventBus.unsubscribe(event, handler);
                else if (oldEventBus.removeEventListener) oldEventBus.removeEventListener(event, handler);
            }
        };
    }
}
