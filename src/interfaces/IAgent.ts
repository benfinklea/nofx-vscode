// Simplified agent interfaces - focused responsibilities

export interface IAgentLifecycle {
    spawn(config: AgentConfig): Promise<Agent>;
    terminate(agentId: string): Promise<void>;
}

export interface IAgentQuery {
    getAgent(id: string): Agent | undefined;
    getAllAgents(): Agent[];
}

export interface AgentConfig {
    name: string;
    role: string;
    capabilities?: string[];
}

export interface Agent {
    id: string;
    name: string;
    role: string;
    status: 'idle' | 'busy' | 'error';
}
