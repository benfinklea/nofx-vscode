// Re-export agent types from the agents module
export {
    Agent,
    AgentStatus,
    AgentConfig
} from '../agents/types';

// Re-export AgentTemplate from AgentTemplateManager
export { AgentTemplate } from '../agents/AgentTemplateManager';

// Additional agent-related types for testing
export interface AgentCapabilities {
    capabilities?: string[];
    taskPreferences?: {
        preferred?: string[];
        avoid?: string[];
    };
}

// Extended agent type with additional testing properties
import { Agent } from '../agents/types';
import * as vscode from 'vscode';

export interface TestAgent extends Agent {
    workingDirectory?: string;
    capabilities?: string[];
    terminal: vscode.Terminal;
}
