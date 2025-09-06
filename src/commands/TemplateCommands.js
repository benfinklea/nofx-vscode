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
exports.TemplateCommands = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const interfaces_1 = require("../services/interfaces");
const AgentTemplateManager_1 = require("../agents/AgentTemplateManager");
class TemplateCommands {
    constructor(container) {
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.context = container.resolve(interfaces_1.SERVICE_TOKENS.ExtensionContext);
    }
    register() {
        this.commandService.register('nofx.createAgentTemplate', this.createAgentTemplate.bind(this));
        this.commandService.register('nofx.editAgentTemplate', this.editAgentTemplate.bind(this));
        this.commandService.register('nofx.importAgentTemplate', this.importAgentTemplate.bind(this));
        this.commandService.register('nofx.browseAgentTemplates', this.browseAgentTemplates.bind(this));
    }
    async createAgentTemplate() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const name = await this.notificationService.showInputBox({
            prompt: 'Enter template name',
            placeHolder: 'e.g., Python Backend Specialist'
        });
        if (!name) {
            return;
        }
        const id = await this.notificationService.showInputBox({
            prompt: 'Enter template ID (lowercase, hyphens)',
            value: name.toLowerCase().replace(/\s+/g, '-'),
            validateInput: (value) => {
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'ID must contain only lowercase letters, numbers, and hyphens';
                }
                return undefined;
            }
        });
        if (!id) {
            return;
        }
        const icon = await this.notificationService.showInputBox({
            prompt: 'Enter emoji icon',
            value: '🤖'
        });
        if (!icon) {
            return;
        }
        const capabilities = await this.notificationService.showInputBox({
            prompt: 'Enter capabilities (comma-separated)',
            placeHolder: 'e.g., Python, FastAPI, PostgreSQL, Docker'
        });
        if (!capabilities) {
            return;
        }
        const systemPrompt = await this.notificationService.showInputBox({
            prompt: 'Enter system prompt for the agent',
            placeHolder: 'You are a Python backend specialist...'
        });
        if (!systemPrompt) {
            return;
        }
        const template = {
            id,
            name,
            icon,
            description: `${name} - Custom agent template`,
            systemPrompt,
            capabilities: capabilities.split(',').map(c => c.trim()),
            tags: capabilities.split(',').map(c => c.trim()),
            taskPreferences: {
                preferred: [],
                avoid: [],
                priority: 'medium'
            }
        };
        const templateManager = new AgentTemplateManager_1.AgentTemplateManager(workspaceFolder.uri.fsPath);
        await templateManager.saveTemplate(template);
        await this.notificationService.showInformation(`Template "${name}" created successfully`);
    }
    async editAgentTemplate() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const templateManager = new AgentTemplateManager_1.AgentTemplateManager(workspaceFolder.uri.fsPath);
        const templates = await templateManager.getTemplates();
        if (templates.length === 0) {
            await this.notificationService.showInformation('No templates found');
            return;
        }
        const items = templates.map(t => ({
            label: `${t.icon} ${t.name}`,
            description: t.id,
            value: t.id
        }));
        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Select template to edit'
        });
        if (!selected) {
            return;
        }
        const templateId = selected.value;
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            return;
        }
        await templateManager.editTemplate(templateId);
    }
    async importAgentTemplate() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON Files': ['json']
            },
            title: 'Select Template File to Import'
        });
        if (!fileUri || fileUri.length === 0) {
            return;
        }
        try {
            const fileContent = fs.readFileSync(fileUri[0].fsPath, 'utf-8');
            const template = JSON.parse(fileContent);
            if (!template.id || !template.name || !template.systemPrompt) {
                await this.notificationService.showError('Invalid template file: missing required fields');
                return;
            }
            const templateManager = new AgentTemplateManager_1.AgentTemplateManager(workspaceFolder.uri.fsPath);
            await templateManager.saveTemplate(template);
            await this.notificationService.showInformation(`Template "${template.name}" imported successfully`);
        }
        catch (error) {
            await this.notificationService.showError(`Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async browseAgentTemplates() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }
        const templateManager = new AgentTemplateManager_1.AgentTemplateManager(workspaceFolder.uri.fsPath);
        const templates = await templateManager.getTemplates();
        if (templates.length === 0) {
            await this.notificationService.showInformation('No templates found');
            return;
        }
        const items = templates.map(t => ({
            label: `${t.icon} ${t.name}`,
            description: Array.isArray(t.capabilities) ? t.capabilities.slice(0, 3).join(', ') : 'Custom template',
            detail: t.description,
            value: t.id
        }));
        const selected = await this.notificationService.showQuickPick(items, {
            placeHolder: 'Browse available agent templates'
        });
        if (selected) {
            const template = templates.find(t => t.id === selected.value);
            if (template) {
                const actions = await this.notificationService.showInformation(`Template: ${template.name}\n\nCapabilities: ${Array.isArray(template.capabilities) ? template.capabilities.join(', ') : 'None'}`, 'Edit Template', 'Create Agent');
                if (actions === 'Edit Template') {
                    await this.commandService.execute('nofx.editAgentTemplate');
                }
                else if (actions === 'Create Agent') {
                    await this.commandService.execute('nofx.addAgent');
                }
            }
        }
    }
    dispose() {
    }
}
exports.TemplateCommands = TemplateCommands;
//# sourceMappingURL=TemplateCommands.js.map