import { ILogger, IEventEmitter, IEventSubscriber, IAgentLifecycle, IAgentQuery, IConfiguration } from '../interfaces';

export interface ITaskManager {
    addTask(task: any): void;
    getTasks(): any[];
    getTaskById(id: string): any;
    updateTask(id: string, updates: any): void;
}

export interface ITask {
    id: string;
    title: string;
    status: string;
    assignedTo?: string;
}
