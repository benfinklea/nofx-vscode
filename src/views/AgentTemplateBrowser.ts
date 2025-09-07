import * as vscode from 'vscode';
import { AgentTemplate, AgentTemplateManager } from '../agents/AgentTemplateManager';

export class AgentTemplateBrowser {
    constructor(
        private templateManager: AgentTemplateManager,
        private agentManager: any
    ) {}

    async showTemplateBrowser() {
        const templates = this.templateManager.getTemplates();

        const items = templates.map(template => ({
            label: `${template.icon} ${template.name}`,
            description: template.description,
            detail: `Tags: ${template.tags.join(', ')} | Languages: ${template.capabilities.languages.join(', ')}`,
            template
        }));

        // Add special items
        items.unshift(
            {
                label: '$(add) Create New Template',
                description: 'Design a custom agent template',
                detail: 'Open the template editor to create a new agent type',
                template: null as any
            },
            {
                label: '$(cloud-download) Import Template',
                description: 'Import a template from file',
                detail: 'Load a template from a JSON file',
                template: null as any
            },
            {
                label: '$(globe) Browse Community Templates',
                description: 'Find templates shared by the community',
                detail: 'Coming soon - Share and discover agent templates',
                template: null as any
            }
        );

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an agent template or create a new one',
            title: '🤖 Agent Template Library',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) return;

        if (selected.label.includes('Create New')) {
            vscode.commands.executeCommand('nofx.createAgentTemplate');
        } else if (selected.label.includes('Import')) {
            vscode.commands.executeCommand('nofx.importAgentTemplate');
        } else if (selected.label.includes('Community')) {
            vscode.window.showInformationMessage('Community templates coming soon!');
        } else if (selected.template) {
            await this.showTemplateActions(selected.template);
        }
    }

    private async showTemplateActions(template: AgentTemplate) {
        const actions = [
            {
                label: '$(play) Spawn Agent',
                description: 'Create an agent with this template',
                action: 'spawn'
            },
            {
                label: '$(edit) Edit Template',
                description: 'Modify this template',
                action: 'edit'
            },
            {
                label: '$(copy) Duplicate Template',
                description: 'Create a copy of this template',
                action: 'duplicate'
            },
            {
                label: '$(export) Export Template',
                description: 'Save template to file',
                action: 'export'
            },
            {
                label: '$(eye) View Details',
                description: 'See full template configuration',
                action: 'view'
            }
        ];

        const selected = await vscode.window.showQuickPick(actions, {
            placeHolder: `Actions for ${template.name}`,
            title: `${template.icon} ${template.name}`
        });

        if (!selected) return;

        switch (selected.action) {
            case 'spawn':
                await this.spawnAgentFromTemplate(template);
                break;
            case 'edit':
                await this.templateManager.editTemplate(template.id);
                break;
            case 'duplicate':
                await this.duplicateTemplate(template);
                break;
            case 'export':
                await this.templateManager.exportTemplate(template.id);
                break;
            case 'view':
                await this.viewTemplateDetails(template);
                break;
        }
    }

    private async spawnAgentFromTemplate(template: AgentTemplate) {
        const name = await vscode.window.showInputBox({
            prompt: 'Agent name',
            value: `${template.name}-${Date.now().toString(36).slice(-4)}`,
            placeHolder: 'Enter a unique name for this agent'
        });

        if (!name) return;

        await this.agentManager.spawnAgent({
            name,
            type: template.id,
            template
        });

        vscode.window.showInformationMessage(`✅ Spawned ${template.icon} ${name}`, 'View Agent').then(selection => {
            if (selection === 'View Agent') {
                vscode.commands.executeCommand('nofx.agents.focus');
            }
        });
    }

    private async duplicateTemplate(template: AgentTemplate) {
        const newName = await vscode.window.showInputBox({
            prompt: 'New template name',
            value: `${template.name} Copy`,
            placeHolder: 'Enter a name for the duplicated template'
        });

        if (!newName) return;

        const success = await this.templateManager.duplicateTemplate(template.id, newName);
        if (success) {
            vscode.window.showInformationMessage(`✅ Template duplicated as "${newName}"`, 'Edit').then(selection => {
                if (selection === 'Edit') {
                    const newId = newName.toLowerCase().replace(/\s+/g, '-');
                    this.templateManager.editTemplate(`custom-${newId}`);
                }
            });
        }
    }

    private async viewTemplateDetails(template: AgentTemplate) {
        const content = `# ${template.icon} ${template.name}

## Description
${template.description}

## Tags
${template.tags.map(t => `\`${t}\``).join(', ')}

## Capabilities

### Languages
${template.capabilities.languages.map(l => `- ${l}`).join('\n')}

### Frameworks
${template.capabilities.frameworks.map(f => `- ${f}`).join('\n')}

### Tools
${template.capabilities.tools.map(t => `- ${t}`).join('\n')}

### Testing
${template.capabilities.testing.map(t => `- ${t}`).join('\n')}

### Specialties
${template.capabilities.specialties.map(s => `- ${s}`).join('\n')}

## Task Preferences

**Preferred:** ${template.taskPreferences.preferred.join(', ')}
**Avoid:** ${template.taskPreferences.avoid.join(', ')}
**Priority:** ${template.taskPreferences.priority}

## System Prompt
\`\`\`
${template.systemPrompt}
\`\`\`

${
    template.filePatterns
        ? `## File Patterns
**Watch:** ${template.filePatterns.watch.join(', ')}
**Ignore:** ${template.filePatterns.ignore.join(', ')}`
        : ''
}

${
    template.commands
        ? `## Commands
\`\`\`json
${JSON.stringify(template.commands, null, 2)}
\`\`\``
        : ''
}

---
*Template ID: ${template.id}*
${template.version ? `*Version: ${template.version}*` : ''}
${template.author ? `*Author: ${template.author}*` : ''}`;

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });
    }
}
