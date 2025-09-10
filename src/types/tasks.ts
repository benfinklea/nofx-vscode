// Task-related types

export interface TaskRequest {
    id: string;
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    assignedTo?: string;
    status?: string;
}

export class TaskToolBridge {
    static createTask(request: TaskRequest): any {
        return {
            id: request.id || Math.random().toString(36).substr(2, 9),
            ...request
        };
    }
}
