import * as vscode from 'vscode';
import { Task, TaskConfig, TaskStatus } from '../agents/types';
import { AgentManager } from '../agents/AgentManager';

export class TaskQueue {
    private tasks: Map<string, Task> = new Map();
    private queue: string[] = [];
    private agentManager: AgentManager;
    private _onTaskUpdate = new vscode.EventEmitter<void>();
    public readonly onTaskUpdate = this._onTaskUpdate.event;

    constructor(agentManager: AgentManager) {
        this.agentManager = agentManager;
        
        // Auto-assign tasks when agents become available
        this.agentManager.onAgentUpdate(() => {
            this.tryAssignTasks();
        });
    }

    addTask(config: TaskConfig): Task {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`[NofX TaskQueue] Creating task ${taskId}`);
        console.log(`[NofX TaskQueue] Config:`, JSON.stringify(config));
        
        const task: Task = {
            id: taskId,
            title: config.title,
            description: config.description,
            priority: config.priority || 'medium',
            status: 'queued',
            files: config.files || [],
            createdAt: new Date()
        };

        this.tasks.set(taskId, task);
        console.log(`[NofX TaskQueue] Task added to map. Total tasks: ${this.tasks.size}`);
        
        // Add to queue based on priority
        if (task.priority === 'high') {
            this.queue.unshift(taskId);
            console.log(`[NofX TaskQueue] High priority task added to front of queue`);
        } else {
            this.queue.push(taskId);
            console.log(`[NofX TaskQueue] Task added to end of queue`);
        }
        console.log(`[NofX TaskQueue] Queue length: ${this.queue.length}`);

        this._onTaskUpdate.fire();

        // Try to assign immediately
        console.log(`[NofX TaskQueue] Attempting immediate assignment...`);
        this.tryAssignTasks();

