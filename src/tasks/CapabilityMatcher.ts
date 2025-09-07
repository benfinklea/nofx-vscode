import * as vscode from 'vscode';
import { Task, Agent } from '../agents/types';
import { ILoggingService, IConfigurationService, ICapabilityMatcher } from '../services/interfaces';

interface ScoringWeights {
    capabilityMatch: number;
    specializationMatch: number;
    typeMatch: number;
    workloadFactor: number;
    performanceFactor: number;
}

interface AgentScore {
    agent: Agent;
    score: number;
    breakdown: {
        capabilityMatch: number;
        specializationMatch: number;
        typeMatch: number;
        workloadFactor: number;
        performanceFactor: number;
    };
}

export class CapabilityMatcher implements ICapabilityMatcher {
    private readonly logger: ILoggingService;
    private readonly configService: IConfigurationService;
    private weights: ScoringWeights;
    private configChangeDisposable?: vscode.Disposable;

    // Bidirectional capability synonyms using sets for efficient matching
    private readonly capabilitySynonyms: Map<string, Set<string>> = new Map();
    private readonly capabilityNormalization: Map<string, string> = new Map();

    // Type compatibility matrix
    private readonly typeCompatibility: Map<string, string[]> = new Map([
        ['frontend', ['frontend', 'fullstack']],
        ['backend', ['backend', 'fullstack']],
        ['fullstack', ['frontend', 'backend', 'fullstack']],
        ['mobile', ['mobile', 'frontend']],
        ['devops', ['devops', 'backend']],
        ['testing', ['testing', 'frontend', 'backend']],
        ['ai', ['ai', 'backend']],
        ['database', ['database', 'backend']]
    ]);

