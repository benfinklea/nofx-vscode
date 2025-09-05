import { 
    IMessageValidator, 
    ILoggingService, 
    IEventBus, 
    ValidationResult 
} from './interfaces';
import { ORCH_EVENTS, MessageValidationFailedPayload } from './EventConstants';
import { 
    OrchestratorMessage, 
    MessageType, 
    createMessage,
    isValidMessage,
    generateMessageId
} from '../orchestration/MessageProtocol';
import { DestinationUtil } from '../orchestration/Destinations';

export class MessageValidator implements IMessageValidator {
    private readonly MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB
    private readonly MAX_STRING_LENGTH = 10000;
    private readonly MAX_MESSAGE_ID_LENGTH = 100;

    constructor(
        private loggingService: ILoggingService,
        private eventBus: IEventBus
    ) {}

    validate(rawMessage: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check message size
        if (rawMessage.length > this.MAX_PAYLOAD_SIZE) {
            errors.push(`Message size exceeds maximum allowed size of ${this.MAX_PAYLOAD_SIZE} bytes`);
            return { isValid: false, errors, warnings };
        }

        // Parse JSON
        let message: OrchestratorMessage;
        try {
            message = JSON.parse(rawMessage);
        } catch (error) {
            errors.push('Invalid JSON format');
            return { isValid: false, errors, warnings };
        }

        // Use existing basic validation
        if (!isValidMessage(message)) {
            errors.push('Message fails basic validation checks');
            return { isValid: false, errors, warnings };
        }

        // Validate message structure
        const structureValidation = this.validateMessageStructure(message);
        errors.push(...structureValidation.errors);
        warnings.push(...structureValidation.warnings);

        // Validate payload based on message type
        if (message.payload) {
            const payloadValidation = this.validatePayload(message.type, message.payload);
            errors.push(...payloadValidation.errors);
            warnings.push(...payloadValidation.warnings);
        }

        // Validate destination
        if (message.to && !DestinationUtil.isValidDestination(message.to)) {
            errors.push(`Invalid destination: ${message.to}`);
        }

        const isValid = errors.length === 0;

        if (!isValid) {
            this.eventBus.publish(ORCH_EVENTS.MESSAGE_VALIDATION_FAILED, {
                messageId: message.id,
                errors,
                warnings,
                messageType: message.type
            } as MessageValidationFailedPayload);
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

    validatePayload(type: string, payload: any): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        switch (type) {
            case MessageType.SPAWN_AGENT:
                this.validateSpawnAgentPayload(payload, errors, warnings);
                break;
            case MessageType.ASSIGN_TASK:
                this.validateAssignTaskPayload(payload, errors, warnings);
                break;
            case MessageType.TASK_PROGRESS:
                this.validateTaskProgressPayload(payload, errors, warnings);
                break;
            case MessageType.TASK_COMPLETE:
                this.validateTaskCompletePayload(payload, errors, warnings);
                break;
            case MessageType.TASK_ERROR:
                this.validateTaskErrorPayload(payload, errors, warnings);
                break;
            case MessageType.AGENT_STATUS:
                this.validateAgentStatusPayload(payload, errors, warnings);
                break;
            case MessageType.AGENT_QUERY:
                this.validateAgentQueryPayload(payload, errors, warnings);
                break;
            case MessageType.SYSTEM_ACK:
                // ACK messages are system-level, no payload validation required
                break;
            default:
                // For unknown types, just validate basic structure
                this.validateGenericPayload(payload, errors, warnings);
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    createErrorResponse(error: string, clientId: string): OrchestratorMessage {
        return createMessage(
            'system',
            clientId,
            MessageType.SYSTEM_ERROR,
            {
                error,
                timestamp: new Date().toISOString(),
                messageId: generateMessageId()
            }
        );
    }

    dispose(): void {
        this.loggingService.debug('MessageValidator disposed');
    }

    private validateMessageStructure(message: OrchestratorMessage): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate required fields
        if (!message.id || typeof message.id !== 'string') {
            errors.push('Message ID is required and must be a string');
        } else if (message.id.length > this.MAX_MESSAGE_ID_LENGTH) {
            errors.push(`Message ID exceeds maximum length of ${this.MAX_MESSAGE_ID_LENGTH} characters`);
        }

        if (!message.timestamp || typeof message.timestamp !== 'string') {
            errors.push('Timestamp is required and must be a string');
        } else if (!this.isValidISOTimestamp(message.timestamp)) {
            errors.push('Timestamp must be a valid ISO 8601 string');
        }

        if (!message.from || typeof message.from !== 'string') {
            errors.push('From field is required and must be a string');
        } else if (message.from.length > this.MAX_STRING_LENGTH) {
            errors.push(`From field exceeds maximum length of ${this.MAX_STRING_LENGTH} characters`);
        }

        if (!message.to || typeof message.to !== 'string') {
            errors.push('To field is required and must be a string');
        } else if (message.to.length > this.MAX_STRING_LENGTH) {
            errors.push(`To field exceeds maximum length of ${this.MAX_STRING_LENGTH} characters`);
        }

        if (!message.type || typeof message.type !== 'string') {
            errors.push('Type field is required and must be a string');
        } else if (!Object.values(MessageType).includes(message.type as MessageType)) {
            errors.push(`Invalid message type: ${message.type}`);
        }

        // Validate optional fields
        if (message.correlationId && typeof message.correlationId !== 'string') {
            errors.push('Correlation ID must be a string if provided');
        }

        if (message.requiresAck !== undefined && typeof message.requiresAck !== 'boolean') {
            errors.push('RequiresAck must be a boolean if provided');
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    private validateSpawnAgentPayload(payload: any, errors: string[], warnings: string[]): void {
        if (!payload.role || typeof payload.role !== 'string') {
            errors.push('SpawnAgent payload requires role field');
        } else if (payload.role.length > 100) {
            errors.push('Role field exceeds maximum length of 100 characters');
        }

        if (!payload.name || typeof payload.name !== 'string') {
            errors.push('SpawnAgent payload requires name field');
        } else if (payload.name.length > 200) {
            errors.push('Name field exceeds maximum length of 200 characters');
        }

        if (payload.template && typeof payload.template !== 'string') {
            errors.push('Template field must be a string if provided');
        }

        if (payload.autoStart !== undefined && typeof payload.autoStart !== 'boolean') {
            errors.push('AutoStart field must be a boolean if provided');
        }
    }

    private validateAssignTaskPayload(payload: any, errors: string[], warnings: string[]): void {
        if (!payload.agentId || typeof payload.agentId !== 'string') {
            errors.push('AssignTask payload requires agentId field');
        }

        if (!payload.taskId || typeof payload.taskId !== 'string') {
            errors.push('AssignTask payload requires taskId field');
        }

        if (payload.priority !== undefined) {
            if (typeof payload.priority !== 'number' || payload.priority < 0 || payload.priority > 10) {
                errors.push('Priority must be a number between 0 and 10');
            }
        }

        if (payload.timeout && typeof payload.timeout !== 'number') {
            errors.push('Timeout must be a number if provided');
        }
    }

    private validateTaskProgressPayload(payload: any, errors: string[], warnings: string[]): void {
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

    private validateTaskCompletePayload(payload: any, errors: string[], warnings: string[]): void {
        if (!payload.taskId || typeof payload.taskId !== 'string') {
            errors.push('TaskComplete payload requires taskId field');
        }

        if (payload.result !== undefined && typeof payload.result !== 'string') {
            errors.push('Result must be a string if provided');
        }
    }

    private validateTaskErrorPayload(payload: any, errors: string[], warnings: string[]): void {
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

    private validateAgentStatusPayload(payload: any, errors: string[], warnings: string[]): void {
        if (!payload.status || typeof payload.status !== 'string') {
            errors.push('AgentStatus payload requires status field');
        }

        if (payload.capabilities && !Array.isArray(payload.capabilities)) {
            errors.push('Capabilities must be an array if provided');
        }

        if (payload.currentTask && typeof payload.currentTask !== 'string') {
            errors.push('CurrentTask must be a string if provided');
        }
    }

    private validateAgentQueryPayload(payload: any, errors: string[], warnings: string[]): void {
        if (!payload.query || typeof payload.query !== 'string') {
            errors.push('AgentQuery payload requires query field');
        }

        if (payload.queryType && typeof payload.queryType !== 'string') {
            errors.push('QueryType must be a string if provided');
        }
    }

    private validateGenericPayload(payload: any, errors: string[], warnings: string[]): void {
        if (typeof payload !== 'object' || payload === null) {
            errors.push('Payload must be an object');
            return;
        }

        // Check for circular references
        try {
            JSON.stringify(payload);
        } catch (error) {
            errors.push('Payload contains circular references');
        }

        // Check payload size
        const payloadStr = JSON.stringify(payload);
        if (payloadStr.length > this.MAX_PAYLOAD_SIZE) {
            errors.push(`Payload size exceeds maximum allowed size of ${this.MAX_PAYLOAD_SIZE} bytes`);
        }
    }


    private isValidISOTimestamp(timestamp: string): boolean {
        try {
            const date = new Date(timestamp);
            return !isNaN(date.getTime()) && date.toISOString() === timestamp;
        } catch {
            return false;
        }
    }
}
