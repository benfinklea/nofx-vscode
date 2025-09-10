// Simplified interfaces for NofX - entrepreneur friendly

export * from './ILogging';
export * from './IEvent';
export * from './IAgent';
export * from './ITask';
export * from './IConfiguration';

import { ILogger } from './ILogging';
import { IEventEmitter, IEventSubscriber } from './IEvent';
import { IAgentLifecycle, IAgentQuery } from './IAgent';
import { ITaskManager } from './ITask';
import { IConfiguration } from './IConfiguration';

// Convenience type for dependency injection
export interface IServices {
    logger: ILogger;
    events: IEventEmitter & IEventSubscriber;
    agents: IAgentLifecycle & IAgentQuery;
    tasks: ITaskManager;
    config: IConfiguration;
}
