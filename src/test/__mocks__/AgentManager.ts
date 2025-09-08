import { AgentManager as BaseAgentManager } from '../../agents/AgentManager';
import { Agent } from '../../types/agent';

/**
 * Test wrapper for AgentManager that provides additional methods for testing
 */
export class AgentManager extends BaseAgentManager {
    // Expose agents for testing
    getAgents(): Agent[] {
        // Access private agents property via reflection
        const agentsMap = (this as any).agents as Map<string, Agent>;
        return Array.from(agentsMap.values());
    }

    // Add updateAgentStatus for testing
    async updateAgentStatus(agentId: string, status: string): Promise<void> {
        const agent = this.getAgent(agentId);
        if (agent) {
            agent.status = status as any;
            // Fire update event
            (this as any)._onAgentUpdate?.fire();
        }
    }
}
