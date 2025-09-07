import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Container } from '../services/Container';
import { SERVICE_TOKENS } from '../services/interfaces';
import type { AgentManager } from './AgentManager';

export interface AgentTemplate {
    id: string;
    name: string;
    icon: string;
    color?: string;
    description: string;
    types?: string[]; // New field for type matching
    tags: string[];
    capabilities: {
        languages: string[];
        frameworks: string[];
        tools: string[];
        testing: string[];
        specialties: string[];
    };
    systemPrompt: string;
    taskPreferences: {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
    };
    filePatterns?: {
        watch: string[];
        ignore: string[];
    };
    commands?: Record<string, string>;
    snippets?: Record<string, string>;
    version?: string;
    author?: string;
}

export class AgentTemplateManager {
    private builtInTemplatesDir: string;
    private templatesDir: string;
    private customTemplatesDir: string;
    private templates: Map<string, AgentTemplate> = new Map();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private _onTemplateChange = new vscode.EventEmitter<void>();
    public readonly onTemplateChange = this._onTemplateChange.event;

    constructor(workspaceRoot: string) {
        // Built-in templates packaged with the extension
        this.builtInTemplatesDir = path.join(__dirname, 'templates');

        // Runtime templates directory (for user customization)
        this.templatesDir = path.join(workspaceRoot, '.nofx', 'templates');
        this.customTemplatesDir = path.join(this.templatesDir, 'custom');

        this.ensureDirectories();
        this.loadTemplates();
        this.watchTemplates();
    }

    private ensureDirectories() {
        // Create runtime directories for user customization
        if (!fs.existsSync(this.templatesDir)) {
            fs.mkdirSync(this.templatesDir, { recursive: true });
            // No need to create default templates - we have built-in ones
        }
        if (!fs.existsSync(this.customTemplatesDir)) {
            fs.mkdirSync(this.customTemplatesDir, { recursive: true });
        }
    }

