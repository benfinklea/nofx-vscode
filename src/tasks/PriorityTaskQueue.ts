import { Task } from '../agents/types';
import { ILoggingService, IPriorityTaskQueue, ITaskDependencyManager, ITaskStateMachine } from '../services/interfaces';
import { priorityToNumeric } from './priority';

interface QueueItem {
    task: Task;
    priority: number;
    timestamp: number;
}

/**
 * PriorityTaskQueue manages tasks in separate priority heaps for optimal performance.
 *
 * Queue Behavior:
 * - Uses two heaps: readyHeap for 'ready' tasks, validatedHeap for 'validated' tasks
 * - Higher priority tasks are dequeued first
 * - For same priority, older tasks (FIFO) are dequeued first
 * - dequeueReady() operates in O(log n) by only searching readyHeap
 * - Provides efficient insertion, removal, and priority updates
 */
export class PriorityTaskQueue implements IPriorityTaskQueue {
    private readonly logger: ILoggingService;
    private readyHeap: QueueItem[] = [];
    private validatedHeap: QueueItem[] = [];
    private taskIndexReady: Map<string, number> = new Map(); // Maps task ID to readyHeap index
    private taskIndexValidated: Map<string, number> = new Map(); // Maps task ID to validatedHeap index
    private dependencyManager?: ITaskDependencyManager;
    private taskStateMachine?: ITaskStateMachine;
    private depthHistory: number[] = []; // Ring buffer of recent queue sizes

    constructor(
        loggingService: ILoggingService,
        dependencyManager?: ITaskDependencyManager,
        taskStateMachine?: ITaskStateMachine
    ) {
        this.logger = loggingService;
        this.dependencyManager = dependencyManager;
        this.taskStateMachine = taskStateMachine;
    }

    /**
     * Adds a task to the priority queue
     */
    enqueue(task: Task): void {
        if (!this.canQueueTask(task)) {
            this.logger.warn(`Task ${task.id} cannot be queued in state ${task.status}`);
            return;
        }

        const priority = this.calculatePriority(task);
        const timestamp = task.createdAt.getTime();
        const item: QueueItem = { task, priority, timestamp };

        // Route to appropriate heap based on task status
        if (task.status === 'ready') {
            this.readyHeap.push(item);
            const index = this.readyHeap.length - 1;
            this.taskIndexReady.set(task.id, index);
            this.bubbleUp(this.readyHeap, index);
            this.logger.debug(`Task ${task.id} enqueued to readyHeap with priority ${priority}`);
        } else if (task.status === 'validated') {
            this.validatedHeap.push(item);
            const index = this.validatedHeap.length - 1;
            this.taskIndexValidated.set(task.id, index);
            this.bubbleUp(this.validatedHeap, index);
            this.logger.debug(`Task ${task.id} enqueued to validatedHeap with priority ${priority}`);
        }

        // Track depth history
        this.updateDepthHistory();
    }

    /**
     * Removes and returns the highest priority task
     */
    dequeue(): Task | null {
        // Prefer readyHeap first, then validatedHeap
        if (this.readyHeap.length > 0) {
            return this.dequeueFromHeap(this.readyHeap, this.taskIndexReady, 'readyHeap');
        } else if (this.validatedHeap.length > 0) {
            return this.dequeueFromHeap(this.validatedHeap, this.taskIndexValidated, 'validatedHeap');
        }
        return null;
    }

    /**
     * Removes and returns the highest priority READY task
     */
    dequeueReady(): Task | null {
        // O(log n) operation - only search readyHeap
        if (this.readyHeap.length === 0) {
            return null;
        }

        return this.dequeueFromHeap(this.readyHeap, this.taskIndexReady, 'readyHeap');
    }

    /**
     * Returns the highest priority task without removing it
     */
    peek(): Task | null {
        // Prefer readyHeap first, then validatedHeap
        if (this.readyHeap.length > 0) {
            return this.readyHeap[0].task;
        } else if (this.validatedHeap.length > 0) {
            return this.validatedHeap[0].task;
        }
        return null;
    }

