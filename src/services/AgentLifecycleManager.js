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
exports.AgentLifecycleManager = void 0;
const vscode = __importStar(require("vscode"));
const EventConstants_1 = require("./EventConstants");
class AgentLifecycleManager {
    constructor(terminalManager, worktreeService, configService, notificationService, onAgentUpdate, loggingService, eventBus, errorHandler) {
        this.terminalManager = terminalManager;
        this.worktreeService = worktreeService;
        this.configService = configService;
        this.notificationService = notificationService;
        this.onAgentUpdate = onAgentUpdate;
        this.outputChannels = new Map();
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
    }
    async initialize() {
        await this.worktreeService.cleanupOrphaned();
    }
    async spawnAgent(config, restoredId) {
        const agentId = restoredId || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const iconMap = {
            'frontend': 'symbol-color',
            'backend': 'server',
            'fullstack': 'layers',
            'mobile': 'device-mobile',
            'database': 'database',
            'devops': 'cloud',
            'testing': 'beaker',
            'ai': 'hubot',
            'general': 'person'
        };
        const terminalIcon = iconMap[config.type] || 'person';
        const terminal = this.terminalManager.createTerminal(agentId, {
            ...config,
            terminalIcon
        });
        const outputChannel = this.loggingService?.getChannel(`Agent: ${config.name}`) ||
            vscode.window.createOutputChannel(`n of x: ${config.name}`);
        const agent = {
            id: agentId,
            name: config.name,
            type: config.type,
            status: 'idle',
            terminal: terminal,
            currentTask: null,
            startTime: new Date(),
            tasksCompleted: 0,
            template: config.template
        };
        this.loggingService?.debug(`Created agent ${agentId} with status: ${agent.status}`);
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNING, { agentId, config });
        }
        this.outputChannels.set(agentId, outputChannel);
        let workingDirectory;
        if (this.worktreeService.isAvailable()) {
            workingDirectory = await this.errorHandler?.handleAsync(async () => {
                const result = await this.worktreeService.createForAgent(agent);
                if (result) {
                    this.loggingService?.debug(`Created worktree for ${agent.name} at ${result}`);
                }
                return result;
            }, `Failed to create worktree for ${agent.name}`) || undefined;
        }
        await this.errorHandler?.handleAsync(async () => {
            await this.terminalManager.initializeAgentTerminal(agent, workingDirectory);
        }, 'Error initializing agent terminal');
        outputChannel.appendLine(`✅ Agent ${config.name} (${config.type}) initialized`);
        outputChannel.appendLine(`ID: ${agentId}`);
        outputChannel.appendLine(`Status: ${agent.status}`);
        outputChannel.appendLine(`Ready to receive tasks...`);
        this.loggingService?.info(`Agent ${config.name} ready.`);
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_LIFECYCLE_SPAWNED, { agentId, agent });
        }
        return agent;
    }
    async removeAgent(agentId) {
        this.loggingService?.debug(`Removing agent ${agentId}`);
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVING, { agentId });
        }
        const worktreeRemoved = await this.worktreeService.removeForAgent(agentId);
        if (!worktreeRemoved) {
            return false;
        }
        this.terminalManager.disposeTerminal(agentId);
        const outputChannel = this.outputChannels.get(agentId);
        if (outputChannel) {
            if (!this.loggingService) {
                outputChannel.dispose();
            }
            this.outputChannels.delete(agentId);
        }
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.AGENT_LIFECYCLE_REMOVED, { agentId });
        }
        this.loggingService?.info(`Agent ${agentId} removed successfully`);
        this.notificationService.showInformation(`Agent removed successfully`);
        return true;
    }
    dispose() {
        for (const outputChannel of this.outputChannels.values()) {
            if (!this.loggingService) {
                outputChannel.dispose();
            }
        }
        this.outputChannels.clear();
    }
}
exports.AgentLifecycleManager = AgentLifecycleManager;
//# sourceMappingURL=AgentLifecycleManager.js.map