    private createDefaultTemplates() {
        const defaults = this.getDefaultTemplates();
        for (const template of defaults) {
            const filePath = path.join(this.templatesDir, `${template.id}.json`);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
            }
        }
    }

    private getDefaultTemplates(): AgentTemplate[] {
        return [
            {
                id: 'backend-specialist',
                name: 'Backend Specialist',
                icon: '⚙️',
                color: '#68A063',
                description: 'Expert in Node.js, APIs, and database design',
                tags: ['backend', 'api', 'database', 'nodejs'],
                capabilities: {
                    languages: ['typescript', 'javascript', 'python', 'go'],
                    frameworks: ['express', 'fastify', 'nestjs', 'django'],
                    tools: ['docker', 'kubernetes', 'redis', 'rabbitmq'],
                    testing: ['jest', 'mocha', 'supertest'],
                    specialties: ['api-design', 'database-optimization', 'microservices', 'authentication']
                },
                systemPrompt: 'You are a Backend Development Specialist...',
                taskPreferences: {
                    preferred: ['api', 'database', 'authentication', 'integration'],
                    avoid: ['ui', 'styling', 'animations'],
                    priority: 'high'
                }
            },
            {
                id: 'fullstack-developer',
                name: 'Full-Stack Developer',
                icon: '🚀',
                color: '#FF6B6B',
                description: 'Versatile developer for end-to-end features',
                tags: ['fullstack', 'frontend', 'backend'],
                capabilities: {
                    languages: ['typescript', 'javascript', 'python'],
                    frameworks: ['react', 'express', 'next.js'],
                    tools: ['git', 'docker', 'vscode'],
                    testing: ['jest', 'cypress'],
                    specialties: ['full-features', 'prototyping', 'integration']
                },
                systemPrompt: 'You are a Full-Stack Developer...',
                taskPreferences: {
                    preferred: ['feature', 'integration', 'prototype'],
                    avoid: [],
                    priority: 'medium'
                }
            },
            {
                id: 'devops-engineer',
                name: 'DevOps Engineer',
                icon: '🔧',
                color: '#FF9500',
                description: 'Infrastructure, CI/CD, and deployment expert',
                tags: ['devops', 'infrastructure', 'ci/cd', 'cloud'],
                capabilities: {
                    languages: ['bash', 'python', 'yaml', 'terraform'],
                    frameworks: ['kubernetes', 'docker', 'ansible'],
                    tools: ['github-actions', 'jenkins', 'aws', 'gcp'],
                    testing: ['integration', 'load-testing'],
                    specialties: ['deployment', 'monitoring', 'scaling', 'security']
                },
                systemPrompt: 'You are a DevOps Engineer...',
                taskPreferences: {
                    preferred: ['deployment', 'ci/cd', 'infrastructure', 'monitoring'],
                    avoid: ['ui', 'business-logic'],
                    priority: 'high'
                }
            }
        ];
    }

    private loadTemplates() {
        this.templates.clear();

        // First, load built-in templates from the extension
        if (fs.existsSync(this.builtInTemplatesDir)) {
            const builtInFiles = fs.readdirSync(this.builtInTemplatesDir).filter(file => file.endsWith('.json'));

            for (const file of builtInFiles) {
                try {
                    const content = fs.readFileSync(path.join(this.builtInTemplatesDir, file), 'utf-8');
                    const template = JSON.parse(content) as AgentTemplate;
                    this.templates.set(template.id, template);
                } catch (error) {
                    console.error(`Failed to load built-in template ${file}:`, error);
                }
            }
        }

        // Then load user templates from .nofx/templates (these can override built-in)
        if (fs.existsSync(this.templatesDir)) {
            const templateFiles = fs.readdirSync(this.templatesDir).filter(file => file.endsWith('.json'));

            for (const file of templateFiles) {
                try {
                    const content = fs.readFileSync(path.join(this.templatesDir, file), 'utf-8');
                    const template = JSON.parse(content) as AgentTemplate;
                    // User templates override built-in templates with same ID
                    this.templates.set(template.id, template);
                } catch (error) {
                    console.error(`Failed to load user template ${file}:`, error);
                }
            }
        }

        // Finally, load custom templates (with custom- prefix)
        if (fs.existsSync(this.customTemplatesDir)) {
            const customFiles = fs.readdirSync(this.customTemplatesDir).filter(file => file.endsWith('.json'));

            for (const file of customFiles) {
                try {
                    const content = fs.readFileSync(path.join(this.customTemplatesDir, file), 'utf-8');
                    const template = JSON.parse(content) as AgentTemplate;
                    template.id = `custom-${template.id}`;
                    this.templates.set(template.id, template);
                } catch (error) {
                    console.error(`Failed to load custom template ${file}:`, error);
                }
            }
        }

        console.log(`[NofX] Loaded ${this.templates.size} agent templates`);
    }

    private watchTemplates() {
        const pattern = new vscode.RelativePattern(this.templatesDir, '**/*.json');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidCreate(() => {
            this.loadTemplates();
            this._onTemplateChange.fire();
        });

        this.fileWatcher.onDidChange(() => {
            this.loadTemplates();
            this._onTemplateChange.fire();
        });

        this.fileWatcher.onDidDelete(() => {
            this.loadTemplates();
            this._onTemplateChange.fire();
        });
    }

    public getTemplates(): AgentTemplate[] {
        return Array.from(this.templates.values());
    }

    public getTemplate(id: string): AgentTemplate | undefined {
        return this.templates.get(id);
    }

    public async createTemplate(template: AgentTemplate, isCustom: boolean = true) {
        const dir = isCustom ? this.customTemplatesDir : this.templatesDir;
        const filePath = path.join(dir, `${template.id}.json`);

        if (fs.existsSync(filePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `Template ${template.name} already exists. Overwrite?`,
                'Yes',
                'No'
            );
            if (overwrite !== 'Yes') return false;
        }

        fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
        this.loadTemplates();
        return true;
    }

    // Alias for createTemplate to match command expectations
    public async saveTemplate(template: AgentTemplate, isCustom: boolean = true) {
        return this.createTemplate(template, isCustom);
    }

    public async editTemplate(id: string) {
        const template = this.templates.get(id);
        if (!template) return;

        const isCustom = id.startsWith('custom-');
        const dir = isCustom ? this.customTemplatesDir : this.templatesDir;
        const fileName = isCustom ? id.replace('custom-', '') : id;
        const filePath = path.join(dir, `${fileName}.json`);

        if (fs.existsSync(filePath)) {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        }
    }

    public async duplicateTemplate(id: string, newName: string) {
        const template = this.templates.get(id);
        if (!template) return false;

        const newTemplate = { ...template };
        newTemplate.id = newName.toLowerCase().replace(/\s+/g, '-');
        newTemplate.name = newName;

        return this.createTemplate(newTemplate, true);
    }

    public async importTemplate(uri: vscode.Uri) {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            const template = JSON.parse(Buffer.from(content).toString()) as AgentTemplate;

            // Validate template
            if (!template.id || !template.name || !template.systemPrompt) {
                throw new Error('Invalid template format');
            }

            return this.createTemplate(template, true);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import template: ${error}`);
            return false;
        }
    }

    public async exportTemplate(id: string) {
        const template = this.templates.get(id);
        if (!template) return;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${template.id}.json`),
            filters: {
                'JSON files': ['json']
            }
        });

        if (uri) {
            const content = Buffer.from(JSON.stringify(template, null, 2));
            await vscode.workspace.fs.writeFile(uri, content);
            vscode.window.showInformationMessage(`Template exported to ${uri.fsPath}`);
        }
    }

    public findBestTemplate(task: any): AgentTemplate | undefined {
        let bestTemplate: AgentTemplate | undefined;
        let bestScore = 0;

        const taskText = `${task.title} ${task.description}`.toLowerCase();

        for (const template of this.templates.values()) {
            let score = 0;

            // Check preferred tasks
            for (const preferred of template.taskPreferences.preferred) {
                if (taskText.includes(preferred)) {
                    score += 10;
                }
            }

            // Check avoided tasks (negative score)
            for (const avoid of template.taskPreferences.avoid) {
                if (taskText.includes(avoid)) {
                    score -= 5;
                }
            }

            // Check tags
            for (const tag of template.tags) {
                if (taskText.includes(tag)) {
                    score += 3;
                }
            }

            // Check capabilities
            for (const lang of template.capabilities.languages) {
                if (taskText.includes(lang)) {
                    score += 2;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestTemplate = template;
            }
        }

        return bestTemplate;
    }

    /**
     * Find the best matching template for a given agent type
     * Uses multiple strategies: exact ID match, types array, name/tag matching
     */
    public findTemplateByType(agentType: string): AgentTemplate | null {
        const normalizedType = agentType.toLowerCase().trim();

        // Strategy 1: Exact ID match
        const exactMatch = Array.from(this.templates.values()).find(t => t.id === normalizedType);
        if (exactMatch) return exactMatch;

        // Strategy 2: Check types array (if we've added it)
        for (const template of this.templates.values()) {
            if (template.types && Array.isArray(template.types)) {
                if (
                    template.types.some(
                        (t: string) =>
                            t.toLowerCase() === normalizedType ||
                            normalizedType.includes(t.toLowerCase()) ||
                            t.toLowerCase().includes(normalizedType)
                    )
                ) {
                    return template;
                }
            }
        }

        // Strategy 3: Check tags array (already exists in templates)
        for (const template of this.templates.values()) {
            if (template.tags && Array.isArray(template.tags)) {
                if (
                    template.tags.some(
                        (tag: string) =>
                            tag.toLowerCase() === normalizedType ||
                            normalizedType.includes(tag.toLowerCase()) ||
                            tag.toLowerCase().includes(normalizedType)
                    )
                ) {
                    return template;
                }
            }
        }

        // Strategy 4: Match by template name or description
        for (const template of this.templates.values()) {
            const templateName = template.name?.toLowerCase() || '';
            const templateId = template.id?.toLowerCase() || '';
            const description = template.description?.toLowerCase() || '';

            if (
                templateName.includes(normalizedType) ||
                templateId.includes(normalizedType) ||
                description.includes(normalizedType)
            ) {
                return template;
            }
        }

        // No match found
        return null;
    }

    /**
     * Get all currently active agent types to prevent duplicates
     * NOTE: This returns an empty set for now as we can't access AgentManager from here
     * The caller should check active agents directly from AgentManager
     */
    public getActiveAgentTypes(): Set<string> {
        const activeTypes = new Set<string>();

        try {
            // Try to get AgentManager from Container
            const container = Container.getInstance();
            if (container) {
                const agentManager = container.resolve<AgentManager>(SERVICE_TOKENS.AgentManager);
                if (agentManager && typeof agentManager.getAllAgents === 'function') {
                    const agents = agentManager.getAllAgents();
                    for (const agent of agents) {
                        // Add the agent type
                        if (agent.type) {
                            activeTypes.add(agent.type.toLowerCase());
                        }
                        // Also add template ID if available
                        if (agent.template?.id) {
                            activeTypes.add(agent.template.id.toLowerCase());
                        }
                    }
                }
            }
        } catch (error) {
            // Container or AgentManager not available - return empty set
            // This is expected during initialization or testing
        }

        return activeTypes;
    }

    /**
     * Get all available templates (alias for getTemplates)
     */
    public getAllTemplates(): AgentTemplate[] {
        return this.getTemplates();
    }

    dispose() {
        this.fileWatcher?.dispose();
        this._onTemplateChange.dispose();
    }
}
