/**
 * Interface for AI Provider implementations
 * This abstraction allows NofX to work with different AI tools beyond Claude
 */

export interface IAIProvider {
    /**
     * Name of the AI provider (e.g., 'claude', 'openai', 'gemini')
     */
    readonly name: string;

    /**
     * Version of the provider implementation
     */
    readonly version: string;

    /**
     * Check if this provider supports sub-agents
     */
    supportsSubAgents(): boolean;

    /**
     * Get available sub-agent types for this provider
     */
    getAvailableSubAgentTypes(): SubAgentTypeInfo[];

    /**
     * Execute a sub-agent task
     */
    executeSubAgent(type: string, prompt: string, options?: SubAgentOptions): Promise<SubAgentResult>;

    /**
     * Cancel a running sub-agent task
     */
    cancelSubAgent(taskId: string): Promise<void>;

    /**
     * Get the command to start the AI with a system prompt
     */
    getAICommand(systemPrompt: string): string;

    /**
     * Parse sub-agent request from terminal output
     */
    parseSubAgentRequest(text: string): ParsedSubAgentRequest | null;

    /**
     * Format sub-agent response for injection into terminal
     */
    formatSubAgentResponse(result: SubAgentResult): string;

    /**
     * Check if the AI provider is available/installed
     */
    isAvailable(): Promise<boolean>;

    /**
     * Get provider-specific configuration
     */
    getConfiguration(): AIProviderConfig;
}

export interface SubAgentTypeInfo {
    id: string;
    name: string;
    description: string;
    capabilities: string[];
    maxConcurrent?: number;
}

export interface SubAgentOptions {
    timeout?: number;
    priority?: number;
    context?: Record<string, any>;
    workingDirectory?: string;
    environment?: Record<string, string>;
}

export interface SubAgentResult {
    taskId: string;
    success: boolean;
    result: string;
    error?: string;
    duration: number;
    metadata?: Record<string, any>;
}

export interface ParsedSubAgentRequest {
    type: string;
    description: string;
    prompt: string;
    options?: SubAgentOptions;
}

export interface AIProviderConfig {
    executablePath: string;
    defaultTimeout: number;
    maxConcurrentSubAgents: number;
    supportedFeatures: string[];
    environmentVariables?: Record<string, string>;
}

/**
 * Factory interface for creating AI providers
 */
export interface IAIProviderFactory {
    /**
     * Create an AI provider based on configuration
     */
    createProvider(aiPath: string): IAIProvider;

    /**
     * Get all registered providers
     */
    getRegisteredProviders(): string[];

    /**
     * Register a new provider
     */
    registerProvider(name: string, factory: () => IAIProvider): void;
}