    constructor(loggingService: ILoggingService, configService: IConfigurationService) {
        this.logger = loggingService;
        this.configService = configService;

        // Initialize with default weights
        this.weights = {
            capabilityMatch: 0.4,
            specializationMatch: 0.25,
            typeMatch: 0.2,
            workloadFactor: 0.1,
            performanceFactor: 0.05
        };

        // Initialize bidirectional capability synonyms
        this.initializeCapabilitySynonyms();

        // Load weights from configuration
        this.loadWeightsFromConfig();

        // Listen to configuration changes using proper IConfigurationService API
        this.configChangeDisposable = this.configService.onDidChange((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('nofx.matcher.weights')) {
                this.loadWeightsFromConfig();
            }
        });
    }

    /**
     * Scores an agent for a specific task
     */
    scoreAgent(agent: Agent, task: Task): number {
        const { score } = this.scoreAgentWithBreakdown(agent, task);
        return score;
    }

    /**
     * Scores an agent for a specific task and returns both score and breakdown
     */
    scoreAgentWithBreakdown(agent: Agent, task: Task): { score: number; breakdown: AgentScore['breakdown'] } {
        const breakdown = this.calculateScoreBreakdown(agent, task);
        const totalScore =
            breakdown.capabilityMatch * this.weights.capabilityMatch +
            breakdown.specializationMatch * this.weights.specializationMatch +
            breakdown.typeMatch * this.weights.typeMatch +
            breakdown.workloadFactor * this.weights.workloadFactor +
            breakdown.performanceFactor * this.weights.performanceFactor;

        // Clamp total score to [0, 1] range
        const clampedScore = Math.max(0, Math.min(1, totalScore));

        this.logger.debug(`Agent ${agent.id} scored ${clampedScore.toFixed(2)} for task ${task.id}`, breakdown);
        return { score: clampedScore, breakdown };
    }

    /**
     * Finds the best agent from a list of agents for a task
     */
    findBestAgent(agents: Agent[], task: Task): Agent | null {
        if (agents.length === 0) {
            return null;
        }

        // Filter to only idle agents
        const idleAgents = agents.filter(agent => agent.status === 'idle');
        if (idleAgents.length === 0) {
            this.logger.warn('No idle agents available for task assignment');
            return null;
        }

        // Score all idle agents using the efficient method
        const scoredAgents = idleAgents.map(agent => {
            const { score, breakdown } = this.scoreAgentWithBreakdown(agent, task);
            return { agent, score, breakdown };
        });

        // Sort by score (highest first)
        scoredAgents.sort((a, b) => b.score - a.score);

        const bestAgent = scoredAgents[0];

        // Check minimum score threshold (configurable, default 0)
        const minScore = this.configService?.get<number>('nofx.matcher.minScore', 0) || 0;
        if (bestAgent.score < minScore) {
            this.logger.warn(
                `Best agent ${bestAgent.agent.id} score ${bestAgent.score.toFixed(2)} below minimum threshold ${minScore} for task ${task.id}`
            );
            return null;
        }

        this.logger.info(
            `Best agent for task ${task.id}: ${bestAgent.agent.id} (score: ${bestAgent.score.toFixed(2)})`
        );

        return bestAgent.agent;
    }

    /**
     * Ranks all agents by their suitability for a task
     */
    rankAgents(agents: Agent[], task: Task): Array<{ agent: Agent; score: number }> {
        return agents
            .map(agent => ({
                agent,
                score: this.scoreAgent(agent, task)
            }))
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Calculates capability match score between agent and task
     */
    calculateCapabilityMatch(agentCapabilities: string[], requiredCapabilities: string[]): number {
        if (requiredCapabilities.length === 0) {
            return 1.0; // No requirements means perfect match
        }

        // Normalize capabilities to lowercase
        const normalizedAgentCapabilities = agentCapabilities.map(cap => cap.toLowerCase());
        const normalizedRequiredCapabilities = requiredCapabilities.map(cap => cap.toLowerCase());

        let matchCount = 0;
        const totalRequired = normalizedRequiredCapabilities.length;

        for (const required of normalizedRequiredCapabilities) {
            if (this.hasCapabilityMatch(normalizedAgentCapabilities, required)) {
                matchCount++;
            }
        }

        const matchScore = matchCount / totalRequired;

        // Apply negative penalty for poor capability matches
        if (matchScore === 0) {
            return -0.2;
        }

        return matchScore;
    }

    /**
     * Calculates detailed score breakdown for an agent-task pair
     */
    private calculateScoreBreakdown(agent: Agent, task: Task): AgentScore['breakdown'] {
        const template = agent.template;
        if (!template) {
            return {
                capabilityMatch: 0,
                specializationMatch: 0,
                typeMatch: 0,
                workloadFactor: 0,
                performanceFactor: 0
            };
        }

        // Capability match
        const capabilityMatch = this.calculateCapabilityMatch(
            template.capabilities || [],
            task.requiredCapabilities || []
        );

        // Specialization match
        const specializationMatch = this.calculateSpecializationMatch(
            template.specialization,
            task.description,
            task.tags || []
        );

        // Type match
        const typeMatch = this.calculateTypeMatch(template.type, task);

        // Workload factor (prefer agents with fewer active tasks)
        const workloadFactor = this.calculateWorkloadFactor(agent);

        // Performance factor (based on historical performance)
        const performanceFactor = this.calculatePerformanceFactor(agent);

        return {
            capabilityMatch,
            specializationMatch,
            typeMatch,
            workloadFactor,
            performanceFactor
        };
    }

    /**
     * Initializes bidirectional capability synonyms
     */
    private initializeCapabilitySynonyms(): void {
        // Define capability groups for bidirectional matching
        const capabilityGroups = [
            ['react', 'frontend', 'javascript', 'typescript', 'ui/ux'],
            ['typescript', 'javascript', 'frontend', 'react', 'node.js'],
            ['javascript', 'frontend', 'backend', 'node.js', 'react'],
            ['node.js', 'backend', 'javascript', 'apis', 'server'],
            ['python', 'backend', 'ai', 'ml', 'data science'],
            ['database', 'postgresql', 'mongodb', 'redis', 'sql'],
            ['apis', 'rest', 'graphql', 'backend', 'node.js'],
            ['testing', 'qa', 'e2e', 'unit testing', 'automation'],
            ['devops', 'docker', 'kubernetes', 'ci/cd', 'cloud'],
            ['mobile', 'react native', 'ios', 'android', 'mobile ui']
        ];

        // Build bidirectional synonym sets
        for (const group of capabilityGroups) {
            const normalizedGroup = group.map(cap => cap.toLowerCase());
            const synonymSet = new Set(normalizedGroup);

            // Each capability in the group is synonymous with all others
            for (const capability of normalizedGroup) {
                this.capabilitySynonyms.set(capability, synonymSet);
                this.capabilityNormalization.set(capability, capability);
            }
        }
    }

    /**
     * Checks if agent has a capability that matches the required capability
     */
    private hasCapabilityMatch(agentCapabilities: string[], requiredCapability: string): boolean {
        const normalizedRequired = requiredCapability.toLowerCase();

        // Direct match (both arrays are already normalized to lowercase)
        if (agentCapabilities.includes(normalizedRequired)) {
            return true;
        }

        // Bidirectional synonym match using set intersection
        const requiredSynonyms = this.capabilitySynonyms.get(normalizedRequired);
        if (requiredSynonyms) {
            const agentCapabilitySet = new Set(agentCapabilities);
            const intersection = new Set([...agentCapabilitySet].filter(cap => requiredSynonyms.has(cap)));
            return intersection.size > 0;
        }

        return false;
    }

    /**
     * Calculates specialization match score
     */
    private calculateSpecializationMatch(
        specialization: string | undefined,
        taskDescription: string,
        taskTags: string[]
    ): number {
        // Treat missing specialization as neutral (return 0)
        if (!specialization || typeof specialization !== 'string') {
            return 0;
        }

        const specializationWords = specialization.toLowerCase().split(/[,\s]+/);
        const descriptionWords = taskDescription.toLowerCase().split(/\s+/);
        const tagWords = taskTags.map(tag => tag.toLowerCase());

        let matchCount = 0;
        const totalSpecializationWords = specializationWords.length;

        for (const specWord of specializationWords) {
            if (descriptionWords.includes(specWord) || tagWords.includes(specWord)) {
                matchCount++;
            }
        }

        const matchScore = totalSpecializationWords > 0 ? matchCount / totalSpecializationWords : 0;

        // Apply negative penalty for very poor specialization matches
        if (matchScore < 0.1) {
            return -0.1;
        }

        return matchScore;
    }

    /**
     * Calculates type compatibility score
     */
    private calculateTypeMatch(agentType: string | undefined, task: Task): number {
        // Treat missing agent type as neutral (return 0)
        if (!agentType || typeof agentType !== 'string') {
            return 0;
        }

        // Infer task type from description and tags
        const taskType = this.inferTaskType(task);

        if (!taskType) {
            return 0; // Return 0 for unknown types to avoid bias
        }

        const compatibleTypes = this.typeCompatibility.get(agentType) || [];
        if (compatibleTypes.includes(taskType)) {
            return 1.0;
        } else {
            // Apply negative penalty for type mismatch
            return -0.2;
        }
    }

    /**
     * Infers task type from description and tags
     */
    private inferTaskType(task: Task): string | null {
        const text = `${task.description} ${(task.tags || []).join(' ')}`.toLowerCase();

        if (text.includes('frontend') || text.includes('react') || text.includes('ui') || text.includes('css')) {
            return 'frontend';
        }
        if (text.includes('backend') || text.includes('api') || text.includes('server') || text.includes('database')) {
            return 'backend';
        }
        if (text.includes('mobile') || text.includes('ios') || text.includes('android')) {
            return 'mobile';
        }
        if (text.includes('devops') || text.includes('docker') || text.includes('deploy')) {
            return 'devops';
        }
        if (text.includes('test') || text.includes('qa') || text.includes('automation')) {
            return 'testing';
        }
        if (text.includes('ai') || text.includes('ml') || text.includes('python')) {
            return 'ai';
        }
        if (text.includes('database') || text.includes('sql') || text.includes('mongo')) {
            return 'database';
        }

        return null;
    }

    /**
     * Calculates workload factor (prefer agents with fewer active tasks)
     */
    private calculateWorkloadFactor(agent: Agent): number {
        // Simple heuristic: agents with no current task get higher score
        if (!agent.currentTask) {
            return 1.0;
        }

        // Agents with current task get lower score
        return 0.3;
    }

    /**
     * Calculates performance factor based on historical performance
     */
    private calculatePerformanceFactor(agent: Agent): number {
        // Simple heuristic based on tasks completed
        if (agent.tasksCompleted === 0) {
            return 0.5; // Neutral for new agents
        }

        // Prefer agents with more completed tasks (experience)
        return Math.min(1.0, agent.tasksCompleted / 10);
    }

    /**
     * Gets explanation for why an agent was chosen or rejected
     */
    getMatchExplanation(agent: Agent, task: Task): string {
        const breakdown = this.calculateScoreBreakdown(agent, task);
        const template = agent.template;

        if (!template) {
            return 'Agent has no template information';
        }

        const explanations: string[] = [];

        if (breakdown.capabilityMatch > 0.7) {
            explanations.push(`Strong capability match (${(breakdown.capabilityMatch * 100).toFixed(0)}%)`);
        } else if (breakdown.capabilityMatch > 0.3) {
            explanations.push(`Moderate capability match (${(breakdown.capabilityMatch * 100).toFixed(0)}%)`);
        } else {
            explanations.push(`Weak capability match (${(breakdown.capabilityMatch * 100).toFixed(0)}%)`);
        }

        if (breakdown.specializationMatch > 0.5) {
            explanations.push('Good specialization match');
        }

        if (breakdown.typeMatch >= 1.0) {
            explanations.push('Perfect type compatibility');
        } else if (breakdown.typeMatch <= 0) {
            explanations.push('Type mismatch');
        }

        if (breakdown.workloadFactor === 1.0) {
            explanations.push('Agent is idle');
        } else {
            explanations.push('Agent is busy');
        }

        return explanations.join(', ');
    }

    /**
     * Updates scoring weights from configuration
     */
    updateWeights(newWeights: Partial<ScoringWeights>): void {
        // Mutate fields rather than replacing the entire object
        if (newWeights.capabilityMatch !== undefined) {
            this.weights.capabilityMatch = newWeights.capabilityMatch;
        }
        if (newWeights.specializationMatch !== undefined) {
            this.weights.specializationMatch = newWeights.specializationMatch;
        }
        if (newWeights.typeMatch !== undefined) {
            this.weights.typeMatch = newWeights.typeMatch;
        }
        if (newWeights.workloadFactor !== undefined) {
            this.weights.workloadFactor = newWeights.workloadFactor;
        }
        if (newWeights.performanceFactor !== undefined) {
            this.weights.performanceFactor = newWeights.performanceFactor;
        }
        this.logger.info('CapabilityMatcher weights updated', this.weights);
    }

    /**
     * Gets current scoring weights
     */
    getWeights(): ScoringWeights {
        return { ...this.weights };
    }

    /**
     * Loads weights from configuration
     */
    private loadWeightsFromConfig(): void {
        if (!this.configService) return;

        // Use proper IConfigurationService API with get<T>(key, default?)
        this.weights.capabilityMatch = this.configService.get<number>(
            'nofx.matcher.weights.capabilityMatch',
            this.weights.capabilityMatch
        );
        this.weights.specializationMatch = this.configService.get<number>(
            'nofx.matcher.weights.specializationMatch',
            this.weights.specializationMatch
        );
        this.weights.typeMatch = this.configService.get<number>(
            'nofx.matcher.weights.typeMatch',
            this.weights.typeMatch
        );
        this.weights.workloadFactor = this.configService.get<number>(
            'nofx.matcher.weights.workloadFactor',
            this.weights.workloadFactor
        );
        this.weights.performanceFactor = this.configService.get<number>(
            'nofx.matcher.weights.performanceFactor',
            this.weights.performanceFactor
        );

        this.logger.info('CapabilityMatcher weights loaded from configuration', this.weights);
    }

    dispose(): void {
        this.configChangeDisposable?.dispose();
        this.logger.debug('CapabilityMatcher disposed');
    }
}
