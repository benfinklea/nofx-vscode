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
 */
export class NaturalLanguageService {
    private patterns: CommandPattern[] = [];
    private loggingService?: ILoggingService;

    constructor(loggingService?: ILoggingService) {
        this.loggingService = loggingService;
        this.initializePatterns();
    }

    /**
     * Initialize all natural language patterns
     */
    private initializePatterns(): void {
        // Spawn agent patterns
        this.patterns.push({
            pattern: /(?:add|spawn|create|start)\s+(?:a\s+)?(\w+)(?:\s+(?:agent|dev|developer|specialist|engineer))?(?:\s+(?:called|named)\s+["']?([^"']+)["']?)?/i,
            converter: (matches) => ({
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
            converter: (matches) => ({
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
            converter: (matches) => ({
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
            converter: (matches) => ({
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
            converter: (matches) => ({
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
            converter: (matches) => ({
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
            converter: (matches) => ({
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
     * Convert natural language to JSON command
     */
    public parseNaturalLanguage(input: string): {
        command: any | null;
        confidence: number;
        interpretation: string;
        suggestions?: string[];
    } {
        const trimmedInput = input.trim();
        
        // Check if it's already JSON
        if (trimmedInput.startsWith('{')) {
            try {
                const json = JSON.parse(trimmedInput);
                return {
                    command: json,
                    confidence: 1.0,
                    interpretation: 'Raw JSON command'
                };
            } catch {
                // Not valid JSON, continue with natural language parsing
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
            this.loggingService?.debug('Natural language parsed:', {
                input: trimmedInput,
                command: bestMatch.command,
                confidence: bestMatch.confidence
            });

            return {
                command: bestMatch.command,
                confidence: bestMatch.confidence,
                interpretation: `${bestMatch.description}: ${JSON.stringify(bestMatch.command)}`
            };
        }

        // No match found, provide suggestions
        const suggestions = this.getSuggestions(trimmedInput);
        
        return {
            command: null,
            confidence: 0,
            interpretation: 'Could not understand command',
            suggestions
        };
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
            'frontend': 'frontend-specialist',
            'front': 'frontend-specialist',
            'ui': 'frontend-specialist',
            'backend': 'backend-specialist',
            'back': 'backend-specialist',
            'api': 'backend-specialist',
            'fullstack': 'fullstack-developer',
            'full': 'fullstack-developer',
            'test': 'testing-specialist',
            'testing': 'testing-specialist',
            'qa': 'testing-specialist',
            'devops': 'devops-engineer',
            'ops': 'devops-engineer',
            'ai': 'ai-ml-specialist',
            'ml': 'ai-ml-specialist',
            'mobile': 'mobile-developer',
            'ios': 'mobile-developer',
            'android': 'mobile-developer',
            'security': 'security-expert',
            'sec': 'security-expert',
            'database': 'database-architect',
            'db': 'database-architect',
            'data': 'database-architect'
        };

        return typeMap[normalized] || `${normalized}-specialist`;
    }

    /**
     * Normalize team preset name
     */
    private normalizeTeamPreset(preset: string): string {
        const normalized = preset.toLowerCase();
        
        const presetMap: Record<string, string> = {
            'small': 'small-team',
            'standard': 'standard-team',
            'large': 'large-team',
            'fullstack': 'fullstack-team',
            'full': 'fullstack-team',
            'custom': 'custom-team'
        };

        return presetMap[normalized] || 'standard-team';
    }

    /**
     * Show interpretation dialog for confirmation
     */
    public async confirmInterpretation(
        interpretation: string,
        command: any
    ): Promise<boolean> {
        const message = `I understood: ${interpretation}\n\nExecute this command?`;
        const result = await vscode.window.showInformationMessage(
            message,
            { modal: false },
            'Yes',
            'No',
            'Show JSON'
        );

        if (result === 'Show JSON') {
            await vscode.window.showInformationMessage(
                `JSON Command:\n${JSON.stringify(command, null, 2)}`,
                { modal: true },
                'Execute',
                'Cancel'
            ).then(r => r === 'Execute');
        }

        return result === 'Yes';
    }

    /**
     * Get all available example commands
     */
    public getExamples(): string[] {
        const examples: string[] = [];
        for (const pattern of this.patterns) {
            examples.push(...pattern.examples);
        }
        return examples;
    }
}