    /**
     * Removes a specific task by ID
     */
    remove(taskId: string): boolean {
        // Check readyHeap first
        const readyIndex = this.taskIndexReady.get(taskId);
        if (readyIndex !== undefined) {
            this.removeFromHeap(this.readyHeap, this.taskIndexReady, readyIndex);
            this.logger.debug(`Task ${taskId} removed from readyHeap`);
            return true;
        }

        // Check validatedHeap
        const validatedIndex = this.taskIndexValidated.get(taskId);
        if (validatedIndex !== undefined) {
            this.removeFromHeap(this.validatedHeap, this.taskIndexValidated, validatedIndex);
            this.logger.debug(`Task ${taskId} removed from validatedHeap`);
            return true;
        }

        return false;
    }

    /**
     * Reorders the queue (useful when task priorities change)
     */
    reorder(): void {
        // Rebuild both heaps from scratch with recalculated priorities
        const readyItems = [...this.readyHeap];
        const validatedItems = [...this.validatedHeap];

        this.readyHeap = [];
        this.validatedHeap = [];
        this.taskIndexReady.clear();
        this.taskIndexValidated.clear();

        // Rebuild readyHeap
        for (const item of readyItems) {
            const newPriority = this.calculatePriority(item.task);
            const updatedItem: QueueItem = {
                task: item.task,
                priority: newPriority,
                timestamp: item.timestamp
            };

            this.readyHeap.push(updatedItem);
            const index = this.readyHeap.length - 1;
            this.taskIndexReady.set(updatedItem.task.id, index);
            this.bubbleUp(this.readyHeap, index);
        }

        // Rebuild validatedHeap
        for (const item of validatedItems) {
            const newPriority = this.calculatePriority(item.task);
            const updatedItem: QueueItem = {
                task: item.task,
                priority: newPriority,
                timestamp: item.timestamp
            };

            this.validatedHeap.push(updatedItem);
            const index = this.validatedHeap.length - 1;
            this.taskIndexValidated.set(updatedItem.task.id, index);
            this.bubbleUp(this.validatedHeap, index);
        }

        this.logger.debug('Both heaps reordered with recalculated priorities');
    }

    /**
     * Returns the number of tasks in the queue
     */
    size(): number {
        return this.readyHeap.length + this.validatedHeap.length;
    }

    /**
     * Returns true if the queue is empty
     */
    isEmpty(): boolean {
        return this.readyHeap.length === 0 && this.validatedHeap.length === 0;
    }

    /**
     * Checks if a task is in the queue
     */
    contains(taskId: string): boolean {
        return this.taskIndexReady.has(taskId) || this.taskIndexValidated.has(taskId);
    }

