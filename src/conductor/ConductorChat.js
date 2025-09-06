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
exports.ConductorChat = void 0;
const vscode = __importStar(require("vscode"));
class ConductorChat {
    constructor(agentManager, taskQueue) {
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get('claudePath') || 'claude';
    }
    async start() {
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎼 NofX Conductor',
                iconPath: new vscode.ThemeIcon('comment-discussion')
            });
        }
        this.terminal.show();
        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🎸 NofX Conductor Starting..."');
        this.terminal.sendText('echo "================================================"');
        this.terminal.sendText('echo "I am your conductor. Tell me what you want to build."');
        this.terminal.sendText('echo "I will manage the agents and delegate tasks automatically."');
        this.terminal.sendText('echo "================================================"');
        this.terminal.sendText('echo ""');
        const conductorPrompt = this.getConductorSystemPrompt();
        const escapedPrompt = conductorPrompt.replace(/'/g, "'\\''");
        this.terminal.sendText(`${this.claudePath} --append-system-prompt '${escapedPrompt}'`);
        setTimeout(() => {
            if (this.terminal) {
                this.terminal.sendText('Hello! I am the NofX Conductor. I manage a team of specialized AI agents. Tell me what you want to build or fix, and I will orchestrate the agents to complete your request. What would you like to work on today?');
            }
        }, 2000);
        vscode.window.showInformationMessage('🎼 Conductor is ready! Chat with the conductor to manage your development team.', 'View Conductor').then(selection => {
            if (selection === 'View Conductor') {
                this.terminal?.show();
            }
        });
    }
    getConductorSystemPrompt() {
        const agents = this.agentManager.getActiveAgents();
        const agentList = agents.map(a => `- ${a.name} (${a.type}): ${a.status}`).join('\n');
        return `You are the NofX Conductor, an orchestration AI that manages a team of specialized agents.

Your role:
1. Understand what the user wants to build or fix
2. Break down complex requests into tasks
3. Delegate tasks to appropriate agents
4. Monitor progress and report back to the user
5. Coordinate between agents when needed

Current team:
${agentList || 'No agents active yet. I can spawn agents as needed.'}

Available agent types:
- Frontend Specialist (React, Vue, UI/UX)
- Backend Specialist (Node.js, APIs, databases)
- DevOps Engineer (Docker, CI/CD, infrastructure)
- Testing Specialist (unit tests, integration tests)
- Documentation Writer (README, API docs, comments)
- AI/ML Engineer (machine learning, data processing)

When the user gives you a request:
1. Acknowledge and understand the request
2. Identify which agents are needed
3. Break down the work into specific tasks
4. Explain your plan to the user
5. Say: "I'll now delegate these tasks to the agents..."

Remember: You are the conductor. The user talks to you, and you manage everything else. Be conversational, helpful, and proactive in managing the development team.`;
    }
    dispose() {
        this.terminal?.dispose();
    }
}
exports.ConductorChat = ConductorChat;
//# sourceMappingURL=ConductorChat.js.map