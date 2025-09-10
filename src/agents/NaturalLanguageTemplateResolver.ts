/**
 * Natural Language Template Resolution System
 *
 * Parses natural language requests and generates appropriate Smart Template configurations.
 * Supports both individual agent requests and team composition requests.
 */

import { AgentConfig, DeveloperConfig, ArchitectConfig, QualityConfig, ProcessConfig } from './SmartTemplateSystem';
import { SmartAgentConfigInterface } from './types';
import {
    NaturalLanguageParsePayload,
    TemplateConfigRequestPayload,
    TemplateConfigResponsePayload
} from '../orchestration/MessageProtocol';

export interface NLParseResult {
    confidence: number; // 0-1 confidence score
    parsedIntent: {
        action: 'spawn_agent' | 'create_team' | 'assign_task' | 'modify_config';
        agentType?: string;
        teamType?: string;
        taskDescription?: string;
        priority?: 'low' | 'medium' | 'high' | 'critical';
        urgency?: 'low' | 'medium' | 'high';
    };
    extractedConfig?: Partial<SmartAgentConfigInterface>;
    suggestedConfigs?: SmartAgentConfigInterface[]; // Multiple suggestions
    ambiguities?: string[];
    suggestions?: string[];
    requiresUserInput?: boolean;
}

export interface TeamComposition {
    teamName: string;
    teamType: string;
    agentConfigs: SmartAgentConfigInterface[];
    confidence: number;
}

/**
 * Natural Language Template Resolver
 * Uses pattern matching, keyword analysis, and context understanding
 * to generate smart template configurations from natural language.
 */
export class NaturalLanguageTemplateResolver {
    // Domain keywords and patterns
    private static readonly DOMAIN_PATTERNS = {
        frontend: [
            'ui',
            'frontend',
            'react',
            'vue',
            'angular',
            'css',
            'html',
            'javascript',
            'typescript',
            'user interface',
            'client-side',
            'web interface',
            'responsive design',
            'component',
            'styling',
            'layout',
            'interactive',
            'user experience',
            'browser'
        ],
        backend: [
            'backend',
            'server',
            'api',
            'database',
            'nodejs',
            'python',
            'java',
            'go',
            'rust',
            'server-side',
            'microservices',
            'rest',
            'graphql',
            'endpoint',
            'service',
            'authentication',
            'authorization',
            'middleware',
            'orm',
            'sql'
        ],
        fullstack: [
            'fullstack',
            'full-stack',
            'end-to-end',
            'full stack',
            'complete application',
            'both frontend and backend',
            'entire application',
            'web application'
        ],
        mobile: [
            'mobile',
            'ios',
            'android',
            'react native',
            'flutter',
            'swift',
            'kotlin',
            'app store',
            'play store',
            'mobile app',
            'native app',
            'cross-platform'
        ],
        'ai-ml': [
            'ai',
            'ml',
            'machine learning',
            'artificial intelligence',
            'deep learning',
            'neural network',
            'tensorflow',
            'pytorch',
            'model',
            'data science',
            'nlp',
            'computer vision',
            'prediction',
            'classification',
            'regression'
        ],
        data: [
            'data',
            'analytics',
            'etl',
            'pipeline',
            'warehouse',
            'lake',
            'processing',
            'visualization',
            'reporting',
            'metrics',
            'dashboard',
            'bi',
            'olap'
        ]
    };

    private static readonly ARCHITECTURE_PATTERNS = {
        software: [
            'architecture',
            'system design',
            'scalability',
            'performance',
            'design patterns',
            'microservices',
            'distributed',
            'high-level design',
            'technical planning'
        ],
        database: [
            'database design',
            'schema',
            'data modeling',
            'sql optimization',
            'indexing',
            'database architecture',
            'data structure',
            'normalization',
            'denormalization'
        ],
        security: [
            'security architecture',
            'threat modeling',
            'security design',
            'compliance',
            'encryption',
            'authentication',
            'authorization',
            'security audit'
        ],
        cloud: [
            'cloud architecture',
            'aws',
            'azure',
            'gcp',
            'kubernetes',
            'docker',
            'infrastructure',
            'deployment',
            'devops',
            'cloud-native'
        ]
    };

