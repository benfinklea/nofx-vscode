"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageType = void 0;
exports.createMessage = createMessage;
exports.generateMessageId = generateMessageId;
exports.shouldRequireAck = shouldRequireAck;
exports.isValidMessage = isValidMessage;
exports.formatMessageForClaude = formatMessageForClaude;
exports.extractJsonFromClaudeOutput = extractJsonFromClaudeOutput;
var MessageType;
(function (MessageType) {
    MessageType["SPAWN_AGENT"] = "spawn_agent";
    MessageType["ASSIGN_TASK"] = "assign_task";
    MessageType["QUERY_STATUS"] = "query_status";
    MessageType["TERMINATE_AGENT"] = "terminate_agent";
    MessageType["PAUSE_AGENT"] = "pause_agent";
    MessageType["RESUME_AGENT"] = "resume_agent";
    MessageType["AGENT_READY"] = "agent_ready";
    MessageType["TASK_ACCEPTED"] = "task_accepted";
    MessageType["TASK_PROGRESS"] = "task_progress";
    MessageType["TASK_COMPLETE"] = "task_complete";
    MessageType["TASK_ERROR"] = "task_error";
    MessageType["AGENT_STATUS"] = "agent_status";
    MessageType["AGENT_QUERY"] = "agent_query";
    MessageType["CONNECTION_ESTABLISHED"] = "connection_established";
    MessageType["CONNECTION_LOST"] = "connection_lost";
    MessageType["HEARTBEAT"] = "heartbeat";
    MessageType["SYSTEM_ERROR"] = "system_error";
    MessageType["SYSTEM_ACK"] = "system_ack";
    MessageType["BROADCAST"] = "broadcast";
})(MessageType || (exports.MessageType = MessageType = {}));
function createMessage(from, to, type, payload, correlationId) {
    return {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        from,
        to,
        type,
        payload,
        correlationId,
        requiresAck: shouldRequireAck(type)
    };
}
function generateMessageId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
function shouldRequireAck(type) {
    return [
        MessageType.SPAWN_AGENT,
        MessageType.ASSIGN_TASK,
        MessageType.TERMINATE_AGENT,
        MessageType.PAUSE_AGENT,
        MessageType.RESUME_AGENT
    ].includes(type);
}
function isValidMessage(message) {
    return (message &&
        typeof message === 'object' &&
        typeof message.id === 'string' &&
        typeof message.timestamp === 'string' &&
        typeof message.from === 'string' &&
        typeof message.to === 'string' &&
        Object.values(MessageType).includes(message.type) &&
        message.payload !== undefined);
}
function formatMessageForClaude(message) {
    switch (message.type) {
        case MessageType.ASSIGN_TASK:
            const task = message.payload;
            return `[TASK ASSIGNED] ${task.title}\nPriority: ${task.priority}\nDescription: ${task.description}`;
        case MessageType.QUERY_STATUS:
            return '[STATUS REQUEST] Please report your current status';
        case MessageType.AGENT_QUERY:
            const query = message.payload;
            return `[QUESTION FROM ${message.from}] ${query.question}`;
        default:
            return `[${message.type}] ${JSON.stringify(message.payload)}`;
    }
}
function extractJsonFromClaudeOutput(output) {
    const jsonMatches = output.match(/\{[^{}]*\}/g);
    if (!jsonMatches)
        return null;
    for (const match of jsonMatches) {
        try {
            const parsed = JSON.parse(match);
            if (parsed.type && (parsed.task || parsed.status || parsed.agentId || parsed.role)) {
                return convertClaudeCommandToMessage(parsed);
            }
        }
        catch {
        }
    }
    return null;
}
function convertClaudeCommandToMessage(command) {
    let type;
    let payload;
    switch (command.type) {
        case 'spawn':
        case 'spawn_agent':
            type = MessageType.SPAWN_AGENT;
            payload = {
                role: command.role,
                name: command.name || `${command.role}-agent`
            };
            break;
        case 'assign':
        case 'assign_task':
            type = MessageType.ASSIGN_TASK;
            payload = {
                agentId: command.agentId,
                taskId: generateMessageId(),
                title: command.task || command.title,
                description: command.description || command.task,
                priority: command.priority || 'medium'
            };
            break;
        case 'status':
        case 'query':
            type = MessageType.QUERY_STATUS;
            payload = { agentId: command.agentId || 'all' };
            break;
        case 'terminate':
        case 'stop':
            type = MessageType.TERMINATE_AGENT;
            payload = { agentId: command.agentId };
            break;
        default:
            type = MessageType.BROADCAST;
            payload = command;
    }
    return createMessage('conductor', command.agentId || 'broadcast', type, payload);
}
//# sourceMappingURL=MessageProtocol.js.map