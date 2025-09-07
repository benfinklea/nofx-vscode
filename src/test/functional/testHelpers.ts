import { OrchestrationServer } from '../../orchestration/OrchestrationServer';
import { ILoggingService, IEventBus, IErrorHandler, IConnectionPoolService, IMessageRouter, IMessageValidator, IMessagePersistenceService, IMetricsService } from '../../services/interfaces';

/**
 * Create a test OrchestrationServer with stubbed dependencies
 */
export function createTestOrchestrationServer(
    port: number,
    loggingService?: ILoggingService,
    eventBus?: IEventBus,
    errorHandler?: IErrorHandler,
    additionalServices?: {
        connectionPool?: IConnectionPoolService;
        messageRouter?: IMessageRouter;
        messageValidator?: IMessageValidator;
        messagePersistence?: IMessagePersistenceService;
        metricsService?: IMetricsService;
    }
): OrchestrationServer {
    // Create default stubs if not provided
    const defaultErrorHandler = errorHandler || {
        handleError: jest.fn(),
        handleWarning: jest.fn(),
        handleInfo: jest.fn()
    } as any;

    const defaultConnectionPool = additionalServices?.connectionPool || {
        addConnection: jest.fn(),
        removeConnection: jest.fn(),
        getConnection: jest.fn(),
        getAllConnections: jest.fn().mockReturnValue([]),
        broadcast: jest.fn(),
        getMetrics: jest.fn().mockReturnValue({})
    } as any;

    const defaultMessageRouter = additionalServices?.messageRouter || {
        routeMessage: jest.fn(),
        registerHandler: jest.fn(),
        unregisterHandler: jest.fn()
    } as any;

    const defaultMessageValidator = additionalServices?.messageValidator || {
        validate: jest.fn().mockReturnValue({ isValid: true, errors: [] })
    } as any;

    const defaultMessagePersistence = additionalServices?.messagePersistence || {
        saveMessage: jest.fn(),
        getMessages: jest.fn().mockResolvedValue([]),
        clearMessages: jest.fn()
    } as any;

    const defaultMetricsService = additionalServices?.metricsService || {
        incrementCounter: jest.fn(),
        recordGauge: jest.fn(),
        recordHistogram: jest.fn(),
        getMetrics: jest.fn().mockReturnValue({}),
        reset: jest.fn(),
        setEnabled: jest.fn(),
        isEnabled: jest.fn().mockReturnValue(true)
    } as any;

    return new OrchestrationServer(
        port,
        loggingService,
        eventBus,
        defaultErrorHandler,
        defaultConnectionPool,
        defaultMessageRouter,
        defaultMessageValidator,
        defaultMessagePersistence,
        defaultMetricsService
    );
}