    private static readonly QUALITY_PATTERNS = {
        testing: [
            'testing',
            'test',
            'unit test',
            'integration test',
            'e2e',
            'qa',
            'quality assurance',
            'automated testing',
            'test automation',
            'test coverage',
            'test framework'
        ],
        security: [
            'security testing',
            'penetration testing',
            'vulnerability',
            'security audit',
            'security scan',
            'compliance testing',
            'security assessment'
        ],
        performance: [
            'performance testing',
            'load testing',
            'stress testing',
            'performance audit',
            'optimization',
            'benchmarking',
            'profiling',
            'performance analysis'
        ],
        audit: [
            'code audit',
            'code review',
            'quality audit',
            'compliance audit',
            'security audit',
            'technical audit',
            'review process'
        ]
    };

    private static readonly PROCESS_PATTERNS = {
        'product-manager': [
            'product manager',
            'product management',
            'roadmap',
            'requirements',
            'features',
            'user stories',
            'backlog',
            'prioritization',
            'product strategy'
        ],
        'scrum-master': [
            'scrum master',
            'scrum',
            'agile',
            'sprint',
            'ceremonies',
            'standups',
            'retrospective',
            'sprint planning',
            'impediments',
            'team coaching'
        ],
        'release-manager': [
            'release manager',
            'release management',
            'deployment',
            'release planning',
            'version control',
            'changelog',
            'rollback',
            'release coordination'
        ],
        'technical-writer': [
            'technical writer',
            'documentation',
            'docs',
            'guides',
            'tutorials',
            'api documentation',
            'user manual',
            'technical writing'
        ],
        designer: [
            'designer',
            'ui designer',
            'ux designer',
            'design',
            'mockups',
            'prototypes',
            'wireframes',
            'user experience',
            'visual design',
            'design system'
        ]
    };

    private static readonly TEAM_PATTERNS = {
        'full-stack-team': [
            'full stack team',
            'complete development team',
            'end-to-end team',
            'web development team',
            'application development team'
        ],
        'security-audit-team': [
            'security team',
            'security audit team',
            'penetration testing team',
            'security assessment team',
            'vulnerability assessment team'
        ],
        'data-team': [
            'data team',
            'analytics team',
            'data science team',
            'data engineering team',
            'ml team',
            'machine learning team'
        ],
        'devops-team': [
            'devops team',
            'infrastructure team',
            'deployment team',
            'operations team',
            'platform team',
            'cloud team'
        ]
    };

    private static readonly ACTION_PATTERNS = {
        spawn_agent: [
            'create',
            'spawn',
            'add',
            'hire',
            'get',
            'need',
            'want',
            'bring in',
            'assign',
            'allocate',
            'deploy',
            'instantiate',
            'initialize'
        ],
        create_team: [
            'team',
            'group',
            'squad',
            'crew',
            'multiple agents',
            'several agents',
            'bunch of agents',
            'collection of agents'
        ],
        assign_task: [
            'task',
            'work on',
            'implement',
            'build',
            'develop',
            'fix',
            'solve',
            'handle',
            'take care of',
            'work with',
            'focus on'
        ]
    };

    private static readonly PRIORITY_PATTERNS = {
        critical: ['critical', 'urgent', 'emergency', 'asap', 'immediately', 'high priority'],
        high: ['important', 'high', 'priority', 'soon', 'quickly'],
        medium: ['normal', 'standard', 'medium', 'regular'],
        low: ['low', 'when possible', 'eventually', 'later', 'nice to have']
    };

