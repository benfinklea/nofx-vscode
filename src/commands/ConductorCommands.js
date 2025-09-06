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
exports.ConductorCommands = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("../services/interfaces");
const ConductorChatWebview_1 = require("../conductor/ConductorChatWebview");
const ConductorTerminal_1 = require("../conductor/ConductorTerminal");
const IntelligentConductor_1 = require("../conductor/IntelligentConductor");
const SuperSmartConductor_1 = require("../conductor/SuperSmartConductor");
const AgentTemplateManager_1 = require("../agents/AgentTemplateManager");
const ConductorPanel_1 = require("../panels/ConductorPanel");
class ConductorCommands {
    constructor(container) {
        this.currentTeamName = 'Active Agents';
        this.agentManager = container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager);
        this.taskQueue = container.resolve(interfaces_1.SERVICE_TOKENS.TaskQueue);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.loggingService = container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService);
        this.context = container.resolve(interfaces_1.SERVICE_TOKENS.ExtensionContext);
        this.container = container;
    }
    setAgentProvider(provider) {
        this.agentProvider = provider;
    }
    register() {
        this.commandService.register('nofx.startConductor', this.startConductor.bind(this));
        this.commandService.register('nofx.quickStartChat', this.quickStartChat.bind(this));
        this.commandService.register('nofx.openConductorChat', this.openConductorChat.bind(this));
        this.commandService.register('nofx.openConductorTerminal', this.openConductorTerminal.bind(this));
        this.commandService.register('nofx.openSimpleConductor', this.openConductorChat.bind(this));
        this.commandService.register('nofx.openConductorPanel', this.openConductorPanel.bind(this));
    }
    async startConductor() {
        const presets = [
            {
                label: '$(rocket) Full-Stack Development Team',
                description: 'Frontend, Backend, Database, and DevOps specialists',
                value: {
                    value: 'fullstack',
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                }
            },
            {
                label: '$(beaker) Testing & Quality Team',
                description: 'Test Engineer, Security Expert, and Performance Specialist',
                value: {
                    value: 'testing',
                    agents: ['testing-specialist', 'security-expert', 'backend-specialist']
                }
            },
            {
                label: '$(device-mobile) Mobile Development Team',
                description: 'iOS, Android, and Backend API developers',
                value: {
                    value: 'mobile',
                    agents: ['mobile-developer', 'backend-specialist', 'testing-specialist']
                }
            },
            {
                label: '$(circuit-board) AI/ML Team',
                description: 'ML Engineer, Data Scientist, and Backend Developer',
                value: {
                    value: 'ai-ml',
                    agents: ['ai-ml-specialist', 'backend-specialist', 'database-architect']
                }
            },
            {
                label: '$(dashboard) Startup MVP Team',
                description: 'Fullstack Developer and DevOps for rapid prototyping',
                value: {
                    value: 'startup',
                    agents: ['fullstack-developer', 'devops-engineer']
                }
            },
            {
                label: '$(person) Custom Team',
                description: 'Select your own combination of agents',
                value: {
                    value: 'custom',
                    agents: []
                }
            }
        ];
        const selected = await this.notificationService.showQuickPick(presets, {
            placeHolder: 'Select a team configuration'
        });
        if (!selected) {
            return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const preset = selected.value;
        this.currentTeamName = selected.label.replace(/\$\([^)]*\)\s*/g, '');
        if (this.agentProvider && typeof this.agentProvider.setTeamName === 'function') {
            this.agentProvider.setTeamName(this.currentTeamName);
        }
        if (preset.value === 'custom') {
            await this.commandService.execute('nofx.addAgent');
        }
        else {
            const templateManager = new AgentTemplateManager_1.AgentTemplateManager(workspaceFolder.uri.fsPath);
            const teamAgents = preset.agents;
            let createdCount = 0;
            for (const templateId of teamAgents) {
                const template = await templateManager.getTemplate(templateId);
                if (template) {
                    try {
                        await this.agentManager.spawnAgent({
                            name: template.name,
                            type: template.id ?? 'general',
                            template
                        });
                        createdCount++;
                    }
                    catch (error) {
                        this.loggingService?.error(`Failed to create agent from template ${templateId}:`, error);
                    }
                }
            }
            const message = createdCount === teamAgents.length
                ? `Team "${this.currentTeamName}" created with ${createdCount} agents`
                : `Team "${this.currentTeamName}" created with ${createdCount} of ${teamAgents.length} agents (${teamAgents.length - createdCount} failed)`;
            await this.notificationService.showInformation(message);
        }
        await this.openConductorTerminal();
    }
    async quickStartChat() {
        const projectTypes = [
            {
                label: '$(globe) Web Application',
                description: 'React, Vue, Angular, or vanilla JS',
                value: {
                    value: 'web',
                    teamPreset: 'frontend',
                    teamName: 'Frontend Team',
                    agents: ['frontend-specialist', 'testing-specialist']
                }
            },
            {
                label: '$(server) Backend API',
                description: 'Node.js, Python, Java, or Go',
                value: {
                    value: 'backend',
                    teamPreset: 'backend',
                    teamName: 'Backend Team',
                    agents: ['backend-specialist', 'database-architect']
                }
            },
            {
                label: '$(device-mobile) Mobile App',
                description: 'React Native, Flutter, or native',
                value: {
                    value: 'mobile',
                    teamPreset: 'mobile',
                    teamName: 'Mobile Team',
                    agents: ['mobile-developer', 'backend-specialist', 'testing-specialist']
                }
            },
            {
                label: '$(package) Full-Stack Application',
                description: 'Complete frontend and backend',
                value: {
                    value: 'fullstack',
                    teamPreset: 'fullstack',
                    teamName: 'Full-Stack Team',
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer']
                }
            },
            {
                label: '$(library) Library/Package',
                description: 'Reusable component or module',
                value: {
                    value: 'library',
                    teamPreset: 'library',
                    teamName: 'Library Team',
                    agents: ['fullstack-developer', 'testing-specialist']
                }
            }
        ];
        const projectType = await this.notificationService.showQuickPick(projectTypes, {
            placeHolder: 'What type of project are you working on?'
        });
        if (!projectType) {
            return;
        }
        const projectConfig = projectType.value;
        this.currentTeamName = projectConfig.teamName;
        if (this.agentProvider && typeof this.agentProvider.setTeamName === 'function') {
            this.agentProvider.setTeamName(this.currentTeamName);
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const templateManager = new AgentTemplateManager_1.AgentTemplateManager(workspaceFolder.uri.fsPath);
        let createdCount = 0;
        for (const templateId of projectConfig.agents) {
            const template = await templateManager.getTemplate(templateId);
            if (template) {
                try {
                    await this.agentManager.spawnAgent({
                        name: template.name,
                        type: template.id ?? 'general',
                        template
                    });
                    createdCount++;
                }
                catch (error) {
                    this.loggingService?.error(`Failed to create agent from template ${templateId}:`, error);
                }
            }
        }
        await this.openConductorTerminal();
        const assemblyMessage = createdCount === projectConfig.agents.length
            ? `${projectConfig.teamName} assembled (${createdCount} agents)! Conductor terminal is ready.`
            : `${projectConfig.teamName} partially assembled (${createdCount} of ${projectConfig.agents.length} agents)! Conductor terminal is ready.`;
        await this.notificationService.showInformation(assemblyMessage);
    }
    async openConductorChat() {
        if (!this.conductorWebview) {
            const loggingService = this.container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService);
            const notificationService = this.container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
            this.conductorWebview = new ConductorChatWebview_1.ConductorChatWebview(this.context, this.agentManager, this.taskQueue, loggingService, notificationService);
        }
        await this.conductorWebview.show();
    }
    async openConductorTerminal() {
        const activeAgents = this.agentManager.getActiveAgents();
        const agentCount = activeAgents.length;
        if (agentCount === 0) {
            await this.notificationService.showWarning('No agents available. Please add agents first.');
            return;
        }
        let conductorType = 'basic';
        if (agentCount >= 5) {
            conductorType = 'supersmart';
        }
        else if (agentCount >= 3) {
            conductorType = 'intelligent';
        }
        else {
            conductorType = 'basic';
        }
        this.conductorTerminal = this.createConductor(conductorType);
        await this.conductorTerminal?.start();
        await this.notificationService.showInformation(`${this.currentTeamName} conductor started (${conductorType} mode)`);
    }
    createConductor(type) {
        switch (type) {
            case 'supersmart':
                return new SuperSmartConductor_1.SuperSmartConductor(this.agentManager, this.taskQueue);
            case 'intelligent':
                return new IntelligentConductor_1.IntelligentConductor(this.agentManager, this.taskQueue);
            default:
                return new ConductorTerminal_1.ConductorTerminal(this.agentManager, this.taskQueue);
        }
    }
    async openConductorPanel() {
        try {
            const viewModel = this.container.resolve(interfaces_1.SERVICE_TOKENS.ConductorViewModel);
            const loggingService = this.container.resolve(interfaces_1.SERVICE_TOKENS.LoggingService);
            ConductorPanel_1.ConductorPanel.createOrShow(this.context, viewModel, loggingService);
            await this.notificationService.showInformation('Conductor Panel opened');
        }
        catch (error) {
            this.notificationService.showError('Failed to open Conductor Panel');
        }
    }
    dispose() {
        this.conductorChat?.dispose();
        this.conductorWebview = undefined;
        this.conductorTerminal = undefined;
    }
}
exports.ConductorCommands = ConductorCommands;
//# sourceMappingURL=ConductorCommands.js.map