    /**
     * Returns all tasks as an array (for inspection)
     */
    toArray(): Task[] {
        const allItems = [...this.readyHeap, ...this.validatedHeap];
        // Sort by priority order: high > medium > low, then by timestamp (FIFO)
        allItems.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // Higher priority first (descending)
            }
            return a.timestamp - b.timestamp; // FIFO for same priority (older first)
        });
        return allItems.map(item => item.task);
    }

    /**
     * Enqueues multiple tasks efficiently
     */
    enqueueMany(tasks: Task[]): void {
        for (const task of tasks) {
            this.enqueue(task);
        }
    }

    /**
     * Updates a task's priority and reorders the queue
     */
    updatePriority(taskId: string, newPriority: number): boolean {
        // Check readyHeap first
        const readyIndex = this.taskIndexReady.get(taskId);
        if (readyIndex !== undefined) {
            const item = this.readyHeap[readyIndex];
            const oldPriority = item.priority;
            item.priority = newPriority;

            // Also update the task's numericPriority field
            item.task.numericPriority = newPriority;

            // Restore heap property
            if (newPriority > oldPriority) {
                this.bubbleUp(this.readyHeap, readyIndex);
            } else {
                this.bubbleDown(this.readyHeap, readyIndex);
            }

            this.logger.debug(`Task ${taskId} priority updated from ${oldPriority} to ${newPriority} in readyHeap`);
            return true;
        }

        // Check validatedHeap
        const validatedIndex = this.taskIndexValidated.get(taskId);
        if (validatedIndex !== undefined) {
            const item = this.validatedHeap[validatedIndex];
            const oldPriority = item.priority;
            item.priority = newPriority;

            // Also update the task's numericPriority field
            item.task.numericPriority = newPriority;

            // Restore heap property
            if (newPriority > oldPriority) {
                this.bubbleUp(this.validatedHeap, validatedIndex);
            } else {
                this.bubbleDown(this.validatedHeap, validatedIndex);
            }

            this.logger.debug(`Task ${taskId} priority updated from ${oldPriority} to ${newPriority} in validatedHeap`);
            return true;
        }

        return false;
    }

    /**
     * Gets queue statistics
     */
    getStats(): {
        size: number;
        averagePriority: number;
        oldestTask?: Task;
        newestTask?: Task;
        averageWaitMs: number;
        depthHistory: number[];
    } {
        const totalSize = this.readyHeap.length + this.validatedHeap.length;
        if (totalSize === 0) {
            return { size: 0, averagePriority: 0, averageWaitMs: 0, depthHistory: [] };
        }

        const allItems = [...this.readyHeap, ...this.validatedHeap];
        const totalPriority = allItems.reduce((sum, item) => sum + item.priority, 0);
        const averagePriority = totalPriority / totalSize;

        const sortedByTime = allItems.sort((a, b) => a.timestamp - b.timestamp);
        const oldestTask = sortedByTime[0].task;
        const newestTask = sortedByTime[sortedByTime.length - 1].task;

        // Calculate average wait time
        const currentTime = Date.now();
        const totalWaitTime = allItems.reduce((sum, item) => sum + (currentTime - item.timestamp), 0);
        const averageWaitMs = totalWaitTime / totalSize;

        // Simple depth history (last 10 queue sizes)
        const depthHistory = this.getDepthHistory();

        return {
            size: totalSize,
            averagePriority,
            oldestTask,
            newestTask,
            averageWaitMs,
            depthHistory
        };
    }

    /**
     * Recomputes priority for a specific task and updates its position in the queue
     */
    recomputePriority(task: Task): void {
        if (!this.contains(task.id)) {
            this.logger.debug(`Task ${task.id} not in queue, skipping priority recomputation`);
            return;
        }

        const newPriority = this.calculatePriority(task);
        const success = this.updatePriority(task.id, newPriority);

        if (success) {
            this.logger.debug(`Recomputed priority for task ${task.id}: ${newPriority}`);
        } else {
            this.logger.warn(`Failed to recompute priority for task ${task.id}`);
        }
    }

    /**
     * Calculates priority for a task, including soft dependency adjustments
     */
    private calculatePriority(task: Task): number {
        // Start with base priority
        let basePriority: number;
        if (task.numericPriority !== undefined) {
            basePriority = task.numericPriority;
        } else {
            basePriority = priorityToNumeric(task.priority);
        }

        // Note: Soft dependency adjustments are calculated in TaskQueue where we have access to all tasks
        // This method is called during recomputePriority which is triggered from TaskQueue with proper context
        return basePriority;
    }

    /**
     * Computes effective priority combining base priority and soft dependency adjustments
     */
    computeEffectivePriority(task: Task, allTasks: Task[]): number {
        // Start with base priority
        let basePriority: number;
        if (task.numericPriority !== undefined) {
            basePriority = task.numericPriority;
        } else {
            basePriority = priorityToNumeric(task.priority);
        }

        // Add soft dependency adjustment
        const softDepAdjustment = this.calculateSoftDependencyAdjustmentWithTasks(task, allTasks);
        return basePriority + softDepAdjustment;
    }

    /**
     * Calculates soft dependency adjustment with access to all tasks
     * Returns +5 if all preferred tasks are completed, -5 if some are still pending
     */
    calculateSoftDependencyAdjustmentWithTasks(task: Task, allTasks: Task[]): number {
        if (!task.prefers || task.prefers.length === 0) {
            return 0;
        }

        const taskMap = new Map(allTasks.map(t => [t.id, t]));
        let completedCount = 0;
        const totalCount = task.prefers.length;

        for (const prefId of task.prefers) {
            const prefTask = taskMap.get(prefId);
            if (prefTask && prefTask.status === 'completed') {
                completedCount++;
            }
        }

        // All preferred tasks completed: +5 bonus
        if (completedCount === totalCount) {
            return 5;
        }
        // Some preferred tasks still pending: -5 penalty
        else if (completedCount < totalCount) {
            return -5;
        }

        return 0;
    }

    /**
     * Moves a task to the ready heap (from validated heap or adds to ready heap)
     * Assumes task is already in 'ready' state. Does not change state.
     */
    moveToReady(task: Task): void {
        // Guard: only enqueue if task is already in ready state
        if (task.status !== 'ready') {
            this.logger.warn(`Task ${task.id} is not in 'ready' state (current: ${task.status}), skipping enqueue`);
            return;
        }

        // Remove from any heap first
        this.remove(task.id);

        // Enqueue to ready heap
        this.enqueue(task);

        this.logger.debug(`Task ${task.id} moved to ready heap`);
    }

    /**
     * Checks if a task can be queued based on its state
     */
    private canQueueTask(task: Task): boolean {
        return task.status === 'ready' || task.status === 'validated';
    }

    /**
     * Bubbles up an element to maintain heap property
     */
    private bubbleUp(heap: QueueItem[], index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);

            if (this.compare(heap[index], heap[parentIndex]) <= 0) {
                break;
            }

            this.swap(heap, index, parentIndex);
            index = parentIndex;
        }
    }

    /**
     * Bubbles down an element to maintain heap property
     */
    private bubbleDown(heap: QueueItem[], index: number): void {
        while (true) {
            let maxIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;

            if (leftChild < heap.length && this.compare(heap[leftChild], heap[maxIndex]) > 0) {
                maxIndex = leftChild;
            }

            if (rightChild < heap.length && this.compare(heap[rightChild], heap[maxIndex]) > 0) {
                maxIndex = rightChild;
            }

            if (maxIndex === index) {
                break;
            }

            this.swap(heap, index, maxIndex);
            index = maxIndex;
        }
    }

    /**
     * Compares two queue items (higher priority first, then FIFO)
     */
    private compare(a: QueueItem, b: QueueItem): number {
        if (a.priority !== b.priority) {
            return a.priority - b.priority; // Higher priority first
        }
        return b.timestamp - a.timestamp; // FIFO for same priority (older tasks first)
    }

    /**
     * Swaps two elements in the heap and updates the index
     */
    private swap(heap: QueueItem[], i: number, j: number): void {
        [heap[i], heap[j]] = [heap[j], heap[i]];

        // Update the appropriate index map based on which heap we're working with
        if (heap === this.readyHeap) {
            this.taskIndexReady.set(heap[i].task.id, i);
            this.taskIndexReady.set(heap[j].task.id, j);
        } else if (heap === this.validatedHeap) {
            this.taskIndexValidated.set(heap[i].task.id, i);
            this.taskIndexValidated.set(heap[j].task.id, j);
        }
    }

    /**
     * Helper method to dequeue from a specific heap
     */
    private dequeueFromHeap(heap: QueueItem[], taskIndex: Map<string, number>, heapName: string): Task | null {
        if (heap.length === 0) {
            return null;
        }

        const item = heap[0];
        taskIndex.delete(item.task.id);

        if (heap.length === 1) {
            heap.pop();
            this.updateDepthHistory();
            return item.task;
        }

        // Move last element to root
        heap[0] = heap[heap.length - 1];
        heap.pop();
        taskIndex.set(heap[0].task.id, 0);

        // Bubble down to maintain heap property
        this.bubbleDown(heap, 0);

        this.logger.debug(`Task ${item.task.id} dequeued from ${heapName} with priority ${item.priority}`);
        this.updateDepthHistory();
        return item.task;
    }

    /**
     * Helper method to remove from a specific heap
     */
    private removeFromHeap(heap: QueueItem[], taskIndex: Map<string, number>, index: number): void {
        taskIndex.delete(heap[index].task.id);

        if (index === heap.length - 1) {
            heap.pop();
            this.updateDepthHistory();
            return;
        }

        // Move last element to the removed position
        heap[index] = heap[heap.length - 1];
        heap.pop();
        taskIndex.set(heap[index].task.id, index);

        // Restore heap property
        this.bubbleUp(heap, index);
        this.bubbleDown(heap, index);
        this.updateDepthHistory();
    }

    /**
     * Updates the depth history ring buffer
     */
    private updateDepthHistory(): void {
        const currentSize = this.size();
        this.depthHistory.push(currentSize);

        // Keep only last 10 entries (ring buffer)
        if (this.depthHistory.length > 10) {
            this.depthHistory.shift();
        }
    }

    /**
     * Gets the depth history for trend analysis
     */
    private getDepthHistory(): number[] {
        return [...this.depthHistory];
    }

    dispose(): void {
        this.readyHeap = [];
        this.validatedHeap = [];
        this.taskIndexReady.clear();
        this.taskIndexValidated.clear();
        this.depthHistory = [];
        this.logger.debug('PriorityTaskQueue disposed');
    }
}
