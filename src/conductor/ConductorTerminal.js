"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConductorTerminal = void 0;
const vscode = __importStar(require("vscode"));
class ConductorTerminal {
    constructor(agentManager, taskQueue) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get('claudePath') || 'claude';
    }
    async start() {
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎸 NofX Conductor',
                iconPath: new vscode.ThemeIcon('audio')
            });
        }
        this.terminal.show();
        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🎸 NofX Conductor Terminal"');
        this.terminal.sendText('echo "=========================="');
        this.terminal.sendText('echo ""');
        this.terminal.sendText('echo "Starting Claude conductor with system prompt..."');
        this.terminal.sendText('echo ""');
        const systemPrompt = this.getSystemPrompt();
        const escapedPrompt = systemPrompt.replace(/'/g, "'\\''");
        const command = `${this.claudePath} --append-system-prompt '${escapedPrompt}'`;
        this.terminal.sendText('echo "Running: claude --append-system-prompt \'<conductor system prompt>\'"');
        this.terminal.sendText('echo ""');
        this.terminal.sendText(command);
    }
    getSystemPrompt() {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');
        return `You are the NofX Conductor - a senior technical leader orchestrating AI agents.

Your role:
1. Understand what the user wants to build or fix
2. Break down the request into tasks
3. Assign tasks to appropriate agents
4. Monitor progress and handle conflicts
5. Report back to the user

ORCHESTRATION COMMANDS:
You can control agents by outputting JSON commands in your responses:

To spawn a new agent:
{"type": "spawn", "role": "frontend-specialist", "name": "Frontend Agent"}

To assign a task to an agent:
{"type": "assign", "agentId": "agent-1", "task": "Create login component", "priority": "high"}

To query agent status:
{"type": "status", "agentId": "all"}

To terminate an agent:
{"type": "terminate", "agentId": "agent-1"}

Current agents:
${agentList || 'No agents active yet'}

Available agent types:
- frontend-specialist: React, Vue, UI/UX
- backend-specialist: Node.js, Python, databases  
- fullstack-developer: End-to-end features
- devops-engineer: CI/CD, Docker, cloud
- testing-specialist: Unit tests, E2E, QA
- ai-ml-specialist: Machine learning, AI integration
- mobile-developer: iOS, Android, React Native
- security-expert: Security audits, penetration testing
- database-architect: Schema design, optimization

You are a VP-level technical leader. Make architectural decisions, enforce quality standards, and ensure exceptional software delivery.`;
    }
    stop() {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }
    }
}
exports.ConductorTerminal = ConductorTerminal;
//# sourceMappingURL=ConductorTerminal.js.map