    /**
     * Parse natural language request and extract agent configuration intent
     */
    public static parseNaturalLanguageRequest(request: string): NLParseResult {
        const normalizedRequest = request.toLowerCase().trim();

        // Detect action type
        const action = this.detectAction(normalizedRequest);

        // Extract configurations based on action
        switch (action.type) {
            case 'spawn_agent':
                return this.parseAgentRequest(normalizedRequest, action.confidence);
            case 'create_team':
                return this.parseTeamRequest(normalizedRequest, action.confidence);
            case 'assign_task':
                return this.parseTaskRequest(normalizedRequest, action.confidence);
            default:
                return {
                    confidence: 0.1,
                    parsedIntent: { action: 'spawn_agent' },
                    requiresUserInput: true,
                    ambiguities: ['Could not determine the intended action'],
                    suggestions: [
                        'Try: "Create a frontend developer", "I need a security audit team", "Assign this task to..."'
                    ]
                };
        }
    }

    /**
     * Detect the primary action from natural language
     */
    private static detectAction(request: string): { type: string; confidence: number } {
        const actionScores = {
            spawn_agent: 0,
            create_team: 0,
            assign_task: 0
        };

        // Score based on keyword matches
        for (const [action, patterns] of Object.entries(this.ACTION_PATTERNS)) {
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    actionScores[action as keyof typeof actionScores] += 0.3;
                }
            }
        }

        // Team indicators boost team creation score
        for (const teamPattern of Object.values(this.TEAM_PATTERNS).flat()) {
            if (request.includes(teamPattern)) {
                actionScores.create_team += 0.5;
            }
        }

        // Task-related words boost task assignment
        const taskWords = ['implement', 'build', 'fix', 'develop', 'create', 'work on'];
        for (const word of taskWords) {
            if (request.includes(word)) {
                actionScores.assign_task += 0.2;
            }
        }

        // Default to agent spawning if no clear team/task indicators
        if (actionScores.create_team < 0.3 && actionScores.assign_task < 0.3) {
            actionScores.spawn_agent += 0.4;
        }

        // Find highest scoring action
        const bestAction = Object.entries(actionScores).sort(([, a], [, b]) => b - a)[0];

        return {
            type: bestAction[0],
            confidence: Math.min(bestAction[1], 1.0)
        };
    }

    /**
     * Parse individual agent spawn request
     */
    private static parseAgentRequest(request: string, baseConfidence: number): NLParseResult {
        const category = this.detectAgentCategory(request);

        if (!category.type) {
            return {
                confidence: 0.2,
                parsedIntent: { action: 'spawn_agent' },
                requiresUserInput: true,
                ambiguities: ['Could not determine agent type from request'],
                suggestions: ['Specify: frontend, backend, fullstack, mobile, AI/ML, testing, security, etc.']
            };
        }

        const config = this.buildAgentConfig(category.type, request);
        const priority = this.detectPriority(request);

        return {
            confidence: Math.min(baseConfidence + category.confidence, 1.0),
            parsedIntent: {
                action: 'spawn_agent',
                agentType: category.type,
                priority: priority.level,
                urgency: priority.urgency
            },
            extractedConfig: config,
            suggestedConfigs: [config],
            requiresUserInput: false
        };
    }

    /**
     * Parse team creation request
     */
    private static parseTeamRequest(request: string, baseConfidence: number): NLParseResult {
        const teamType = this.detectTeamType(request);
        const teamComposition = this.generateTeamComposition(teamType.type, request);

        return {
            confidence: Math.min(baseConfidence + teamType.confidence, 1.0),
            parsedIntent: {
                action: 'create_team',
                teamType: teamType.type
            },
            suggestedConfigs: teamComposition.agentConfigs,
            requiresUserInput: teamComposition.agentConfigs.length === 0
        };
    }

    /**
     * Parse task assignment request
     */
    private static parseTaskRequest(request: string, baseConfidence: number): NLParseResult {
        const priority = this.detectPriority(request);

        // Extract task description (everything after action words)
        const taskDescription = this.extractTaskDescription(request);

        return {
            confidence: Math.min(baseConfidence + 0.3, 1.0),
            parsedIntent: {
                action: 'assign_task',
                taskDescription,
                priority: priority.level,
                urgency: priority.urgency
            }
        };
    }

    /**
     * Detect agent category from request
     */
    private static detectAgentCategory(request: string): { type: string; confidence: number } {
        const scores: Record<string, number> = {};

        // Score all categories
        for (const [category, patterns] of Object.entries(this.DOMAIN_PATTERNS)) {
            scores[`developer:${category}`] = 0;
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    scores[`developer:${category}`] += 0.4;
                }
            }
        }

        for (const [scope, patterns] of Object.entries(this.ARCHITECTURE_PATTERNS)) {
            scores[`architect:${scope}`] = 0;
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    scores[`architect:${scope}`] += 0.4;
                }
            }
        }

        for (const [focus, patterns] of Object.entries(this.QUALITY_PATTERNS)) {
            scores[`quality:${focus}`] = 0;
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    scores[`quality:${focus}`] += 0.4;
                }
            }
        }

        for (const [role, patterns] of Object.entries(this.PROCESS_PATTERNS)) {
            scores[`process:${role}`] = 0;
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    scores[`process:${role}`] += 0.4;
                }
            }
        }

        // Find best match
        const bestMatch = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];

        if (bestMatch && bestMatch[1] > 0.2) {
            return {
                type: bestMatch[0],
                confidence: Math.min(bestMatch[1], 1.0)
            };
        }

        return { type: '', confidence: 0 };
    }

    /**
     * Build agent configuration from category and request
     */
    private static buildAgentConfig(categoryType: string, request: string): SmartAgentConfigInterface {
        const [category, domain] = categoryType.split(':');

        const baseConfig: SmartAgentConfigInterface = {
            category: category as any,
            complexity: 'medium',
            priority: 'medium'
        };

        switch (category) {
            case 'developer':
                return {
                    ...baseConfig,
                    category: 'developer',
                    primaryDomain: domain,
                    languages: this.extractLanguages(request, domain),
                    frameworks: this.extractFrameworks(request, domain),
                    specializations: this.extractSpecializations(request, domain),
                    toolchain: this.extractTools(request)
                } as DeveloperConfig;

            case 'architect':
                return {
                    ...baseConfig,
                    category: 'architect',
                    scope: domain,
                    focusAreas: this.extractFocusAreas(request),
                    decisionLevel: 'strategic' as any,
                    systemTypes: this.extractSystemTypes(request)
                } as ArchitectConfig;

            case 'quality':
                return {
                    ...baseConfig,
                    category: 'quality',
                    primaryFocus: domain,
                    testingTypes: this.extractTestingTypes(request),
                    securityScope: this.extractSecurityScope(request),
                    auditAreas: this.extractAuditAreas(request),
                    toolchain: this.extractQualityTools(request)
                } as QualityConfig;

            case 'process':
                return {
                    ...baseConfig,
                    category: 'process',
                    role: domain as any,
                    methodologies: this.extractMethodologies(request),
                    stakeholders: this.extractStakeholders(request),
                    deliverables: this.extractDeliverables(request),
                    communicationStyle: 'business'
                } as ProcessConfig;

            default:
                return baseConfig;
        }
    }

    /**
     * Extract programming languages from request
     */
    private static extractLanguages(request: string, domain: string): string[] {
        const languages = [];
        const languagePatterns = [
            'typescript',
            'javascript',
            'python',
            'java',
            'go',
            'rust',
            'cpp',
            'c#',
            'php',
            'ruby',
            'swift',
            'kotlin',
            'dart',
            'html',
            'css',
            'sql'
        ];

        for (const lang of languagePatterns) {
            if (request.includes(lang)) {
                languages.push(lang);
            }
        }

        // Add domain defaults if none specified
        if (languages.length === 0) {
            const domainDefaults = {
                frontend: ['typescript', 'javascript', 'html', 'css'],
                backend: ['python', 'typescript', 'sql'],
                fullstack: ['typescript', 'javascript', 'python', 'html', 'css'],
                mobile: ['typescript', 'swift', 'kotlin'],
                'ai-ml': ['python', 'typescript'],
                data: ['python', 'sql', 'r']
            };
            return domainDefaults[domain as keyof typeof domainDefaults] || ['typescript'];
        }

        return languages;
    }

    /**
     * Extract frameworks from request
     */
    private static extractFrameworks(request: string, domain: string): string[] {
        const frameworks = [];
        const frameworkPatterns = [
            'react',
            'vue',
            'angular',
            'next.js',
            'nuxt',
            'express',
            'fastapi',
            'django',
            'flask',
            'spring',
            'nestjs',
            'tensorflow',
            'pytorch'
        ];

        for (const framework of frameworkPatterns) {
            if (request.includes(framework)) {
                frameworks.push(framework);
            }
        }

        return frameworks;
    }

    /**
     * Extract specializations from request
     */
    private static extractSpecializations(request: string, domain: string): string[] {
        const specializations = [];

        // Common specialization patterns
        const patterns = {
            'responsive-design': ['responsive', 'mobile-first', 'adaptive'],
            accessibility: ['accessibility', 'a11y', 'wcag'],
            performance: ['performance', 'optimization', 'speed'],
            'api-design': ['api', 'rest', 'graphql', 'endpoints'],
            'database-design': ['database', 'sql', 'schema'],
            security: ['security', 'authentication', 'authorization'],
            testing: ['testing', 'unit tests', 'integration'],
            devops: ['devops', 'ci/cd', 'deployment', 'docker'],
            'ui-ux': ['ui', 'ux', 'user experience', 'design'],
            'machine-learning': ['ml', 'machine learning', 'ai', 'models']
        };

        for (const [spec, keywords] of Object.entries(patterns)) {
            for (const keyword of keywords) {
                if (request.includes(keyword)) {
                    specializations.push(spec);
                    break;
                }
            }
        }

        return [...new Set(specializations)]; // Remove duplicates
    }

    /**
     * Extract tools from request
     */
    private static extractTools(request: string): string[] {
        const tools = [];
        const toolPatterns = [
            'vscode',
            'git',
            'docker',
            'kubernetes',
            'jest',
            'cypress',
            'webpack',
            'vite',
            'npm',
            'yarn',
            'postgresql',
            'mongodb',
            'redis'
        ];

        for (const tool of toolPatterns) {
            if (request.includes(tool)) {
                tools.push(tool);
            }
        }

        return tools;
    }

    // Additional extraction methods...
    private static extractFocusAreas(request: string): string[] {
        const areas = ['scalability', 'performance', 'security', 'maintainability'];
        return areas.filter(area => request.includes(area));
    }

    private static extractSystemTypes(request: string): string[] {
        const types = ['microservices', 'monolith', 'distributed-systems', 'serverless'];
        return types.filter(type => request.includes(type));
    }

    private static extractTestingTypes(request: string): string[] {
        const types = ['unit', 'integration', 'e2e', 'performance', 'security'];
        return types.filter(type => request.includes(type));
    }

    private static extractSecurityScope(request: string): string[] {
        const scopes = ['application-security', 'infrastructure-security', 'data-security'];
        return scopes.filter(scope => request.includes(scope));
    }

    private static extractAuditAreas(request: string): string[] {
        const areas = ['code-quality', 'security-compliance', 'performance-audit'];
        return areas.filter(area => request.includes(area));
    }

    private static extractQualityTools(request: string): string[] {
        const tools = ['jest', 'cypress', 'playwright', 'selenium', 'burp-suite', 'sonarqube'];
        return tools.filter(tool => request.includes(tool));
    }

    private static extractMethodologies(request: string): string[] {
        const methodologies = ['agile', 'scrum', 'kanban', 'lean', 'waterfall'];
        return methodologies.filter(method => request.includes(method));
    }

    private static extractStakeholders(request: string): string[] {
        const stakeholders = ['users', 'developers', 'business', 'management', 'customers'];
        return stakeholders.filter(stakeholder => request.includes(stakeholder));
    }

    private static extractDeliverables(request: string): string[] {
        const deliverables = ['documentation', 'roadmaps', 'requirements', 'specifications'];
        return deliverables.filter(deliverable => request.includes(deliverable));
    }

    /**
     * Detect team type from request
     */
    private static detectTeamType(request: string): { type: string; confidence: number } {
        const scores: Record<string, number> = {};

        for (const [teamType, patterns] of Object.entries(this.TEAM_PATTERNS)) {
            scores[teamType] = 0;
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    scores[teamType] += 0.5;
                }
            }
        }

        const bestMatch = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];

        return {
            type: bestMatch ? bestMatch[0] : 'custom-team',
            confidence: bestMatch ? Math.min(bestMatch[1], 1.0) : 0.3
        };
    }

    /**
     * Generate team composition based on type
     */
    private static generateTeamComposition(teamType: string, request: string): TeamComposition {
        const teamCompositions = {
            'full-stack-team': [
                { category: 'developer', primaryDomain: 'frontend', complexity: 'high', priority: 'high' },
                { category: 'developer', primaryDomain: 'backend', complexity: 'high', priority: 'high' },
                { category: 'quality', primaryFocus: 'testing', complexity: 'medium', priority: 'high' },
                { category: 'architect', scope: 'software', complexity: 'high', priority: 'critical' }
            ],
            'security-audit-team': [
                { category: 'quality', primaryFocus: 'security', complexity: 'high', priority: 'critical' },
                { category: 'architect', scope: 'security', complexity: 'high', priority: 'critical' },
                { category: 'quality', primaryFocus: 'audit', complexity: 'medium', priority: 'high' }
            ],
            'data-team': [
                { category: 'developer', primaryDomain: 'ai-ml', complexity: 'high', priority: 'high' },
                { category: 'developer', primaryDomain: 'data', complexity: 'high', priority: 'high' },
                { category: 'architect', scope: 'database', complexity: 'high', priority: 'high' }
            ]
        };

        const composition = teamCompositions[teamType as keyof typeof teamCompositions] || [];

        return {
            teamName: teamType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            teamType,
            agentConfigs: composition as SmartAgentConfigInterface[],
            confidence: composition.length > 0 ? 0.8 : 0.3
        };
    }

    /**
     * Detect priority level from request
     */
    private static detectPriority(request: string): {
        level: 'low' | 'medium' | 'high' | 'critical';
        urgency: 'low' | 'medium' | 'high';
    } {
        for (const [priority, patterns] of Object.entries(this.PRIORITY_PATTERNS)) {
            for (const pattern of patterns) {
                if (request.includes(pattern)) {
                    const urgency = priority === 'critical' ? 'high' : priority === 'high' ? 'medium' : 'low';
                    return {
                        level: priority as 'low' | 'medium' | 'high' | 'critical',
                        urgency: urgency as 'low' | 'medium' | 'high'
                    };
                }
            }
        }

        return { level: 'medium', urgency: 'low' };
    }

    /**
     * Extract task description from request
     */
    private static extractTaskDescription(request: string): string {
        // Remove common action words and extract the main task
        const actionWords = ['please', 'can you', 'i need', 'help me', 'work on', 'implement', 'create', 'build'];
        let description = request;

        for (const word of actionWords) {
            description = description.replace(new RegExp(word, 'gi'), '').trim();
        }

        return description || request;
    }

    /**
     * Generate comprehensive suggestions for ambiguous requests
     */
    public static generateSuggestions(request: string): string[] {
        const suggestions = [];

        // Check if request is too generic
        if (request.length < 10) {
            suggestions.push('Try being more specific about what you need');
        }

        // Suggest categories if none detected
        const category = this.detectAgentCategory(request);
        if (category.confidence < 0.3) {
            suggestions.push('Specify agent type: frontend, backend, testing, security, etc.');
        }

        // Suggest technologies if none mentioned
        const hasLanguages = ['typescript', 'python', 'java', 'go'].some(lang => request.includes(lang));
        if (!hasLanguages) {
            suggestions.push('Mention specific technologies: React, Python, Node.js, etc.');
        }

        return suggestions;
    }
}
