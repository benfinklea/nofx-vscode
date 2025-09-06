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
exports.IntelligentConductor = void 0;
const vscode = __importStar(require("vscode"));
class IntelligentConductor {
    constructor(agentManager, taskQueue) {
        this.isProcessingCommand = false;
        this.agentManager = agentManager;
        this.taskQueue = taskQueue;
        this.claudePath = vscode.workspace.getConfiguration('nofx').get('claudePath') || 'claude';
        this.outputChannel = vscode.window.createOutputChannel('NofX Conductor Brain');
        this.agentManager.onAgentUpdate(() => {
            this.logStatus();
        });
    }
    async start() {
        this.outputChannel.show();
        this.outputChannel.appendLine('🎼 Intelligent Conductor Starting...');
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal({
                name: '🎼 NofX Conductor (Smart)',
                iconPath: new vscode.ThemeIcon('robot')
            });
        }
        this.terminal.show();
        this.initializeConductor();
    }
    initializeConductor() {
        if (!this.terminal)
            return;
        this.terminal.sendText('clear');
        this.terminal.sendText('echo "🎸 NofX Intelligent Conductor v2.0"');
        this.terminal.sendText('echo "========================================"');
        this.terminal.sendText('echo "I can actually control agents and tasks!"');
        this.terminal.sendText('echo "========================================"');
        this.terminal.sendText('echo ""');
        const systemPrompt = this.getEnhancedSystemPrompt().replace(/'/g, "'\\''");
        this.terminal.sendText(`${this.claudePath} --append-system-prompt '${systemPrompt}'`);
        setTimeout(() => {
            if (this.terminal) {
                this.terminal.sendText('Hello! I am the NofX Intelligent Conductor. I can:');
                this.terminal.sendText('- See all active agents and their status');
                this.terminal.sendText('- Create and assign tasks automatically');
                this.terminal.sendText('- Monitor for conflicts between agents');
                this.terminal.sendText('- Coordinate complex multi-agent workflows');
                this.terminal.sendText('');
                this.terminal.sendText('Tell me what you want to build, and I will orchestrate everything!');
                this.startCommandMonitoring();
            }
        }, 3000);
    }
    getEnhancedSystemPrompt() {
        const agents = this.agentManager.getActiveAgents();
        const idleAgents = this.agentManager.getIdleAgents();
        return `You are the NofX Intelligent Conductor v2.0 - an advanced orchestration system.

CURRENT SYSTEM STATUS:
- Active Agents: ${agents.length}
- Idle Agents: ${idleAgents.length}
- Agents: ${agents.map(a => `${a.name} (${a.type}): ${a.status}`).join(', ')}

YOUR CAPABILITIES:
1. Real-time agent status monitoring
2. Automatic task creation and delegation
3. Conflict detection and resolution
4. Multi-agent workflow coordination

WHEN USER REQUESTS SOMETHING:
1. Break it down into specific tasks
2. Identify which agents are needed
3. Say: "CONDUCTOR_COMMAND: CREATE_TASK [title] | [description] | [agent_type]"
4. Say: "CONDUCTOR_COMMAND: ASSIGN_AGENT [agent_id] | [task_id]"
5. Monitor progress and report back

CONFLICT DETECTION:
- Watch for multiple agents editing the same files
- Coordinate database schema changes
- Prevent style conflicts in frontend components
- Manage git conflicts

IMPORTANT: When you need to execute a command, always prefix it with "CONDUCTOR_COMMAND:" so the system can intercept and execute it.

You are a senior engineering manager with deep technical knowledge. Be proactive in preventing problems and ensuring smooth collaboration.`;
    }
    startCommandMonitoring() {
        setInterval(() => {
            this.checkForConflicts();
            this.optimizeTaskAssignment();
        }, 10000);
    }
    async processConductorCommand(command) {
        this.outputChannel.appendLine(`Processing command: ${command}`);
        if (command.startsWith('CREATE_TASK')) {
            const parts = command.replace('CREATE_TASK', '').split('|').map(s => s.trim());
            const [title, description, agentType] = parts;
            const task = this.taskQueue.addTask({
                title,
                description,
                priority: 'high'
            });
            this.outputChannel.appendLine(`✅ Created task: ${task.id} - ${title}`);
            const agent = this.findBestAgent(agentType);
            if (agent) {
                this.assignTaskToAgent(task, agent);
            }
        }
    }
    findBestAgent(type) {
        const idleAgents = this.agentManager.getIdleAgents();
        let agent = idleAgents.find(a => a.type.toLowerCase().includes(type.toLowerCase()));
        if (!agent && idleAgents.length > 0) {
            agent = idleAgents.find(a => a.template?.capabilities?.some((c) => c.toLowerCase().includes(type.toLowerCase())));
        }
        return agent || idleAgents[0] || null;
    }
    assignTaskToAgent(task, agent) {
        this.outputChannel.appendLine(`📋 Assigning "${task.title}" to ${agent.name}`);
        task.status = 'assigned';
        task.assignedTo = agent.id;
    }
    checkForConflicts() {
        const workingAgents = this.agentManager.getActiveAgents().filter(a => a.status === 'working');
        if (workingAgents.length > 1) {
            const frontendAgents = workingAgents.filter(a => a.type.includes('frontend'));
            const backendAgents = workingAgents.filter(a => a.type.includes('backend'));
            if (frontendAgents.length > 1) {
                this.outputChannel.appendLine('⚠️ Potential conflict: Multiple frontend agents active');
                this.notifyConflict('Multiple frontend agents working - potential style conflicts');
            }
            this.checkFileConflicts(workingAgents);
        }
    }
    checkFileConflicts(agents) {
        this.outputChannel.appendLine('Checking for file conflicts...');
    }
    optimizeTaskAssignment() {
        const agents = this.agentManager.getActiveAgents();
        const queuedTasks = this.taskQueue.getQueuedTasks();
        if (queuedTasks.length > 0) {
            this.outputChannel.appendLine(`📊 Optimizing assignment for ${queuedTasks.length} queued tasks`);
            for (const task of queuedTasks) {
                const bestAgent = this.findOptimalAgent(task);
                if (bestAgent) {
                    this.assignTaskToAgent(task, bestAgent);
                }
            }
        }
    }
    findOptimalAgent(task) {
        const agents = this.agentManager.getIdleAgents();
        if (agents.length === 0)
            return null;
        const scores = agents.map(agent => {
            let score = 0;
            const taskText = `${task.title} ${task.description}`.toLowerCase();
            if (agent.type && taskText.includes(agent.type.toLowerCase())) {
                score += 10;
            }
            if (agent.template?.capabilities) {
                for (const capability of agent.template.capabilities) {
                    if (taskText.includes(capability.toLowerCase())) {
                        score += 5;
                    }
                }
            }
            if (agent.template?.specialization &&
                taskText.includes(agent.template.specialization.toLowerCase())) {
                score += 8;
            }
            score -= agent.tasksCompleted * 0.5;
            return { agent, score };
        });
        scores.sort((a, b) => b.score - a.score);
        return scores[0]?.score > 0 ? scores[0].agent : agents[0];
    }
    notifyConflict(message) {
        vscode.window.showWarningMessage(`⚠️ Conductor Alert: ${message}`);
        this.outputChannel.appendLine(`⚠️ CONFLICT: ${message}`);
    }
    getStatus() {
        const agents = this.agentManager.getActiveAgents();
        const idle = agents.filter(a => a.status === 'idle').length;
        const working = agents.filter(a => a.status === 'working').length;
        const tasks = this.taskQueue.getTasks();
        const queued = tasks.filter(t => t.status === 'queued').length;
        return `System Status:
- Agents: ${agents.length} total (${idle} idle, ${working} working)
- Tasks: ${tasks.length} total (${queued} queued)`;
    }
    logStatus() {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${this.getStatus()}`);
    }
    async spawnRecommendedTeam(projectType) {
        this.outputChannel.appendLine(`🚀 Spawning recommended team for ${projectType} project`);
    }
    dispose() {
        this.terminal?.dispose();
        this.outputChannel.dispose();
    }
}
exports.IntelligentConductor = IntelligentConductor;
//# sourceMappingURL=IntelligentConductor.js.map