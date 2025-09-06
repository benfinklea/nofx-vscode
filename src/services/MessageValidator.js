"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageValidator = void 0;
const EventConstants_1 = require("./EventConstants");
const MessageProtocol_1 = require("../orchestration/MessageProtocol");
const Destinations_1 = require("../orchestration/Destinations");
class MessageValidator {
    constructor(loggingService, eventBus) {
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.MAX_PAYLOAD_SIZE = 1024 * 1024;
        this.MAX_STRING_LENGTH = 10000;
        this.MAX_MESSAGE_ID_LENGTH = 100;
    }
    validate(rawMessage) {
        const errors = [];
        const warnings = [];
        if (rawMessage.length > this.MAX_PAYLOAD_SIZE) {
            errors.push(`Message size exceeds maximum allowed size of ${this.MAX_PAYLOAD_SIZE} bytes`);
            return { isValid: false, errors, warnings };
        }
        let message;
        try {
            message = JSON.parse(rawMessage);
        }
        catch (error) {
            errors.push('Invalid JSON format');
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_VALIDATION_FAILED, {
                messageId: 'unknown',
                errors,
                warnings: [],
                messageType: 'unknown'
            });
            return { isValid: false, errors, warnings };
        }
        if (!(0, MessageProtocol_1.isValidMessage)(message)) {
            errors.push('Message fails basic validation checks');
            return { isValid: false, errors, warnings };
        }
        const structureValidation = this.validateMessageStructure(message);
        errors.push(...structureValidation.errors);
        warnings.push(...structureValidation.warnings);
        if (message.payload) {
            const payloadValidation = this.validatePayload(message.type, message.payload);
            errors.push(...payloadValidation.errors);
            warnings.push(...payloadValidation.warnings);
        }
        if (message.to && !Destinations_1.DestinationUtil.isValidDestination(message.to)) {
            errors.push(`Invalid destination: ${message.to}`);
        }
        const isValid = errors.length === 0;
        if (!isValid) {
            this.eventBus.publish(EventConstants_1.ORCH_EVENTS.MESSAGE_VALIDATION_FAILED, {
                messageId: message.id,
                errors,
                warnings,
                messageType: message.type
            });
        }
        this.loggingService.debug('Message validation completed', {
            messageId: message.id,
            isValid,
            errorCount: errors.length,
            warningCount: warnings.length
        });
        return {
            isValid,
            errors,
            warnings,
            result: isValid ? message : undefined
        };
    }
    validatePayload(type, payload) {
        const errors = [];
        const warnings = [];
        switch (type) {
            case MessageProtocol_1.MessageType.SPAWN_AGENT:
                this.validateSpawnAgentPayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.ASSIGN_TASK:
                this.validateAssignTaskPayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.TASK_PROGRESS:
                this.validateTaskProgressPayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.TASK_COMPLETE:
                this.validateTaskCompletePayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.TASK_ERROR:
                this.validateTaskErrorPayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.AGENT_STATUS:
                this.validateAgentStatusPayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.AGENT_QUERY:
                this.validateAgentQueryPayload(payload, errors, warnings);
                break;
            case MessageProtocol_1.MessageType.SYSTEM_ACK:
                break;
            default:
                this.validateGenericPayload(payload, errors, warnings);
        }
        return { isValid: errors.length === 0, errors, warnings };
    }
    createErrorResponse(error, clientId) {
        return (0, MessageProtocol_1.createMessage)('system', clientId, MessageProtocol_1.MessageType.SYSTEM_ERROR, {
            error,
            timestamp: new Date().toISOString(),
            messageId: (0, MessageProtocol_1.generateMessageId)()
        });
    }
    dispose() {
        this.loggingService.debug('MessageValidator disposed');
    }
    validateMessageStructure(message) {
        const errors = [];
        const warnings = [];
        if (!message.id || typeof message.id !== 'string') {
            errors.push('Message ID is required and must be a string');
        }
        else if (message.id.length > this.MAX_MESSAGE_ID_LENGTH) {
            errors.push(`Message ID exceeds maximum length of ${this.MAX_MESSAGE_ID_LENGTH} characters`);
        }
        if (!message.timestamp || typeof message.timestamp !== 'string') {
            errors.push('Timestamp is required and must be a string');
        }
        else if (!this.isValidISOTimestamp(message.timestamp)) {
            errors.push('Timestamp must be a valid ISO 8601 string');
        }
        if (!message.from || typeof message.from !== 'string') {
            errors.push('From field is required and must be a string');
        }
        else if (message.from.length > this.MAX_STRING_LENGTH) {
            errors.push(`From field exceeds maximum length of ${this.MAX_STRING_LENGTH} characters`);
        }
        if (!message.to || typeof message.to !== 'string') {
            errors.push('To field is required and must be a string');
        }
        else if (message.to.length > this.MAX_STRING_LENGTH) {
            errors.push(`To field exceeds maximum length of ${this.MAX_STRING_LENGTH} characters`);
        }
        if (!message.type || typeof message.type !== 'string') {
            errors.push('Type field is required and must be a string');
        }
        else if (!Object.values(MessageProtocol_1.MessageType).includes(message.type)) {
            errors.push(`Invalid message type: ${message.type}`);
        }
        if (message.correlationId && typeof message.correlationId !== 'string') {
            errors.push('Correlation ID must be a string if provided');
        }
        if (message.requiresAck !== undefined && typeof message.requiresAck !== 'boolean') {
            errors.push('RequiresAck must be a boolean if provided');
        }
        return { isValid: errors.length === 0, errors, warnings };
    }
    validateSpawnAgentPayload(payload, errors, warnings) {
        if (!payload.role || typeof payload.role !== 'string') {
            errors.push('SpawnAgent payload requires role field');
        }
        else if (payload.role.length > 100) {
            errors.push('Role field exceeds maximum length of 100 characters');
        }
        if (!payload.name || typeof payload.name !== 'string') {
            errors.push('SpawnAgent payload requires name field');
        }
        else if (payload.name.length > 200) {
            errors.push('Name field exceeds maximum length of 200 characters');
        }
        if (payload.template && typeof payload.template !== 'string') {
            errors.push('Template field must be a string if provided');
        }
        if (payload.autoStart !== undefined && typeof payload.autoStart !== 'boolean') {
            errors.push('AutoStart field must be a boolean if provided');
        }
    }
    validateAssignTaskPayload(payload, errors, warnings) {
        if (!payload.agentId || typeof payload.agentId !== 'string') {
            errors.push('AssignTask payload requires agentId field');
        }
        if (!payload.taskId || typeof payload.taskId !== 'string') {
            errors.push('AssignTask payload requires taskId field');
        }
        if (!payload.title || typeof payload.title !== 'string') {
            errors.push('AssignTask payload requires title field');
        }
        if (!payload.description || typeof payload.description !== 'string') {
            errors.push('AssignTask payload requires description field');
        }
        if (payload.priority !== undefined) {
            const validPriorities = ['low', 'medium', 'high', 'critical'];
            if (!validPriorities.includes(payload.priority)) {
                errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
            }
        }
        if (payload.dependencies && !Array.isArray(payload.dependencies)) {
            errors.push('Dependencies must be an array if provided');
        }
        if (payload.deadline && typeof payload.deadline !== 'string') {
            errors.push('Deadline must be a string if provided');
        }
    }
    validateTaskProgressPayload(payload, errors, warnings) {
        if (!payload.taskId || typeof payload.taskId !== 'string') {
            errors.push('TaskProgress payload requires taskId field');
        }
        if (payload.progress !== undefined) {
            if (typeof payload.progress !== 'number' || payload.progress < 0 || payload.progress > 100) {
                errors.push('Progress must be a number between 0 and 100');
            }
        }
        if (payload.status && typeof payload.status !== 'string') {
            errors.push('Status must be a string if provided');
        }
    }
    validateTaskCompletePayload(payload, errors, warnings) {
        if (!payload.taskId || typeof payload.taskId !== 'string') {
            errors.push('TaskComplete payload requires taskId field');
        }
        if (payload.success === undefined || typeof payload.success !== 'boolean') {
            errors.push('TaskComplete payload requires success field as boolean');
        }
        if (payload.output !== undefined && typeof payload.output !== 'string') {
            errors.push('Output must be a string if provided');
        }
        if (payload.filesCreated && !Array.isArray(payload.filesCreated)) {
            errors.push('FilesCreated must be an array if provided');
        }
        if (payload.filesModified && !Array.isArray(payload.filesModified)) {
            errors.push('FilesModified must be an array if provided');
        }
        if (payload.metrics && typeof payload.metrics !== 'object') {
            errors.push('Metrics must be an object if provided');
        }
    }
    validateTaskErrorPayload(payload, errors, warnings) {
        if (!payload.taskId || typeof payload.taskId !== 'string') {
            errors.push('TaskError payload requires taskId field');
        }
        if (!payload.error || typeof payload.error !== 'string') {
            errors.push('TaskError payload requires error field');
        }
        if (payload.errorCode && typeof payload.errorCode !== 'string') {
            errors.push('ErrorCode must be a string if provided');
        }
    }
    validateAgentStatusPayload(payload, errors, warnings) {
        if (!payload.agentId || typeof payload.agentId !== 'string') {
            errors.push('AgentStatus payload requires agentId field');
        }
        if (!payload.status || typeof payload.status !== 'string') {
            errors.push('AgentStatus payload requires status field');
        }
        else {
            const validStatuses = ['idle', 'working', 'paused', 'error', 'offline'];
            if (!validStatuses.includes(payload.status)) {
                errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
            }
        }
        if (payload.completedTasks === undefined || typeof payload.completedTasks !== 'number') {
            errors.push('AgentStatus payload requires completedTasks field as number');
        }
        if (payload.failedTasks === undefined || typeof payload.failedTasks !== 'number') {
            errors.push('AgentStatus payload requires failedTasks field as number');
        }
        if (payload.uptime === undefined || typeof payload.uptime !== 'number') {
            errors.push('AgentStatus payload requires uptime field as number');
        }
        if (payload.currentTask && typeof payload.currentTask !== 'string') {
            errors.push('CurrentTask must be a string if provided');
        }
        if (payload.capabilities && !Array.isArray(payload.capabilities)) {
            errors.push('Capabilities must be an array if provided');
        }
    }
    validateAgentQueryPayload(payload, errors, warnings) {
        if (!payload.question || typeof payload.question !== 'string') {
            errors.push('AgentQuery payload requires question field');
        }
        if (payload.needsResponse === undefined || typeof payload.needsResponse !== 'boolean') {
            errors.push('AgentQuery payload requires needsResponse field as boolean');
        }
        if (payload.options && !Array.isArray(payload.options)) {
            errors.push('Options must be an array if provided');
        }
        if (payload.context && typeof payload.context !== 'object') {
            errors.push('Context must be an object if provided');
        }
    }
    validateGenericPayload(payload, errors, warnings) {
        if (typeof payload !== 'object' || payload === null) {
            errors.push('Payload must be an object');
            return;
        }
        try {
            JSON.stringify(payload);
        }
        catch (error) {
            errors.push('Payload contains circular references');
        }
        const payloadStr = JSON.stringify(payload);
        if (payloadStr.length > this.MAX_PAYLOAD_SIZE) {
            errors.push(`Payload size exceeds maximum allowed size of ${this.MAX_PAYLOAD_SIZE} bytes`);
        }
    }
    isValidISOTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return !isNaN(date.getTime()) && date.toISOString() === timestamp;
        }
        catch {
            return false;
        }
    }
}
exports.MessageValidator = MessageValidator;
//# sourceMappingURL=MessageValidator.js.map