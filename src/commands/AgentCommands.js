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
exports.AgentCommands = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("../services/interfaces");
class AgentCommands {
    constructor(container) {
        this.agentManager = container.resolve(interfaces_1.SERVICE_TOKENS.AgentManager);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.context = container.resolve(interfaces_1.SERVICE_TOKENS.ExtensionContext);
    }
    register() {
        this.commandService.register('nofx.addAgent', this.addAgent.bind(this));
        this.commandService.register('nofx.deleteAgent', this.deleteAgent.bind(this));
        this.commandService.register('nofx.editAgent', this.editAgent.bind(this));
        this.commandService.register('nofx.focusAgentTerminal', this.focusAgentTerminal.bind(this));
        this.commandService.register('nofx.restoreAgents', this.restoreAgents.bind(this));
    }
    async addAgent() {
        const addType = await this.notificationService.showQuickPick([
            {
                label: '$(person) Individual Agent',
                description: 'Add a single agent with specific capabilities',
                value: 'individual'
            },
            {
                label: '$(organization) Team Preset',
                description: 'Add a pre-configured team of agents',
                value: 'team'
            }
        ], {
            placeHolder: 'How would you like to add agents?'
        });
        if (!addType) {
            return;
        }
        const teamValue = addType.value;
        if (teamValue === 'team') {
            await this.addTeamPreset();
        }
        else {
            await this.addIndividualAgent();
        }
    }
    async addIndividualAgent() {
        const { AgentTemplateManager } = await Promise.resolve().then(() => __importStar(require('../agents/AgentTemplateManager')));
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        const templates = await templateManager.getTemplates();
        const items = templates.map(template => ({
            label: `${template.icon} ${template.name}`,
            description: Array.isArray(template.capabilities) ? template.capabilities.slice(0, 3).join(', ') : 'Custom agent',
            value: template.id
        }));
        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select an agent template'
        });
        if (!selected) {
            return;
        }
        const templateId = selected.value;
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            return;
        }
        const agentName = await this.notificationService.showInputBox({
            prompt: 'Enter agent name',
            value: template.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Agent name is required';
                }
                return undefined;
            }
        });
        if (!agentName) {
            return;
        }
        const agent = await this.agentManager.spawnAgent({
            name: agentName,
            type: template?.id ?? 'general',
            template
        });
        await this.notificationService.showInformation(`Agent "${agentName}" created successfully`);
    }
    async addTeamPreset() {
        const presets = [
            {
                label: '$(rocket) Full-Stack Development Team',
                description: 'Frontend, Backend, Database, and DevOps specialists',
                value: {
                    agents: ['frontend-specialist', 'backend-specialist', 'database-architect', 'devops-engineer'],
                    label: '$(rocket) Full-Stack Development Team'
                }
            },
            {
                label: '$(beaker) Testing & Quality Team',
                description: 'Test Engineer, Security Expert, and Performance Specialist',
                value: {
                    agents: ['testing-specialist', 'security-expert', 'backend-specialist'],
                    label: '$(beaker) Testing & Quality Team'
                }
            },
            {
                label: '$(device-mobile) Mobile Development Team',
                description: 'iOS, Android, and Backend API developers',
                value: {
                    agents: ['mobile-developer', 'backend-specialist', 'testing-specialist'],
                    label: '$(device-mobile) Mobile Development Team'
                }
            },
            {
                label: '$(circuit-board) AI/ML Team',
                description: 'ML Engineer, Data Scientist, and Backend Developer',
                value: {
                    agents: ['ai-ml-specialist', 'backend-specialist', 'database-architect'],
                    label: '$(circuit-board) AI/ML Team'
                }
            },
            {
                label: '$(dashboard) Startup MVP Team',
                description: 'Fullstack Developer and DevOps for rapid prototyping',
                value: {
                    agents: ['fullstack-developer', 'devops-engineer'],
                    label: '$(dashboard) Startup MVP Team'
                }
            }
        ];
        const selected = await this.notificationService.showQuickPick(presets, {
            placeHolder: 'Select a team preset'
        });
        if (!selected) {
            return;
        }
        const { AgentTemplateManager } = await Promise.resolve().then(() => __importStar(require('../agents/AgentTemplateManager')));
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        const preset = selected.value;
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
                }
            }
        }
        const message = createdCount === teamAgents.length
            ? `Team "${preset.label}" created with ${createdCount} agents`
            : `Team "${preset.label}" created with ${createdCount} of ${teamAgents.length} agents (${teamAgents.length - createdCount} failed)`;
        await this.notificationService.showInformation(message);
        await this.commandService.execute('nofx.openConductorTerminal');
    }
    async deleteAgent(agentId) {
        if (!agentId) {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                await this.notificationService.showInformation('No agents to delete');
                return;
            }
            const items = agents.map(a => ({
                label: `${a.name} (${a.status})`,
                description: a.type,
                value: a.id
            }));
            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select agent to delete'
            });
            if (!selected) {
                return;
            }
            agentId = selected.value;
        }
        const confirmed = await this.notificationService.confirmDestructive(`Delete agent? This will terminate their terminal.`, 'Delete');
        if (confirmed) {
            await this.agentManager.removeAgent(agentId);
            await this.notificationService.showInformation('Agent deleted');
        }
    }
    async editAgent(agentId) {
        if (!agentId) {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                await this.notificationService.showInformation('No agents to edit');
                return;
            }
            const items = agents.map(a => ({
                label: a.name,
                description: a.type,
                value: a.id
            }));
            const selected = await this.notificationService.showQuickPick(items, {
                placeHolder: 'Select agent to edit'
            });
            if (!selected) {
                return;
            }
            agentId = selected.value;
        }
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            await this.notificationService.showError('Agent not found');
            return;
        }
        const options = [
            { label: 'Change Name', value: 'name' },
            { label: 'Change Role', value: 'role' },
            { label: 'Update Capabilities', value: 'capabilities' }
        ];
        const action = await this.notificationService.showQuickPick(options, {
            placeHolder: 'What would you like to edit?'
        });
        if (!action) {
            return;
        }
        const actionValue = action.value;
        switch (actionValue) {
            case 'name':
                const newName = await this.notificationService.showInputBox({
                    prompt: 'Enter new name',
                    value: agent.name
                });
                if (newName) {
                    this.agentManager.renameAgent(agent.id, newName);
                }
                break;
            case 'role':
                const newRole = await this.notificationService.showInputBox({
                    prompt: 'Enter new role',
                    value: agent.type
                });
                if (newRole) {
                    this.agentManager.updateAgentType(agent.id, newRole);
                }
                break;
            case 'capabilities':
                const currentCaps = (agent.template?.capabilities ?? []).join(', ');
                const newCaps = await this.notificationService.showInputBox({
                    prompt: 'Enter capabilities (comma-separated)',
                    value: currentCaps
                });
                if (newCaps) {
                    await this.notificationService.showWarning('Capabilities are defined by the agent template and cannot be directly edited.');
                }
                break;
        }
    }
    async focusAgentTerminal(agentId) {
        if (!agentId) {
            const agents = this.agentManager.getActiveAgents();
            if (agents.length === 0) {
                await this.notificationService.showInformation('No active agents');
                return;
            }
            if (agents.length === 1) {
                agentId = agents[0].id;
            }
            else {
                const items = agents.map(a => ({
                    label: a.name,
                    description: a.status,
                    value: a.id
                }));
                const selected = await this.notificationService.showQuickPick(items, {
                    placeHolder: 'Select agent terminal to focus'
                });
                if (!selected) {
                    return;
                }
                agentId = selected.value;
            }
        }
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            await this.notificationService.showError('Agent not found');
            return;
        }
        if (agent.terminal) {
            agent.terminal.show();
        }
        else {
            await this.notificationService.showWarning('Agent terminal not available');
        }
    }
    async restoreAgents() {
        const restoredCount = await this.agentManager.restoreAgents();
        await this.notificationService.showInformation(restoredCount > 0 ? `Restored ${restoredCount} agents` : 'No agents to restore');
    }
    dispose() {
    }
}
exports.AgentCommands = AgentCommands;
//# sourceMappingURL=AgentCommands.js.map