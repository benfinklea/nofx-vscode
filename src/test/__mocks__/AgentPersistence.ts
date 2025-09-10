import { PersistenceService as BasePersistenceService } from '../../services/PersistenceService';
import { Agent } from '../../types/agent';
import { getAppStateStore } from '../../state/AppStateStore';
import * as selectors from '../../state/selectors';
import * as actions from '../../state/actions';
/**
 * Test wrapper for PersistenceService that provides additional methods for testing
 */
export class PersistenceService extends BasePersistenceService {
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
