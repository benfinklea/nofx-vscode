// Simplified task interfaces - entrepreneur friendly

export interface ITaskManager {
    createTask(task: TaskConfig): Task;
    assignTask(taskId: string, agentId: string): void;
    completeTask(taskId: string): void;
}

export interface TaskConfig {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
}

export interface Task {
    id: string;
    title: string;
    status: 'pending' | 'assigned' | 'complete';
    assignedTo?: string;
}
