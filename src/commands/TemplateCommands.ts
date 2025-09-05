import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    IConfigurationService,
    SERVICE_TOKENS
} from '../services/interfaces';
import { PickItem } from '../types/ui';
import { AgentTemplateManager } from '../agents/AgentTemplateManager';
// Note: AgentTemplateBrowser and AgentTemplateEditor are deprecated/not implemented
// Template editing is currently done via direct JSON file manipulation

// Temporary type definition until proper types are available
interface AgentTemplate {
    id: string;
    name: string;
    icon: string;
    systemPrompt: string;
    capabilities: any;
    tags: string[];
    description: string;
    taskPreferences: {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
    };
}

export class TemplateCommands implements ICommandHandler {
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly configService: IConfigurationService;
    private readonly context: vscode.ExtensionContext;

    constructor(container: IContainer) {
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService);
        this.context = container.resolve<vscode.ExtensionContext>(SERVICE_TOKENS.ExtensionContext);
    }

    register(): void {
        this.commandService.register('nofx.createAgentTemplate', this.createAgentTemplate.bind(this));
        this.commandService.register('nofx.editAgentTemplate', this.editAgentTemplate.bind(this));
        this.commandService.register('nofx.importAgentTemplate', this.importAgentTemplate.bind(this));
        this.commandService.register('nofx.browseAgentTemplates', this.browseAgentTemplates.bind(this));
    }

    private async createAgentTemplate(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        // Get template details from user
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
            validateInput: (value: string): string | undefined => {
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

        // Create the template
        const template: AgentTemplate = {
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
                priority: 'medium' as const
            }
        };

        // Save the template
        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        await templateManager.saveTemplate(template);

        await this.notificationService.showInformation(`Template "${name}" created successfully`);
    }

    private async editAgentTemplate(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        const templates = await templateManager.getTemplates();

        if (templates.length === 0) {
            await this.notificationService.showInformation('No templates found');
            return;
        }

        const items: PickItem<string>[] = templates.map(t => ({
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

        // Use AgentTemplateManager's built-in edit functionality
        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        await templateManager.editTemplate(templateId);
    }

    private async importAgentTemplate(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        // Let user select a JSON file
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
            const template = JSON.parse(fileContent) as AgentTemplate;

            // Validate template structure
            if (!template.id || !template.name || !template.systemPrompt) {
                await this.notificationService.showError('Invalid template file: missing required fields');
                return;
            }

            // Save the template
            const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
            await templateManager.saveTemplate(template);

            await this.notificationService.showInformation(`Template "${template.name}" imported successfully`);
        } catch (error) {
            await this.notificationService.showError(
                `Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async browseAgentTemplates(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            await this.notificationService.showError('No workspace folder open');
            return;
        }

        // Template browser is deprecated - show available templates via quick pick instead
        const templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        const templates = await templateManager.getTemplates();

        if (templates.length === 0) {
            await this.notificationService.showInformation('No templates found');
            return;
        }

        const items: PickItem<string>[] = templates.map(t => ({
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
                const actions = await this.notificationService.showInformation(
                    `Template: ${template.name}\n\nCapabilities: ${Array.isArray(template.capabilities) ? template.capabilities.join(', ') : 'None'}`,
                    'Edit Template', 'Create Agent'
                );
                
                if (actions === 'Edit Template') {
                    await this.commandService.execute('nofx.editAgentTemplate');
                } else if (actions === 'Create Agent') {
                    await this.commandService.execute('nofx.addAgent');
                }
            }
        }
    }

    dispose(): void {
        // Disposal handled by CommandService
    }
}