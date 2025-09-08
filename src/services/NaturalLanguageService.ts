import * as vscode from 'vscode';
import { ILoggingService } from './interfaces';

/**
 * Pattern definition for natural language command matching
 */
interface CommandPattern {
    pattern: RegExp;
    converter: (matches: RegExpMatchArray) => any;
    description: string;
    examples: string[];
    confidence: number; // 0-1, higher means more specific match
}

/**
 * Service to convert natural language to conductor JSON commands
 * Enhanced with robust error handling and fallback mechanisms
 */
export class NaturalLanguageService {
    private patterns: CommandPattern[] = [];
    private loggingService?: ILoggingService;
    private failureCount: number = 0;
    private lastSuccessfulParse: Date = new Date();
    private commandHistory: Map<string, any> = new Map();
    private readonly MAX_FAILURES = 5;
    private readonly CACHE_SIZE = 100;
    private isHealthy: boolean = true;

    constructor(loggingService?: ILoggingService) {
        this.loggingService = loggingService;
        try {
            this.initializePatterns();
            this.loggingService?.info('NaturalLanguageService initialized successfully');
        } catch (error) {
            this.loggingService?.error('Failed to initialize NaturalLanguageService patterns', error);
            // Continue with empty patterns - service will still try to parse JSON
            this.patterns = [];
        }
    }

