"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityTaskQueue = void 0;
const priority_1 = require("./priority");
class PriorityTaskQueue {
    constructor(loggingService, dependencyManager, taskStateMachine) {
        this.readyHeap = [];
        this.validatedHeap = [];
        this.taskIndexReady = new Map();
        this.taskIndexValidated = new Map();
        this.depthHistory = [];
        this.logger = loggingService;
        this.dependencyManager = dependencyManager;
        this.taskStateMachine = taskStateMachine;
    }
    enqueue(task) {
        if (!this.canQueueTask(task)) {
            this.logger.warn(`Task ${task.id} cannot be queued in state ${task.status}`);
            return;
        }
        const priority = this.calculatePriority(task);
        const timestamp = task.createdAt.getTime();
        const item = { task, priority, timestamp };
        if (task.status === 'ready') {
            this.readyHeap.push(item);
            const index = this.readyHeap.length - 1;
            this.taskIndexReady.set(task.id, index);
            this.bubbleUp(this.readyHeap, index);
            this.logger.debug(`Task ${task.id} enqueued to readyHeap with priority ${priority}`);
        }
        else if (task.status === 'validated') {
            this.validatedHeap.push(item);
            const index = this.validatedHeap.length - 1;
            this.taskIndexValidated.set(task.id, index);
            this.bubbleUp(this.validatedHeap, index);
            this.logger.debug(`Task ${task.id} enqueued to validatedHeap with priority ${priority}`);
        }
        this.updateDepthHistory();
    }
    dequeue() {
        if (this.readyHeap.length > 0) {
            return this.dequeueFromHeap(this.readyHeap, this.taskIndexReady, 'readyHeap');
        }
        else if (this.validatedHeap.length > 0) {
            return this.dequeueFromHeap(this.validatedHeap, this.taskIndexValidated, 'validatedHeap');
        }
        return null;
    }
    dequeueReady() {
        if (this.readyHeap.length === 0) {
            return null;
        }
        return this.dequeueFromHeap(this.readyHeap, this.taskIndexReady, 'readyHeap');
    }
    peek() {
        if (this.readyHeap.length > 0) {
            return this.readyHeap[0].task;
        }
        else if (this.validatedHeap.length > 0) {
            return this.validatedHeap[0].task;
        }
        return null;
    }
    remove(taskId) {
        const readyIndex = this.taskIndexReady.get(taskId);
        if (readyIndex !== undefined) {
            this.removeFromHeap(this.readyHeap, this.taskIndexReady, readyIndex);
            this.logger.debug(`Task ${taskId} removed from readyHeap`);
            return true;
        }
        const validatedIndex = this.taskIndexValidated.get(taskId);
        if (validatedIndex !== undefined) {
            this.removeFromHeap(this.validatedHeap, this.taskIndexValidated, validatedIndex);
            this.logger.debug(`Task ${taskId} removed from validatedHeap`);
            return true;
        }
        return false;
    }
    reorder() {
        const readyItems = [...this.readyHeap];
        const validatedItems = [...this.validatedHeap];
        this.readyHeap = [];
        this.validatedHeap = [];
        this.taskIndexReady.clear();
        this.taskIndexValidated.clear();
        for (const item of readyItems) {
            const newPriority = this.calculatePriority(item.task);
            const updatedItem = {
                task: item.task,
                priority: newPriority,
                timestamp: item.timestamp
            };
            this.readyHeap.push(updatedItem);
            const index = this.readyHeap.length - 1;
            this.taskIndexReady.set(updatedItem.task.id, index);
            this.bubbleUp(this.readyHeap, index);
        }
        for (const item of validatedItems) {
            const newPriority = this.calculatePriority(item.task);
            const updatedItem = {
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
    size() {
        return this.readyHeap.length + this.validatedHeap.length;
    }
    isEmpty() {
        return this.readyHeap.length === 0 && this.validatedHeap.length === 0;
    }
    contains(taskId) {
        return this.taskIndexReady.has(taskId) || this.taskIndexValidated.has(taskId);
    }
    toArray() {
        return [...this.readyHeap.map(item => item.task), ...this.validatedHeap.map(item => item.task)];
    }
    enqueueMany(tasks) {
        for (const task of tasks) {
            this.enqueue(task);
        }
    }
    updatePriority(taskId, newPriority) {
        const readyIndex = this.taskIndexReady.get(taskId);
        if (readyIndex !== undefined) {
            const item = this.readyHeap[readyIndex];
            const oldPriority = item.priority;
            item.priority = newPriority;
            if (newPriority > oldPriority) {
                this.bubbleUp(this.readyHeap, readyIndex);
            }
            else {
                this.bubbleDown(this.readyHeap, readyIndex);
            }
            this.logger.debug(`Task ${taskId} priority updated from ${oldPriority} to ${newPriority} in readyHeap`);
            return true;
        }
        const validatedIndex = this.taskIndexValidated.get(taskId);
        if (validatedIndex !== undefined) {
            const item = this.validatedHeap[validatedIndex];
            const oldPriority = item.priority;
            item.priority = newPriority;
            if (newPriority > oldPriority) {
                this.bubbleUp(this.validatedHeap, validatedIndex);
            }
            else {
                this.bubbleDown(this.validatedHeap, validatedIndex);
            }
            this.logger.debug(`Task ${taskId} priority updated from ${oldPriority} to ${newPriority} in validatedHeap`);
            return true;
        }
        return false;
    }
    getStats() {
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
        const currentTime = Date.now();
        const totalWaitTime = allItems.reduce((sum, item) => sum + (currentTime - item.timestamp), 0);
        const averageWaitMs = totalWaitTime / totalSize;
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
    recomputePriority(task) {
        if (!this.contains(task.id)) {
            this.logger.debug(`Task ${task.id} not in queue, skipping priority recomputation`);
            return;
        }
        const newPriority = this.calculatePriority(task);
        const success = this.updatePriority(task.id, newPriority);
        if (success) {
            this.logger.debug(`Recomputed priority for task ${task.id}: ${newPriority}`);
        }
        else {
            this.logger.warn(`Failed to recompute priority for task ${task.id}`);
        }
    }
    calculatePriority(task) {
        let basePriority;
        if (task.numericPriority !== undefined) {
            basePriority = task.numericPriority;
        }
        else {
            basePriority = (0, priority_1.priorityToNumeric)(task.priority);
        }
        return basePriority;
    }
    computeEffectivePriority(task, allTasks) {
        let basePriority;
        if (task.numericPriority !== undefined) {
            basePriority = task.numericPriority;
        }
        else {
            basePriority = (0, priority_1.priorityToNumeric)(task.priority);
        }
        const softDepAdjustment = this.calculateSoftDependencyAdjustmentWithTasks(task, allTasks);
        return basePriority + softDepAdjustment;
    }
    calculateSoftDependencyAdjustmentWithTasks(task, allTasks) {
        if (!task.prefers || task.prefers.length === 0) {
            return 0;
        }
        const taskMap = new Map(allTasks.map(t => [t.id, t]));
        let completedCount = 0;
        let totalCount = task.prefers.length;
        for (const prefId of task.prefers) {
            const prefTask = taskMap.get(prefId);
            if (prefTask && prefTask.status === 'completed') {
                completedCount++;
            }
        }
        if (completedCount === totalCount) {
            return 5;
        }
        else if (completedCount < totalCount) {
            return -5;
        }
        return 0;
    }
    moveToReady(task) {
        if (task.status !== 'ready') {
            this.logger.warn(`Task ${task.id} is not in 'ready' state (current: ${task.status}), skipping enqueue`);
            return;
        }
        this.remove(task.id);
        this.enqueue(task);
        this.logger.debug(`Task ${task.id} moved to ready heap`);
    }
    canQueueTask(task) {
        return task.status === 'ready' || task.status === 'validated';
    }
    bubbleUp(heap, index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compare(heap[index], heap[parentIndex]) <= 0) {
                break;
            }
            this.swap(heap, index, parentIndex);
            index = parentIndex;
        }
    }
    bubbleDown(heap, index) {
        while (true) {
            let maxIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            if (leftChild < heap.length &&
                this.compare(heap[leftChild], heap[maxIndex]) > 0) {
                maxIndex = leftChild;
            }
            if (rightChild < heap.length &&
                this.compare(heap[rightChild], heap[maxIndex]) > 0) {
                maxIndex = rightChild;
            }
            if (maxIndex === index) {
                break;
            }
            this.swap(heap, index, maxIndex);
            index = maxIndex;
        }
    }
    compare(a, b) {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return b.timestamp - a.timestamp;
    }
    swap(heap, i, j) {
        [heap[i], heap[j]] = [heap[j], heap[i]];
        if (heap === this.readyHeap) {
            this.taskIndexReady.set(heap[i].task.id, i);
            this.taskIndexReady.set(heap[j].task.id, j);
        }
        else if (heap === this.validatedHeap) {
            this.taskIndexValidated.set(heap[i].task.id, i);
            this.taskIndexValidated.set(heap[j].task.id, j);
        }
    }
    dequeueFromHeap(heap, taskIndex, heapName) {
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
        heap[0] = heap[heap.length - 1];
        heap.pop();
        taskIndex.set(heap[0].task.id, 0);
        this.bubbleDown(heap, 0);
        this.logger.debug(`Task ${item.task.id} dequeued from ${heapName} with priority ${item.priority}`);
        this.updateDepthHistory();
        return item.task;
    }
    removeFromHeap(heap, taskIndex, index) {
        taskIndex.delete(heap[index].task.id);
        if (index === heap.length - 1) {
            heap.pop();
            this.updateDepthHistory();
            return;
        }
        heap[index] = heap[heap.length - 1];
        heap.pop();
        taskIndex.set(heap[index].task.id, index);
        this.bubbleUp(heap, index);
        this.bubbleDown(heap, index);
        this.updateDepthHistory();
    }
    updateDepthHistory() {
        const currentSize = this.size();
        this.depthHistory.push(currentSize);
        if (this.depthHistory.length > 10) {
            this.depthHistory.shift();
        }
    }
    getDepthHistory() {
        return [...this.depthHistory];
    }
    dispose() {
        this.readyHeap = [];
        this.validatedHeap = [];
        this.taskIndexReady.clear();
        this.taskIndexValidated.clear();
        this.depthHistory = [];
        this.logger.debug('PriorityTaskQueue disposed');
    }
}
exports.PriorityTaskQueue = PriorityTaskQueue;
//# sourceMappingURL=PriorityTaskQueue.js.map