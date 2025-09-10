// Simplified event interfaces - clear and concise

export interface IEventEmitter {
    emit(event: string, data?: any): void;
}

export interface IEventSubscriber {
    on(event: string, handler: EventHandler): void;
    off(event: string, handler: EventHandler): void;
    subscribePattern?(pattern: string, handler: (event: string, data?: any) => void): any; // Optional pattern subscription
}

// Extended interface that includes publish method
export interface IEventPublisher {
    publish(event: string, data?: any): void;
}

// Combined interface for full EventBus compatibility
export interface IEventBus extends IEventEmitter, IEventSubscriber, IEventPublisher {
    // Explicitly define publish to avoid conflict
    publish(event: string, data?: any): void;
}

export type EventHandler = (data?: any) => void;
