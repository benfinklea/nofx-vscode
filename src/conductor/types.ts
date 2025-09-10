import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { TaskQueue } from '../tasks/TaskQueue';

/**
 * Conductor interface types
 */
export type ConductorInterfaceType = 'terminal' | 'webview' | 'chat';

/**
 * Conversation styles for conductors
 */
export type ConversationStyle = 'direct' | 'friendly' | 'professional';

/**
 * Configuration for conductor features
 */
export interface ConductorFeatures {
    codebaseAnalysis: boolean;
    performanceMonitoring: boolean;
    loadBalancing: boolean;
    naturalLanguage: boolean;
    subAgents: boolean;
    taskDependencies: boolean;
    agentHealthMonitoring: boolean;
}

/**
 * Configuration for a unified conductor
 */
export interface ConductorConfig {
    interface: ConductorInterfaceType;
    conversationStyle: ConversationStyle;
    features: ConductorFeatures;
    aiPath?: string;
    systemPromptOverride?: string;
}

/**
 * Default conductor configurations
 */
export const DEFAULT_CONDUCTOR_CONFIGS: Record<string, ConductorConfig> = {
    terminal: {
        interface: 'terminal',
        conversationStyle: 'professional',
        features: {
            codebaseAnalysis: true,
            performanceMonitoring: true,
            loadBalancing: true,
            naturalLanguage: true,
            subAgents: true,
            taskDependencies: true,
            agentHealthMonitoring: true
        }
    },
    webview: {
        interface: 'webview',
        conversationStyle: 'friendly',
        features: {
            codebaseAnalysis: true,
            performanceMonitoring: true,
            loadBalancing: true,
            naturalLanguage: true,
            subAgents: true,
            taskDependencies: true,
            agentHealthMonitoring: true
        }
    },
    chat: {
        interface: 'webview',
        conversationStyle: 'friendly',
        features: {
            codebaseAnalysis: true,
            performanceMonitoring: true,
            loadBalancing: true,
            naturalLanguage: true,
            subAgents: true,
            taskDependencies: true,
            agentHealthMonitoring: true
        }
    }
};

/**
 * Interface for conductor UI adapters
 */
export interface IConductorInterface {
    start(): Promise<void>;
    stop(): void;
    sendMessage(message: string): void;
    dispose(): void;
}

/**
 * Interface for conductor intelligence (VP-level only)
 */
export interface IConductorIntelligence {
    getSystemPrompt(): string;
    processCommand(command: string): Promise<string>;
    analyzeProject(): Promise<any>;
    optimizePerformance(): Promise<void>;
    balanceLoad(): Promise<void>;
}

/**
 * Base conductor dependencies
 */
export interface ConductorDependencies {
    agentManager: AgentManager;
    taskQueue: TaskQueue;
    context?: vscode.ExtensionContext;
    loggingService?: any;
    eventBus?: any;
    notificationService?: any;
}

/**
 * Conductor events
 */
export interface ConductorEvents {
    onStart?: () => void;
    onStop?: () => void;
    onMessage?: (message: string) => void;
    onError?: (error: Error) => void;
}