        return task;
    }

    assignNextTask(): boolean {
        if (this.queue.length === 0) {
            console.log('[NofX] No tasks in queue');
            return false;
        }

        const idleAgents = this.agentManager.getIdleAgents();
        console.log(`[NofX] Idle agents available: ${idleAgents.length}`);
        
        if (idleAgents.length === 0) {
            return false;
        }

        const taskId = this.queue.shift();
        if (!taskId) return false;

        const task = this.tasks.get(taskId);
        if (!task) {
            console.log('[NofX] Task not found in map');
            return false;
        }

        console.log(`[NofX] Assigning task: ${task.title}`);

        // Find best agent for task (simple strategy for now)
        const agent = this.selectBestAgent(task, idleAgents);
        
        if (agent) {
            task.status = 'assigned';
            task.assignedTo = agent.id;
            this._onTaskUpdate.fire();

            console.log(`[NofX] Executing task on agent: ${agent.name}`);
            
            // Execute task on agent
            try {
                console.log(`[NofX] About to execute task on agent ${agent.id}`);
                this.agentManager.executeTask(agent.id, task);
                
                // Show detailed notification
                vscode.window.showInformationMessage(
                    `📋 Task "${task.title}" assigned to ${agent.template?.icon || '🤖'} ${agent.name}`,
                    'View Terminal'
                ).then(selection => {
                    if (selection === 'View Terminal') {
                        const terminal = this.agentManager.getAgentTerminal(agent.id);
                        if (terminal) {
                            terminal.show();
                        }
                    }
                });
                
                console.log(`[NofX] Task successfully assigned and executing`);
                return true;
            } catch (error: any) {
                console.error('[NofX] Error executing task:', error);
                vscode.window.showErrorMessage(
                    `Failed to assign task: ${error.message}`
                );
                // Put task back in queue
                this.queue.unshift(taskId);
                task.status = 'queued';
                return false;
            }
        }

        // Put task back in queue if no suitable agent
        this.queue.unshift(taskId);
        return false;
    }

    private selectBestAgent(task: Task, agents: any[]): any {
        // Simple agent selection based on task keywords and agent type
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        
        // Check for specialized agents first
        for (const agent of agents) {
            const agentType = agent.type.toLowerCase();
            
            if (agentType.includes('frontend') && 
                (taskText.includes('ui') || taskText.includes('frontend') || 
                 taskText.includes('react') || taskText.includes('component'))) {
                return agent;
            }
            
            if (agentType.includes('backend') && 
                (taskText.includes('api') || taskText.includes('backend') || 
                 taskText.includes('database') || taskText.includes('server'))) {
                return agent;
            }
            
            if (agentType.includes('test') && 
                (taskText.includes('test') || taskText.includes('spec') || 
                 taskText.includes('coverage'))) {
                return agent;
            }
            
            if (agentType.includes('doc') && 
                (taskText.includes('document') || taskText.includes('readme') || 
                 taskText.includes('comment'))) {
                return agent;
            }
        }
        
        // Return first available agent if no specialization match
        return agents[0];
    }

    private tryAssignTasks() {
        const config = vscode.workspace.getConfiguration('nofx');
        const autoAssign = config.get('autoAssignTasks', true);
        
        const idleAgents = this.agentManager.getIdleAgents();
        console.log(`[NofX TaskQueue.tryAssignTasks] Auto-assign: ${autoAssign}, Queue: ${this.queue.length}, Idle agents: ${idleAgents.length}`);
        
        if (idleAgents.length > 0) {
            console.log(`[NofX TaskQueue.tryAssignTasks] Idle agent IDs:`, idleAgents.map(a => `${a.name}(${a.id})`));
        }
        
        if (!autoAssign) {
            console.log(`[NofX TaskQueue.tryAssignTasks] Auto-assign disabled`);
            vscode.window.showInformationMessage('📋 Task added. Auto-assign is disabled - assign manually.');
            return;
        }

        let assigned = false;
        let attempts = 0;
        while (this.queue.length > 0 && idleAgents.length > 0 && attempts < 10) {
            console.log(`[NofX TaskQueue.tryAssignTasks] Assignment attempt ${attempts + 1}`);
            const result = this.assignNextTask();
            console.log(`[NofX TaskQueue.tryAssignTasks] Assignment result: ${result}`);
            if (result) {
                assigned = true;
            } else {
                break; // Stop if assignment failed
            }
            attempts++;
        }
        
        if (!assigned && this.queue.length > 0) {
            const idleCount = this.agentManager.getIdleAgents().length;
            console.log(`[NofX TaskQueue.tryAssignTasks] No assignment made. Queue: ${this.queue.length}, Idle: ${idleCount}`);
            if (idleCount === 0) {
                vscode.window.showInformationMessage('📋 Task queued. All agents are busy.');
            } else {
                vscode.window.showWarningMessage('📋 Task added but not assigned. Check agent status.');
            }
        }
    }

    completeTask(taskId: string) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.status = 'completed';
        task.completedAt = new Date();
        this._onTaskUpdate.fire();

        vscode.window.showInformationMessage(
            `✅ Task completed: ${task.title}`
        );
    }

    failTask(taskId: string, reason?: string) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.status = 'failed';
        this._onTaskUpdate.fire();

        vscode.window.showErrorMessage(
            `❌ Task failed: ${task.title}${reason ? ` - ${reason}` : ''}`
        );
    }

    getTasks(): Task[] {
        return Array.from(this.tasks.values());
    }
    
    getPendingTasks(): Task[] {
        return Array.from(this.tasks.values()).filter(t => t.status === 'queued');
    }
    
    getActiveTasks(): Task[] {
        return Array.from(this.tasks.values()).filter(t => t.status === 'in-progress');
    }

    getQueuedTasks(): Task[] {
        return this.queue.map(id => this.tasks.get(id)).filter(Boolean) as Task[];
    }

    getTasksForAgent(agentId: string): Task[] {
        return Array.from(this.tasks.values()).filter(
            task => task.assignedTo === agentId
        );
    }

    clearCompleted() {
        const completed = Array.from(this.tasks.values()).filter(
            task => task.status === 'completed'
        );

        completed.forEach(task => {
            this.tasks.delete(task.id);
        });

        this._onTaskUpdate.fire();
    }

    dispose() {
        this._onTaskUpdate.dispose();
    }
}