import { IConfigurationService } from './interfaces';

export interface AIProviderConfig {
    command: string;
    args: string[];
    name: string;
    description: string;
    supportsSystemPrompt: boolean;
    systemPromptFlag?: string;
}

/**
 * Resolves AI provider selections to actual CLI commands
 */
export class AIProviderResolver {
    private static readonly PROVIDERS: Record<string, AIProviderConfig> = {
        claude: {
            command: 'claude',
            args: ['--append-system-prompt'],
            name: 'Claude Code',
            description: 'Anthropic Claude Code CLI',
            supportsSystemPrompt: true,
            systemPromptFlag: '--append-system-prompt'
        },
        aider: {
            command: 'aider',
            args: ['--chat-mode'],
            name: 'Aider',
            description: 'AI pair programming in the terminal',
            supportsSystemPrompt: false
        },
        copilot: {
            command: 'gh',
            args: ['copilot', 'chat'],
            name: 'GitHub Copilot CLI',
            description: 'GitHub Copilot command line interface',
            supportsSystemPrompt: false
        },
        cursor: {
            command: 'cursor',
            args: ['--chat'],
            name: 'Cursor AI',
            description: 'Cursor AI chat interface',
            supportsSystemPrompt: false
        },
        codeium: {
            command: 'codeium',
            args: ['chat'],
            name: 'Codeium',
            description: 'Codeium AI coding assistant',
            supportsSystemPrompt: false
        },
        continue: {
            command: 'continue',
            args: ['--chat'],
            name: 'Continue.dev',
            description: 'Open-source AI code assistant',
            supportsSystemPrompt: false
        }
    };

    constructor(private configService: IConfigurationService) {}

    /**
     * Get the resolved AI command for the current provider
     */
    getAiCommand(): string {
        const provider = this.configService.getAiProvider();

        if (provider === 'custom') {
            return this.configService.getAiPath();
        }

        const config = AIProviderResolver.PROVIDERS[provider];
        if (!config) {
            // Fallback to custom path if unknown provider
            return this.configService.getAiPath();
        }

        // Return the base command - args will be handled separately
        return config.command;
    }

    /**
     * Get the full command with arguments for spawning
     */
    getFullCommand(): string {
        const provider = this.configService.getAiProvider();

        if (provider === 'custom') {
            return this.configService.getAiPath();
        }

        const config = AIProviderResolver.PROVIDERS[provider];
        if (!config) {
            return this.configService.getAiPath();
        }

        return `${config.command} ${config.args.join(' ')}`;
    }

    /**
     * Get system prompt command for the current provider
     */
    getSystemPromptCommand(prompt: string): string {
        const provider = this.configService.getAiProvider();

        if (provider === 'custom') {
            // For custom providers, assume they work like Claude
            // Replace newlines with spaces to keep command on single line
            const cleanPrompt = prompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
            const escapedPrompt = cleanPrompt.replace(/'/g, "'\\''");
            return `${this.configService.getAiPath()} --append-system-prompt '${escapedPrompt}'`;
        }

        const config = AIProviderResolver.PROVIDERS[provider];
        if (!config) {
            // Fallback
            // Replace newlines with spaces to keep command on single line
            const cleanPrompt = prompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
            const escapedPrompt = cleanPrompt.replace(/'/g, "'\\''");
            return `${this.configService.getAiPath()} --append-system-prompt '${escapedPrompt}'`;
        }

        if (config.supportsSystemPrompt && config.systemPromptFlag) {
            // Replace newlines with spaces to keep command on single line
            const cleanPrompt = prompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
            const escapedPrompt = cleanPrompt.replace(/'/g, "'\\''");
            return `${config.command} ${config.systemPromptFlag} '${escapedPrompt}'`;
        } else {
            // For providers that don't support system prompts, just launch them normally
            // The user will need to paste the prompt manually
            return `${config.command} ${config.args.join(' ')}`;
        }
    }

    /**
     * Get provider configuration
     */
    getProviderConfig(provider?: string): AIProviderConfig | null {
        const providerName = provider || this.configService.getAiProvider();
        return AIProviderResolver.PROVIDERS[providerName] || null;
    }

    /**
     * Get all available providers
     */
    getAllProviders(): Record<string, AIProviderConfig> {
        return { ...AIProviderResolver.PROVIDERS };
    }

    /**
     * Check if the current provider supports system prompts
     */
    supportsSystemPrompt(): boolean {
        const provider = this.configService.getAiProvider();

        if (provider === 'custom') {
            // Assume custom providers work like Claude by default
            return true;
        }

        const config = AIProviderResolver.PROVIDERS[provider];
        return config?.supportsSystemPrompt || false;
    }

    /**
     * Get a user-friendly description of the current provider
     */
    getCurrentProviderDescription(): string {
        const provider = this.configService.getAiProvider();

        if (provider === 'custom') {
            return `Custom command: ${this.configService.getAiPath()}`;
        }

        const config = AIProviderResolver.PROVIDERS[provider];
        return config ? `${config.name} - ${config.description}` : `Unknown provider: ${provider}`;
    }
}
