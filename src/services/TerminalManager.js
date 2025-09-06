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
exports.TerminalManager = void 0;
const vscode = __importStar(require("vscode"));
const EventConstants_1 = require("./EventConstants");
class TerminalManager {
    constructor(configService, loggingService, eventBus, errorHandler) {
        this.configService = configService;
        this.terminals = new Map();
        this.disposables = [];
        this.loggingService = loggingService;
        this.eventBus = eventBus;
        this.errorHandler = errorHandler;
        this._onTerminalClosed = new vscode.EventEmitter();
        this.disposables.push(vscode.window.onDidCloseTerminal((terminal) => {
            for (const [agentId, agentTerminal] of this.terminals.entries()) {
                if (agentTerminal === terminal) {
                    this.terminals.delete(agentId);
                    this._onTerminalClosed.fire(terminal);
                    if (this.eventBus) {
                        this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TERMINAL_CLOSED, { agentId, terminal });
                    }
                    this.loggingService?.debug(`Terminal closed for agent ${agentId}`);
                    break;
                }
            }
        }));
    }
    get onTerminalClosed() {
        return this._onTerminalClosed.event;
    }
    createTerminal(agentId, agentConfig) {
        const terminalIcon = agentConfig.terminalIcon ?? (agentConfig.type === 'conductor' ? 'terminal' : 'robot');
        const terminal = vscode.window.createTerminal({
            name: `${agentConfig.template?.icon || '🤖'} ${agentConfig.name}`,
            iconPath: new vscode.ThemeIcon(terminalIcon),
            env: {
                NOFX_AGENT_ID: agentId,
                NOFX_AGENT_TYPE: agentConfig.type,
                NOFX_AGENT_NAME: agentConfig.name
            }
        });
        this.terminals.set(agentId, terminal);
        if (this.eventBus) {
            this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TERMINAL_CREATED, { agentId, terminal, agentConfig });
        }
        this.loggingService?.debug(`Terminal created for agent ${agentId}`);
        return terminal;
    }
    getTerminal(agentId) {
        return this.terminals.get(agentId);
    }
    disposeTerminal(agentId) {
        const terminal = this.terminals.get(agentId);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(agentId);
            if (this.eventBus) {
                this.eventBus.publish(EventConstants_1.DOMAIN_EVENTS.TERMINAL_DISPOSED, { agentId, terminal });
            }
            this.loggingService?.debug(`Terminal disposed for agent ${agentId}`);
        }
    }
    async initializeAgentTerminal(agent, workingDirectory) {
        const terminal = this.terminals.get(agent.id);
        if (!terminal)
            return;
        if (workingDirectory) {
            terminal.sendText(`cd "${workingDirectory}"`);
        }
        terminal.sendText(`echo "🤖 Initializing ${agent.name} (${agent.type})"`);
        terminal.sendText(`echo "Agent ID: ${agent.id}"`);
        terminal.sendText(`echo "Starting Claude with agent specialization..."`);
        terminal.sendText(`echo ""`);
        const claudePath = this.configService.getClaudePath();
        if (agent.template && agent.template.systemPrompt) {
            this.loggingService?.debug(`Starting ${agent.name} with system prompt`);
            const fullPrompt = agent.template.systemPrompt + '\n\nYou are part of a NofX.dev coding team. Please wait for further instructions. Don\'t do anything yet. Just wait.';
            const quotedPrompt = this.quotePromptForShell(fullPrompt);
            terminal.sendText(`"${claudePath}" --append-system-prompt ${quotedPrompt}`);
        }
        else {
            const basicPrompt = 'You are a general purpose agent, part of a NofX.dev coding team. Please wait for instructions.';
            const quotedPrompt = this.quotePromptForShell(basicPrompt);
            terminal.sendText(`"${claudePath}" --append-system-prompt ${quotedPrompt}`);
        }
        if (this.configService.isShowAgentTerminalOnSpawn()) {
            terminal.show();
        }
    }
    createEphemeralTerminal(name) {
        return vscode.window.createTerminal(name);
    }
    quotePromptForShell(prompt) {
        const platform = process.platform;
        const shell = vscode.env.shell;
        const isWindows = platform === 'win32';
        const isPowerShell = shell?.includes('powershell') || shell?.includes('pwsh');
        const isCmd = shell?.includes('cmd.exe');
        if (isWindows) {
            if (isPowerShell) {
                const escaped = prompt.replace(/"/g, '""');
                return `"${escaped}"`;
            }
            else if (isCmd) {
                const escaped = prompt.replace(/"/g, '\\"');
                return `"${escaped}"`;
            }
            else {
                const escaped = prompt.replace(/"/g, '\\"');
                return `"${escaped}"`;
            }
        }
        else {
            const escaped = prompt.replace(/'/g, "'\\''");
            return `'${escaped}'`;
        }
    }
    dispose() {
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        this.terminals.clear();
        this._onTerminalClosed.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.TerminalManager = TerminalManager;
//# sourceMappingURL=TerminalManager.js.map