import { IAIProvider, IAIProviderFactory } from './IAIProvider';
import { ClaudeAIProvider } from './ClaudeAIProvider';
import { ILogger } from '../interfaces';

/**
 * Factory for creating AI provider instances based on configuration
 * This allows NofX to support multiple AI tools with sub-agent capabilities
 */
export class AIProviderFactory implements IAIProviderFactory {
    private providers: Map<string, () => IAIProvider> = new Map();

    constructor(private loggingService?: ILogger) {
        // Register default providers
        this.registerDefaultProviders();
    }

    createProvider(aiPath: string): IAIProvider {
        // Extract provider name from path (e.g., 'claude', 'gpt', 'gemini')
        const providerName = this.extractProviderName(aiPath);

        this.loggingService?.debug(`Creating AI provider for: ${providerName} (path: ${aiPath})`);

        const factory = this.providers.get(providerName);
        if (factory) {
            const provider = factory();
            // Update the executable path if it's different from default
            if (provider instanceof ClaudeAIProvider && aiPath !== 'claude') {
                return new ClaudeAIProvider(aiPath);
            }
            return provider;
        }

        // Default to Claude provider for backward compatibility
        this.loggingService?.warn(`Unknown AI provider '${providerName}', defaulting to Claude`);
        return new ClaudeAIProvider(aiPath);
    }

    getRegisteredProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    registerProvider(name: string, factory: () => IAIProvider): void {
        this.loggingService?.debug(`Registering AI provider: ${name}`);
        this.providers.set(name.toLowerCase(), factory);
    }

    private registerDefaultProviders(): void {
        // Register Claude provider
        this.registerProvider('claude', () => new ClaudeAIProvider('claude'));

        // Register placeholder providers for future implementation
        this.registerProvider('openai', () => this.createPlaceholderProvider('openai'));
        this.registerProvider('gpt', () => this.createPlaceholderProvider('openai'));
        this.registerProvider('chatgpt', () => this.createPlaceholderProvider('openai'));
        this.registerProvider('gemini', () => this.createPlaceholderProvider('gemini'));
        this.registerProvider('copilot', () => this.createPlaceholderProvider('copilot'));
        this.registerProvider('codex', () => this.createPlaceholderProvider('codex'));
    }

    private extractProviderName(aiPath: string): string {
        // Extract the base name from the path
        const pathParts = aiPath.split(/[\/\\]/);
        const fileName = pathParts[pathParts.length - 1];

        // Remove file extension if present
        const baseName = fileName.replace(/\.(exe|sh|bat|cmd)$/i, '');

        // Common AI tool name patterns
        if (baseName.match(/claude/i)) return 'claude';
        if (baseName.match(/gpt|openai|chatgpt/i)) return 'openai';
        if (baseName.match(/gemini|bard/i)) return 'gemini';
        if (baseName.match(/copilot/i)) return 'copilot';
        if (baseName.match(/codex/i)) return 'codex';

        return baseName.toLowerCase();
    }

    /**
     * Create a placeholder provider for AIs that don't yet support sub-agents
     */
    private createPlaceholderProvider(name: string): IAIProvider {
        return {
            name,
            version: '0.0.1',
            supportsSubAgents: () => false,
            getAvailableSubAgentTypes: () => [],
            executeSubAgent: async () => {
                throw new Error(`${name} provider does not yet support sub-agents`);
            },
            cancelSubAgent: async () => {
                throw new Error(`${name} provider does not yet support sub-agents`);
            },
            getAICommand: (systemPrompt: string) => {
                // Generic command format - will need adjustment per provider
                const escapedPrompt = systemPrompt.replace(/'/g, "'\\''");
                return `${name} --system-prompt '${escapedPrompt}'`;
            },
            parseSubAgentRequest: () => null,
            formatSubAgentResponse: result => {
                return `[${name.toUpperCase()} RESULT]\n${result.result}\n`;
            },
            isAvailable: async () => false,
            getConfiguration: () => ({
                executablePath: name,
                defaultTimeout: 120000,
                maxConcurrentSubAgents: 0,
                supportedFeatures: [],
                environmentVariables: {}
            })
        };
    }
}

/**
 * Singleton instance of the AI Provider Factory
 */
let factoryInstance: AIProviderFactory | null = null;

export function getAIProviderFactory(loggingService?: ILogger): AIProviderFactory {
    if (!factoryInstance) {
        factoryInstance = new AIProviderFactory(loggingService);
    }
    return factoryInstance;
}

export function resetAIProviderFactory(): void {
    factoryInstance = null;
}
