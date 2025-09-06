"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPickItem = createPickItem;
exports.getPickValue = getPickValue;
exports.toAgentDTO = toAgentDTO;
exports.toTaskDTO = toTaskDTO;
exports.normalizeTaskStatus = normalizeTaskStatus;
exports.normalizeAgentStatus = normalizeAgentStatus;
exports.computeDependencyStatus = computeDependencyStatus;
exports.formatBlockingReason = formatBlockingReason;
exports.formatPriority = formatPriority;
exports.getPriorityColor = getPriorityColor;
exports.getStatusIcon = getStatusIcon;
exports.computeSoftDependencyStatus = computeSoftDependencyStatus;
exports.formatSoftDependencyHint = formatSoftDependencyHint;
const priority_1 = require("../tasks/priority");
function createPickItem(label, value, options) {
    return {
        label,
        value,
        ...options
    };
}
function getPickValue(item) {
    return item?.value;
}
function toAgentDTO(agent) {
    return {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        currentTask: agent.currentTask ? toTaskDTO(agent.currentTask) : null,
        template: agent.template,
        startTime: agent.startTime,
        tasksCompleted: agent.tasksCompleted
    };
}
function toTaskDTO(task, dependencyStatus, agentMatchScore, allTasks) {
    let computedDependencyStatus;
    if (dependencyStatus) {
        computedDependencyStatus = dependencyStatus;
    }
    else {
        if (task.status === 'blocked') {
            computedDependencyStatus = 'blocked';
        }
        else if ((task.dependsOn?.length ?? 0) === 0) {
            computedDependencyStatus = 'ready';
        }
        else {
            computedDependencyStatus = 'waiting';
        }
    }
    const score = agentMatchScore ?? task.agentMatchScore;
    const softDepStatus = computeSoftDependencyStatus(task, allTasks || []);
    const softDepHint = formatSoftDependencyHint(task, allTasks || []);
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        numericPriority: task.numericPriority ?? (0, priority_1.priorityToNumeric)(task.priority),
        status: task.status,
        assignedTo: task.assignedTo,
        files: task.files,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        dependsOn: task.dependsOn || [],
        prefers: task.prefers || [],
        blockedBy: task.blockedBy || [],
        tags: task.tags || [],
        requiredCapabilities: task.requiredCapabilities || [],
        conflictsWith: task.conflictsWith || [],
        estimatedDuration: task.estimatedDuration,
        dependencyStatus: computedDependencyStatus,
        agentMatchScore: score,
        blockingReason: formatBlockingReason(task),
        softDependencyStatus: softDepStatus,
        softDependencyHint: softDepHint
    };
}
function normalizeTaskStatus(status) {
    switch (status.toLowerCase()) {
        case 'queued':
        case 'pending':
            return 'queued';
        case 'assigned':
        case 'allocated':
            return 'assigned';
        case 'in-progress':
        case 'inprogress':
        case 'working':
        case 'active':
            return 'in-progress';
        case 'completed':
        case 'done':
        case 'finished':
            return 'completed';
        case 'failed':
        case 'error':
        case 'cancelled':
        case 'canceled':
            return 'failed';
        default:
            return 'queued';
    }
}
function normalizeAgentStatus(status) {
    switch (status.toLowerCase()) {
        case 'idle':
        case 'available':
        case 'ready':
            return 'idle';
        case 'working':
        case 'busy':
        case 'active':
        case 'in-progress':
            return 'working';
        case 'error':
        case 'failed':
        case 'crashed':
            return 'error';
        case 'offline':
        case 'disconnected':
        case 'stopped':
            return 'offline';
        default:
            return 'idle';
    }
}
function computeDependencyStatus(task, allTasks) {
    if (task.status === 'blocked') {
        return 'blocked';
    }
    const dependencies = task.dependsOn || [];
    if (dependencies.length === 0) {
        return 'ready';
    }
    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    for (const depId of dependencies) {
        const depTask = taskMap.get(depId);
        if (!depTask || depTask.status !== 'completed') {
            return 'waiting';
        }
    }
    return 'ready';
}
function formatBlockingReason(task) {
    if (task.status !== 'blocked') {
        return undefined;
    }
    const reasons = [];
    if (task.conflictsWith && task.conflictsWith.length > 0) {
        reasons.push(`Conflicts with: ${task.conflictsWith.join(', ')}`);
    }
    if (task.blockedBy && task.blockedBy.length > 0) {
        reasons.push(`Blocked by: ${task.blockedBy.join(', ')}`);
    }
    if (task.dependsOn && task.dependsOn.length > 0) {
        reasons.push(`Waiting for dependencies: ${task.dependsOn.join(', ')}`);
    }
    if (task.prefers && task.prefers.length > 0) {
        reasons.push(`Prefers: ${task.prefers.join(', ')}`);
    }
    return reasons.length > 0 ? reasons.join('; ') : 'Unknown reason';
}
function formatPriority(numericPriority) {
    if (numericPriority >= 100)
        return '🔥 High';
    if (numericPriority >= 50)
        return '⚡ Medium';
    return '📝 Low';
}
function getPriorityColor(priority) {
    switch (priority) {
        case 'high': return '#ff4444';
        case 'medium': return '#ffaa00';
        case 'low': return '#44aa44';
        default: return '#888888';
    }
}
function getStatusIcon(status) {
    switch (status) {
        case 'queued': return '⏳';
        case 'validated': return '✓';
        case 'ready': return '🟢';
        case 'assigned': return '👤';
        case 'in-progress': return '🔄';
        case 'completed': return '✅';
        case 'failed': return '❌';
        case 'blocked': return '🔴';
        default: return '❓';
    }
}
function computeSoftDependencyStatus(task, allTasks) {
    if (!task.prefers || task.prefers.length === 0) {
        return 'none';
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
        return 'satisfied';
    }
    else if (completedCount < totalCount) {
        return 'pending';
    }
    return 'none';
}
function formatSoftDependencyHint(task, allTasks) {
    if (!task.prefers || task.prefers.length === 0) {
        return undefined;
    }
    const status = computeSoftDependencyStatus(task, allTasks);
    switch (status) {
        case 'satisfied':
            return '✨ Soft deps satisfied';
        case 'pending':
            const taskMap = new Map(allTasks.map(t => [t.id, t]));
            const pendingTasks = task.prefers.filter(prefId => {
                const prefTask = taskMap.get(prefId);
                return !prefTask || prefTask.status !== 'completed';
            });
            return `⏳ Waiting for: ${pendingTasks.join(', ')}`;
        case 'none':
        default:
            return undefined;
    }
}
//# sourceMappingURL=ui.js.map