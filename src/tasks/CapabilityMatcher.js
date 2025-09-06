"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityMatcher = void 0;
class CapabilityMatcher {
    constructor(loggingService, configService) {
        this.capabilitySynonyms = new Map();
        this.capabilityNormalization = new Map();
        this.typeCompatibility = new Map([
            ['frontend', ['frontend', 'fullstack']],
            ['backend', ['backend', 'fullstack']],
            ['fullstack', ['frontend', 'backend', 'fullstack']],
            ['mobile', ['mobile', 'frontend']],
            ['devops', ['devops', 'backend']],
            ['testing', ['testing', 'frontend', 'backend']],
            ['ai', ['ai', 'backend']],
            ['database', ['database', 'backend']]
        ]);
        this.logger = loggingService;
        this.configService = configService;
        this.weights = {
            capabilityMatch: 0.40,
            specializationMatch: 0.25,
            typeMatch: 0.20,
            workloadFactor: 0.10,
            performanceFactor: 0.05
        };
        this.initializeCapabilitySynonyms();
        this.loadWeightsFromConfig();
        this.configChangeDisposable = this.configService.onDidChange((e) => {
            if (e.affectsConfiguration('nofx.matcher.weights')) {
                this.loadWeightsFromConfig();
            }
        });
    }
    scoreAgent(agent, task) {
        const { score } = this.scoreAgentWithBreakdown(agent, task);
        return score;
    }
    scoreAgentWithBreakdown(agent, task) {
        const breakdown = this.calculateScoreBreakdown(agent, task);
        const totalScore = breakdown.capabilityMatch * this.weights.capabilityMatch +
            breakdown.specializationMatch * this.weights.specializationMatch +
            breakdown.typeMatch * this.weights.typeMatch +
            breakdown.workloadFactor * this.weights.workloadFactor +
            breakdown.performanceFactor * this.weights.performanceFactor;
        const clampedScore = Math.max(0, Math.min(1, totalScore));
        this.logger.debug(`Agent ${agent.id} scored ${clampedScore.toFixed(2)} for task ${task.id}`, breakdown);
        return { score: clampedScore, breakdown };
    }
    findBestAgent(agents, task) {
        if (agents.length === 0) {
            return null;
        }
        const idleAgents = agents.filter(agent => agent.status === 'idle');
        if (idleAgents.length === 0) {
            this.logger.warn('No idle agents available for task assignment');
            return null;
        }
        const scoredAgents = idleAgents.map(agent => {
            const { score, breakdown } = this.scoreAgentWithBreakdown(agent, task);
            return { agent, score, breakdown };
        });
        scoredAgents.sort((a, b) => b.score - a.score);
        const bestAgent = scoredAgents[0];
        const minScore = this.configService?.get('nofx.matcher.minScore', 0) || 0;
        if (bestAgent.score < minScore) {
            this.logger.warn(`Best agent ${bestAgent.agent.id} score ${bestAgent.score.toFixed(2)} below minimum threshold ${minScore} for task ${task.id}`);
            return null;
        }
        this.logger.info(`Best agent for task ${task.id}: ${bestAgent.agent.id} (score: ${bestAgent.score.toFixed(2)})`);
        return bestAgent.agent;
    }
    rankAgents(agents, task) {
        return agents
            .map(agent => ({
            agent,
            score: this.scoreAgent(agent, task)
        }))
            .sort((a, b) => b.score - a.score);
    }
    calculateCapabilityMatch(agentCapabilities, requiredCapabilities) {
        if (requiredCapabilities.length === 0) {
            return 1.0;
        }
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
        if (matchScore === 0) {
            return -0.2;
        }
        return matchScore;
    }
    calculateScoreBreakdown(agent, task) {
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
        const capabilityMatch = this.calculateCapabilityMatch(template.capabilities || [], task.requiredCapabilities || []);
        const specializationMatch = this.calculateSpecializationMatch(template.specialization, task.description, task.tags || []);
        const typeMatch = this.calculateTypeMatch(template.type, task);
        const workloadFactor = this.calculateWorkloadFactor(agent);
        const performanceFactor = this.calculatePerformanceFactor(agent);
        return {
            capabilityMatch,
            specializationMatch,
            typeMatch,
            workloadFactor,
            performanceFactor
        };
    }
    initializeCapabilitySynonyms() {
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
        for (const group of capabilityGroups) {
            const normalizedGroup = group.map(cap => cap.toLowerCase());
            const synonymSet = new Set(normalizedGroup);
            for (const capability of normalizedGroup) {
                this.capabilitySynonyms.set(capability, synonymSet);
                this.capabilityNormalization.set(capability, capability);
            }
        }
    }
    hasCapabilityMatch(agentCapabilities, requiredCapability) {
        const normalizedRequired = requiredCapability.toLowerCase();
        if (agentCapabilities.includes(normalizedRequired)) {
            return true;
        }
        const requiredSynonyms = this.capabilitySynonyms.get(normalizedRequired);
        if (requiredSynonyms) {
            const agentCapabilitySet = new Set(agentCapabilities);
            const intersection = new Set([...agentCapabilitySet].filter(cap => requiredSynonyms.has(cap)));
            return intersection.size > 0;
        }
        return false;
    }
    calculateSpecializationMatch(specialization, taskDescription, taskTags) {
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
        if (matchScore < 0.1) {
            return -0.1;
        }
        return matchScore;
    }
    calculateTypeMatch(agentType, task) {
        if (!agentType || typeof agentType !== 'string') {
            return 0;
        }
        const taskType = this.inferTaskType(task);
        if (!taskType) {
            return 0;
        }
        const compatibleTypes = this.typeCompatibility.get(agentType) || [];
        if (compatibleTypes.includes(taskType)) {
            return 1.0;
        }
        else {
            return -0.2;
        }
    }
    inferTaskType(task) {
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
    calculateWorkloadFactor(agent) {
        if (!agent.currentTask) {
            return 1.0;
        }
        return 0.3;
    }
    calculatePerformanceFactor(agent) {
        if (agent.tasksCompleted === 0) {
            return 0.5;
        }
        return Math.min(1.0, agent.tasksCompleted / 10);
    }
    getMatchExplanation(agent, task) {
        const breakdown = this.calculateScoreBreakdown(agent, task);
        const template = agent.template;
        if (!template) {
            return 'Agent has no template information';
        }
        const explanations = [];
        if (breakdown.capabilityMatch > 0.7) {
            explanations.push(`Strong capability match (${(breakdown.capabilityMatch * 100).toFixed(0)}%)`);
        }
        else if (breakdown.capabilityMatch > 0.3) {
            explanations.push(`Moderate capability match (${(breakdown.capabilityMatch * 100).toFixed(0)}%)`);
        }
        else {
            explanations.push(`Weak capability match (${(breakdown.capabilityMatch * 100).toFixed(0)}%)`);
        }
        if (breakdown.specializationMatch > 0.5) {
            explanations.push(`Good specialization match`);
        }
        if (breakdown.typeMatch >= 1.0) {
            explanations.push(`Perfect type compatibility`);
        }
        else if (breakdown.typeMatch <= 0) {
            explanations.push(`Type mismatch`);
        }
        if (breakdown.workloadFactor === 1.0) {
            explanations.push(`Agent is idle`);
        }
        else {
            explanations.push(`Agent is busy`);
        }
        return explanations.join(', ');
    }
    updateWeights(newWeights) {
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
    getWeights() {
        return { ...this.weights };
    }
    loadWeightsFromConfig() {
        if (!this.configService)
            return;
        this.weights.capabilityMatch = this.configService.get('nofx.matcher.weights.capabilityMatch', this.weights.capabilityMatch);
        this.weights.specializationMatch = this.configService.get('nofx.matcher.weights.specializationMatch', this.weights.specializationMatch);
        this.weights.typeMatch = this.configService.get('nofx.matcher.weights.typeMatch', this.weights.typeMatch);
        this.weights.workloadFactor = this.configService.get('nofx.matcher.weights.workloadFactor', this.weights.workloadFactor);
        this.weights.performanceFactor = this.configService.get('nofx.matcher.weights.performanceFactor', this.weights.performanceFactor);
        this.logger.info('CapabilityMatcher weights loaded from configuration', this.weights);
    }
    dispose() {
        this.configChangeDisposable?.dispose();
        this.logger.debug('CapabilityMatcher disposed');
    }
}
exports.CapabilityMatcher = CapabilityMatcher;
//# sourceMappingURL=CapabilityMatcher.js.map