    /**
     * Initialize all natural language patterns
     */
    private initializePatterns(): void {
        // Spawn agent patterns
        this.patterns.push({
            pattern:
                /(?:add|spawn|create|start)\s+(?:a\s+)?(\w+)(?:\s+(?:agent|dev|developer|specialist|engineer))?(?:\s+(?:called|named)\s+["']?([^"']+)["']?)?/i,
            converter: matches => ({
                type: 'spawn',
                role: this.normalizeAgentType(matches[1]),
                name: matches[2] || undefined
            }),
            description: 'Spawn a new agent',
            examples: ['add a frontend dev', 'spawn backend specialist called API Expert', 'create testing agent'],
            confidence: 0.9
        });

        // Status query patterns
        this.patterns.push({
            pattern: /(?:what'?s?|show|list|get)\s+(?:everyone|all agents?|the team)\s+(?:doing|status|working on)?/i,
            converter: () => ({
                type: 'status',
                agentId: 'all'
            }),
            description: 'Query all agents status',
            examples: ["what's everyone doing?", 'show all agents', 'list the team'],
            confidence: 0.95
        });

        this.patterns.push({
            pattern: /(?:what'?s?|show|get)\s+(?:agent[-\s])?(\d+|[a-zA-Z][\w-]*)\s+(?:doing|status|working on)?/i,
            converter: matches => ({
                type: 'status',
                agentId: `agent-${matches[1]}`
            }),
            description: 'Query specific agent status',
            examples: ["what's agent-1 doing?", 'show agent-2 status'],
            confidence: 0.9
        });

        // Task assignment patterns
        this.patterns.push({
            pattern: /(?:assign|give|delegate)\s+["']?(.+?)["']?\s+to\s+(?:agent[-\s])?(\d+|[a-zA-Z][\w-]*)/i,
            converter: matches => ({
                type: 'assign',
                task: matches[1],
                agentId: `agent-${matches[2]}`,
                priority: 'normal'
            }),
            description: 'Assign task to agent',
            examples: ['assign login form to agent-1', 'give "API endpoints" to backend-dev'],
            confidence: 0.85
        });

        this.patterns.push({
            pattern: /(?:have|tell|ask)\s+(?:agent[-\s])?(\d+|[a-zA-Z][\w-]*)\s+(?:to\s+)?(.+)/i,
            converter: matches => ({
                type: 'assign',
                agentId: `agent-${matches[1]}`,
                task: matches[2],
                priority: 'normal'
            }),
            description: 'Direct agent to do task',
            examples: ['have agent-1 create the navbar', 'tell frontend-dev to fix the CSS'],
            confidence: 0.8
        });

        // Termination patterns
        this.patterns.push({
            pattern: /(?:terminate|stop|remove|dismiss|kill)\s+(?:agent[-\s])?(\d+|[a-zA-Z][\w-]*|all)/i,
            converter: matches => ({
                type: 'terminate',
                agentId: matches[1] === 'all' ? 'all' : `agent-${matches[1]}`
            }),
            description: 'Terminate agent(s)',
            examples: ['terminate agent-1', 'stop all', 'dismiss backend-dev'],
            confidence: 0.95
        });

        // Priority task patterns
        this.patterns.push({
            pattern: /(?:urgent|high priority|asap|immediately)\s*:?\s*(.+)/i,
            converter: matches => ({
                type: 'assign',
                task: matches[1],
                priority: 'high',
                agentId: 'auto' // Conductor will decide
            }),
            description: 'High priority task',
            examples: ['urgent: fix the login bug', 'high priority: deploy to production'],
            confidence: 0.85
        });

        // Team presets
        this.patterns.push({
            pattern: /(?:start|create|spawn|assemble)\s+(?:a\s+)?(\w+)\s+team/i,
            converter: matches => ({
                type: 'spawn_team',
                preset: this.normalizeTeamPreset(matches[1])
            }),
            description: 'Spawn a team preset',
            examples: ['start a small team', 'create fullstack team', 'assemble large team'],
            confidence: 0.9
        });

        // Help patterns
        this.patterns.push({
            pattern: /(?:help|what can you do|commands|how do i)/i,
            converter: () => ({
                type: 'help'
            }),
            description: 'Show help information',
            examples: ['help', 'what can you do?', 'show commands'],
            confidence: 1.0
        });
    }

    /**
     * Convert natural language to JSON command with robust error handling
     */
    public parseNaturalLanguage(input: string): {
        command: any | null;
        confidence: number;
        interpretation: string;
        suggestions?: string[];
        isFromCache?: boolean;
        error?: string;
    } {
        try {
            // Validate input
            if (!input || typeof input !== 'string') {
                return {
                    command: null,
                    confidence: 0,
                    interpretation: 'Invalid input',
                    error: 'Input must be a non-empty string'
                };
            }

            // Check cache first for exact matches
            if (this.commandHistory.has(input)) {
                this.loggingService?.debug('Returning cached command for input:', input);
                return {
                    ...this.commandHistory.get(input),
                    isFromCache: true
                };
            }
            const trimmedInput = input.trim();

            // Check if it's already JSON with robust parsing
            if (trimmedInput.startsWith('{')) {
                try {
                    const json = JSON.parse(trimmedInput);

                    // Validate JSON structure
                    if (!json.type || typeof json.type !== 'string') {
                        throw new Error('JSON command must have a type field');
                    }

                    const result = {
                        command: this.sanitizeCommand(json),
                        confidence: 1.0,
                        interpretation: 'Raw JSON command'
                    };

                    this.recordSuccess(input, result);
                    return result;
                } catch (error) {
                    this.loggingService?.warn('Invalid JSON in input, attempting natural language parsing:', error);
                    // Continue with natural language parsing as fallback
                }
            }

            // Try to match patterns
            let bestMatch: { command: any; confidence: number; description: string } | null = null;

            for (const pattern of this.patterns) {
                const matches = trimmedInput.match(pattern.pattern);
                if (matches) {
                    const command = pattern.converter(matches);
                    if (!bestMatch || pattern.confidence > bestMatch.confidence) {
                        bestMatch = {
                            command,
                            confidence: pattern.confidence,
                            description: pattern.description
                        };
                    }
                }
            }

            if (bestMatch) {
                try {
                    const sanitizedCommand = this.sanitizeCommand(bestMatch.command);

                    this.loggingService?.debug('Natural language parsed:', {
                        input: trimmedInput,
                        command: sanitizedCommand,
                        confidence: bestMatch.confidence
                    });

                    const result = {
                        command: sanitizedCommand,
                        confidence: bestMatch.confidence,
                        interpretation: `${bestMatch.description}: ${JSON.stringify(sanitizedCommand)}`
                    };

                    this.recordSuccess(input, result);
                    return result;
                } catch (error) {
                    this.loggingService?.error('Error processing matched command:', error);
                    this.recordFailure();

                    return {
                        command: null,
                        confidence: 0,
                        interpretation: 'Error processing command',
                        error: error instanceof Error ? error.message : 'Unknown error',
                        suggestions: this.getSuggestions(trimmedInput)
                    };
                }
            }

            // No match found, provide suggestions
            const suggestions = this.getSuggestions(trimmedInput);

            this.recordFailure();

            return {
                command: null,
                confidence: 0,
                interpretation: 'Could not understand command',
                suggestions,
                error: 'No matching pattern found'
            };
        } catch (error) {
            // Catastrophic failure - log and return safe default
            this.loggingService?.error('Catastrophic failure in parseNaturalLanguage:', error);
            this.recordFailure();

            return {
                command: null,
                confidence: 0,
                interpretation: 'Service error',
                error: 'Natural language service encountered an error',
                suggestions: ['Try using JSON format: {"type": "spawn", "role": "frontend-specialist"}']
            };
        }
    }

    /**
     * Get command suggestions based on partial input
     */
    private getSuggestions(input: string): string[] {
        const suggestions: string[] = [];
        const keywords = input.toLowerCase().split(/\s+/);

        // Check which patterns might be relevant
        for (const pattern of this.patterns) {
            for (const example of pattern.examples) {
                const exampleKeywords = example.toLowerCase().split(/\s+/);
                const matchCount = keywords.filter(k => exampleKeywords.some(e => e.includes(k))).length;
                if (matchCount > 0) {
                    suggestions.push(example);
                }
            }
        }

        // Limit to top 3 suggestions
        return suggestions.slice(0, 3);
    }

    /**
     * Normalize agent type input to valid role
     */
    private normalizeAgentType(type: string): string {
        const normalized = type.toLowerCase().replace(/[-_\s]+/g, '-');

        const typeMap: Record<string, string> = {
            frontend: 'frontend-specialist',
            front: 'frontend-specialist',
            ui: 'frontend-specialist',
            backend: 'backend-specialist',
            back: 'backend-specialist',
            api: 'backend-specialist',
            fullstack: 'fullstack-developer',
            full: 'fullstack-developer',
            test: 'testing-specialist',
            testing: 'testing-specialist',
            qa: 'testing-specialist',
            devops: 'devops-engineer',
            ops: 'devops-engineer',
            ai: 'ai-ml-specialist',
            ml: 'ai-ml-specialist',
            mobile: 'mobile-developer',
            ios: 'mobile-developer',
            android: 'mobile-developer',
            security: 'security-expert',
            sec: 'security-expert',
            database: 'database-architect',
            db: 'database-architect',
            data: 'database-architect'
        };

        return typeMap[normalized] || `${normalized}-specialist`;
    }

    /**
     * Normalize team preset name
     */
    private normalizeTeamPreset(preset: string | undefined): string {
        if (!preset) return 'standard-team';
        const normalized = preset.toLowerCase();

        const presetMap: Record<string, string> = {
            small: 'small-team',
            standard: 'standard-team',
            large: 'large-team',
            fullstack: 'fullstack-team',
            full: 'fullstack-team',
            custom: 'custom-team'
        };

        return presetMap[normalized] || 'standard-team';
    }

    /**
     * Show interpretation dialog for confirmation
     */
    public async confirmInterpretation(interpretation: string, command: any): Promise<boolean> {
        const message = `I understood: ${interpretation}\n\nExecute this command?`;
        const result = await vscode.window.showInformationMessage(message, { modal: false }, 'Yes', 'No', 'Show JSON');

        if (result === 'Show JSON') {
            await vscode.window
                .showInformationMessage(
                    `JSON Command:\n${JSON.stringify(command, null, 2)}`,
                    { modal: true },
                    'Execute',
                    'Cancel'
                )
                .then(r => r === 'Execute');
        }

        return result === 'Yes';
    }

    /**
     * Sanitize and validate command structure
     */
    private sanitizeCommand(command: any): any {
        if (!command || typeof command !== 'object') {
            throw new Error('Command must be an object');
        }

        // Ensure required fields
        if (!command.type) {
            throw new Error('Command must have a type field');
        }

        // Sanitize string fields
        const sanitized: any = {};
        for (const [key, value] of Object.entries(command)) {
            if (typeof value === 'string') {
                // Remove any potentially dangerous characters
                sanitized[key] = value.replace(/[<>"'`;\\]/g, '');
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Record successful parse for caching and metrics
     */
    private recordSuccess(input: string, result: any): void {
        this.failureCount = 0;
        this.lastSuccessfulParse = new Date();
        this.isHealthy = true;

        // Add to cache with size limit
        if (this.commandHistory.size >= this.CACHE_SIZE) {
            const firstKey = this.commandHistory.keys().next().value;
            if (firstKey !== undefined) {
                this.commandHistory.delete(firstKey);
            }
        }
        this.commandHistory.set(input, result);
    }

    /**
     * Record parse failure for health monitoring
     */
    private recordFailure(): void {
        this.failureCount++;

        if (this.failureCount > this.MAX_FAILURES) {
            this.isHealthy = false;
            this.loggingService?.error(`NaturalLanguageService unhealthy: ${this.failureCount} consecutive failures`);
        }
    }

    /**
     * Get service health status
     */
    public getHealthStatus(): {
        isHealthy: boolean;
        failureCount: number;
        lastSuccess: Date;
        cacheSize: number;
    } {
        return {
            isHealthy: this.isHealthy,
            failureCount: this.failureCount,
            lastSuccess: this.lastSuccessfulParse,
            cacheSize: this.commandHistory.size
        };
    }

    /**
     * Reset service to healthy state
     */
    public reset(): void {
        this.failureCount = 0;
        this.isHealthy = true;
        this.commandHistory.clear();
        this.loggingService?.info('NaturalLanguageService reset to healthy state');
    }

    /**
     * Get all available example commands
     */
    public getExamples(): string[] {
        try {
            const examples: string[] = [];
            for (const pattern of this.patterns) {
                if (pattern && pattern.examples && Array.isArray(pattern.examples)) {
                    examples.push(...pattern.examples);
                }
            }
            return examples;
        } catch (error) {
            this.loggingService?.error('Error getting examples:', error);
            return ['add a frontend dev', 'assign task to agent-1', "what's everyone doing?"];
        }
    }
}
