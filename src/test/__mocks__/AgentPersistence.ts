import { AgentPersistence as BaseAgentPersistence } from '../../persistence/AgentPersistence';
import { Agent } from '../../types/agent';

/**
 * Test wrapper for AgentPersistence that provides additional methods for testing
 */
export class AgentPersistence extends BaseAgentPersistence {
    // Add alias for loadAgentState
    async loadAgents(): Promise<Agent[]> {
        const state = await this.loadAgentState();
        return state as Agent[];
    }

    // Add alias for saveAgentState
    async saveAgents(agents: Agent[]): Promise<void> {
        await this.saveAgentState(agents);
    }

    // Add saveAgent for single agent
    async saveAgent(agent: Agent): Promise<void> {
        const state = await this.loadAgentState();
        const existingIndex = state.findIndex((a: any) => a.id === agent.id);

        if (existingIndex >= 0) {
            state[existingIndex] = agent;
        } else {
            state.push(agent);
        }

        await this.saveAgentState(state);
    }
}
