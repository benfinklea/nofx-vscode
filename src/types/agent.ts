// Re-export agent types from the agents module
export { Agent, AgentStatus, AgentConfig } from '../agents/types';

// Re-export AgentTemplate from NofxAgentFactory
export { AgentTemplate } from '../agents/NofxAgentFactory';

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

// Activity monitoring types
export type AgentActivityStatus =
    | 'active' // 🟢 Currently working (output detected)
    | 'waiting' // 🟡 Awaiting user input/permission
    | 'thinking' // 🔵 No output but recently active
    | 'inactive' // 🟠 No activity for 30+ seconds
    | 'stuck' // 🔴 Needs immediate attention (2+ minutes)
    | 'permission' // ⚠️ Claude asking for permission
    | 'completed' // ✅ Task completed
    | 'error'; // ❌ Error detected

export interface AgentMonitoringState {
    agentId: string;
    status: AgentActivityStatus;
    lastActivity: Date;
    metrics: {
        outputLinesPerMinute: number;
        idleTimeSeconds: number;
        permissionRequestCount: number;
        taskCompletionCount: number;
        errorCount: number;
    };
}

export interface MonitoringConfig {
    inactivityWarning: number; // seconds (default: 30)
    inactivityAlert: number; // seconds (default: 120)
    autoComplete: boolean; // auto-mark tasks complete
    notificationLevel: 'minimal' | 'normal' | 'verbose';
    soundAlerts: boolean; // audio notifications
    autoApprove: string[]; // list of safe operations
}
