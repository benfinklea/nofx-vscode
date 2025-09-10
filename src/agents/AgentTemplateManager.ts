import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentManager } from './AgentManager';
import { ServiceLocator } from '../services/ServiceLocator';
import {
    SmartTemplateFactory,
    SmartAgentTemplate,
    AgentConfig,
    DeveloperConfig,
    ArchitectConfig,
    QualityConfig,
    ProcessConfig
} from './SmartTemplateSystem';

// Legacy interface for backward compatibility
export interface AgentTemplate {
    id: string;
    name: string;
    icon: string;
    terminalIcon?: string;
    color?: string;
    description: string;
    version?: string;
    types?: string[];
    tags?: string[];
    capabilities?: any;
    systemPrompt: string;
    detailedPrompt?: string;
    subAgentCapabilities?: any;
    taskPreferences?: {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity?: string;
    };
    filePatterns?: {
        watch: string[];
        ignore: string[];
    };
    commands?: any;
    workflow?: any;
    bestPractices?: any;
    riskMitigation?: any;
    metrics?: any;
    documentation?: any;
    orchestrationPatterns?: any;
    aiSystemIntegration?: any;
    vscodeExtensionPatterns?: any;
    codeTemplates?: any;
    snippets?: Record<string, string>;
    author?: string;
}

// Type alias for compatibility
export type ModernAgentTemplate = SmartAgentTemplate | AgentTemplate;

export class AgentTemplateManager {
    private builtInTemplatesDir: string;
    private templatesDir: string;
    private customTemplatesDir: string;
    private templates: Map<string, ModernAgentTemplate> = new Map();
    private smartTemplates: Map<string, SmartAgentTemplate> = new Map();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private _onTemplateChange = new vscode.EventEmitter<void>();
    public readonly onTemplateChange = this._onTemplateChange.event;
    private useSmartTemplates: boolean = true;

    constructor(workspaceRoot: string) {
        // Built-in templates packaged with the extension
        this.builtInTemplatesDir = path.join(__dirname, 'templates');

        console.log(`[NofX] Smart Template System initialized`);
        console.log(`[NofX] Legacy templates directory: ${this.builtInTemplatesDir}`);

        // Runtime templates directory (for user customization)
        this.templatesDir = path.join(workspaceRoot, '.nofx', 'templates');
        this.customTemplatesDir = path.join(this.templatesDir, 'custom');

        this.ensureDirectories();
        this.initializeSmartTemplates();
        this.loadLegacyTemplates(); // Load any remaining legacy templates
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

    private initializeSmartTemplates() {
        console.log('[NofX] Initializing Smart Template System...');

        // Load preset smart templates
        const presetTemplates = SmartTemplateFactory.createPresetTemplates();
        for (const template of presetTemplates) {
            this.smartTemplates.set(template.id, template);
            this.templates.set(template.id, template);
        }

        console.log(`[NofX] Loaded ${presetTemplates.length} smart templates`);
    }

    private loadLegacyTemplates() {
        // Only load legacy templates if they exist and aren't replaced by smart templates
        if (fs.existsSync(this.builtInTemplatesDir)) {
            const builtInFiles = fs.readdirSync(this.builtInTemplatesDir).filter(file => file.endsWith('.json'));

            for (const file of builtInFiles) {
                try {
                    const content = fs.readFileSync(path.join(this.builtInTemplatesDir, file), 'utf-8');
                    const template = JSON.parse(content) as AgentTemplate;

                    // Only load if not already replaced by smart template
                    if (!this.templates.has(template.id)) {
                        this.templates.set(template.id, template);
                        console.log(`[NofX] Loaded legacy template: ${template.id}`);
                    }
                } catch (error) {
                    console.error(`Failed to load legacy template ${file}:`, error);
                }
            }
        }

        // Load user custom templates
        if (fs.existsSync(this.templatesDir)) {
            const templateFiles = fs.readdirSync(this.templatesDir).filter(file => file.endsWith('.json'));
            for (const file of templateFiles) {
                try {
                    const content = fs.readFileSync(path.join(this.templatesDir, file), 'utf-8');
                    const template = JSON.parse(content) as AgentTemplate;
                    this.templates.set(template.id, template);
                } catch (error) {
                    console.error(`Failed to load user template ${file}:`, error);
                }
            }
        }

        console.log(`[NofX] Total templates loaded: ${this.templates.size}`);
    }

    private watchTemplates() {
        const pattern = new vscode.RelativePattern(this.templatesDir, '**/*.json');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidCreate(() => {
            this.loadLegacyTemplates();
            this._onTemplateChange.fire();
        });

        this.fileWatcher.onDidChange(() => {
            this.loadLegacyTemplates();
            this._onTemplateChange.fire();
        });

        this.fileWatcher.onDidDelete(() => {
            this.loadLegacyTemplates();
            this._onTemplateChange.fire();
        });
    }

    public getTemplates(): ModernAgentTemplate[] {
        return Array.from(this.templates.values());
    }

    public getSmartTemplates(): SmartAgentTemplate[] {
        return Array.from(this.smartTemplates.values());
    }

    public getTemplate(id: string): ModernAgentTemplate | undefined {
        return this.templates.get(id);
    }

    public getSmartTemplate(id: string): SmartAgentTemplate | undefined {
        return this.smartTemplates.get(id);
    }

    public createDynamicTemplate(config: AgentConfig): SmartAgentTemplate {
        const template = SmartTemplateFactory.createTemplate(config);

        // Store dynamically created template
        const dynamicId = `dynamic-${Date.now()}`;
        template.id = dynamicId;
        this.smartTemplates.set(dynamicId, template);
        this.templates.set(dynamicId, template);

        return template;
    }

    public async createTemplate(template: ModernAgentTemplate, isCustom: boolean = true) {
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
        this.loadLegacyTemplates();
        return true;
    }

    public async createSmartTemplate(config: AgentConfig, save: boolean = false): Promise<SmartAgentTemplate> {
        const template = SmartTemplateFactory.createTemplate(config);

        this.smartTemplates.set(template.id, template);
        this.templates.set(template.id, template);

        if (save) {
            await this.saveSmartTemplate(template);
        }

        return template;
    }

    private async saveSmartTemplate(template: SmartAgentTemplate) {
        const configPath = path.join(this.customTemplatesDir, `${template.id}.config.json`);
        fs.writeFileSync(configPath, JSON.stringify(template.config, null, 2));
    }

    // Alias for createTemplate to match command expectations
    public async saveTemplate(template: ModernAgentTemplate, isCustom: boolean = true) {
        return this.createTemplate(template, isCustom);
    }

    /**
     * Saves a template to the built-in templates directory (for development/testing)
     * WARNING: This writes to the extension's source directory and may be lost on updates
     */
    public async saveBuiltInLikeTemplate(template: ModernAgentTemplate): Promise<boolean> {
        const filePath = path.join(this.builtInTemplatesDir, `${template.id}.json`);

        if (fs.existsSync(filePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `Built-in template ${template.name} already exists. Overwrite? (WARNING: This will modify extension source)`,
                'Yes',
                'No'
            );
            if (overwrite !== 'Yes') return false;
        }

        try {
            fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
            this.loadLegacyTemplates();
            return true;
        } catch (error) {
            console.error(`Failed to save built-in template: ${error}`);
            return false;
        }
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

    public findBestTemplate(task: any): ModernAgentTemplate | undefined {
        let bestTemplate: ModernAgentTemplate | undefined;
        let bestScore = 0;

        const taskText = `${task.title} ${task.description}`.toLowerCase();

        for (const template of this.templates.values()) {
            const score = this.scoreTemplate(template, taskText);

            if (score > bestScore) {
                bestScore = score;
                bestTemplate = template;
            }
        }

        return bestTemplate;
    }

    private scoreTemplate(template: ModernAgentTemplate, taskText: string): number {
        let score = 0;

        // Check preferred tasks
        if (template.taskPreferences?.preferred) {
            for (const preferred of template.taskPreferences.preferred) {
                if (taskText.includes(preferred.toLowerCase())) {
                    score += 10;
                }
            }
        }

        // Check avoided tasks (negative score)
        if (template.taskPreferences?.avoid) {
            for (const avoid of template.taskPreferences.avoid) {
                if (taskText.includes(avoid.toLowerCase())) {
                    score -= 5;
                }
            }
        }

        // Check tags
        if ('tags' in template && (template as any).tags) {
            for (const tag of (template as any).tags) {
                if (taskText.includes(tag.toLowerCase())) {
                    score += 3;
                }
            }
        }

        // Smart template scoring
        if ('config' in template && template.config) {
            if (template.config.category === 'developer') {
                const config = template.config as DeveloperConfig;
                if (taskText.includes(config.primaryDomain)) score += 8;
                for (const lang of config.languages) {
                    if (taskText.includes(lang.toLowerCase())) score += 2;
                }
                for (const spec of config.specializations) {
                    if (taskText.includes(spec.toLowerCase().replace('-', ' '))) score += 5;
                }
            }
        }

        return score;
    }

    public suggestTemplateForTask(taskDescription: string): SmartAgentTemplate | null {
        const taskLower = taskDescription.toLowerCase();

        // Analyze task to suggest template configuration
        if (taskLower.includes('frontend') || taskLower.includes('ui') || taskLower.includes('react')) {
            return this.getSmartTemplate('frontend-developer') || null;
        }
        if (taskLower.includes('backend') || taskLower.includes('api') || taskLower.includes('server')) {
            return this.getSmartTemplate('backend-developer') || null;
        }
        if (taskLower.includes('fullstack') || taskLower.includes('full-stack') || taskLower.includes('end-to-end')) {
            return this.getSmartTemplate('fullstack-developer') || null;
        }
        if (taskLower.includes('test') || taskLower.includes('quality') || taskLower.includes('qa')) {
            return this.getSmartTemplate('testing-specialist') || null;
        }
        if (taskLower.includes('architect') || taskLower.includes('design') || taskLower.includes('system')) {
            return this.getSmartTemplate('software-architect') || null;
        }

        // Default to fullstack if uncertain
        return this.getSmartTemplate('fullstack-developer') || null;
    }

    /**
     * Find the best matching template for a given agent type
     * Uses multiple strategies: exact ID match, types array, name/tag matching
     */
    public findTemplateByType(agentType: string): ModernAgentTemplate | null {
        const normalizedType = agentType.toLowerCase().trim();

        // Strategy 1: Exact ID match
        const exactMatch = Array.from(this.templates.values()).find(t => t.id === normalizedType);
        if (exactMatch) {
            // Debug: Log what we're returning
            if (exactMatch.id === 'frontend-specialist') {
                console.log('[DEBUG] Returning frontend-specialist template:');
                console.log('  - systemPrompt length:', exactMatch.systemPrompt?.length);
                console.log('  - systemPrompt preview:', exactMatch.systemPrompt?.substring(0, 100) + '...');
                console.log('  - detailedPrompt exists?', !!exactMatch.detailedPrompt);
            }
            return exactMatch;
        }

        // Strategy 2: Check types array (if we've added it)
        for (const template of this.templates.values()) {
            if ('type' in template && Array.isArray((template as any).type)) {
                if (
                    (template as any).type.some(
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
            if ('keywords' in template && Array.isArray((template as any).keywords)) {
                if (
                    (template as any).keywords.some(
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
            // Try to get AgentManager from ServiceLocator
            const agentManager = ServiceLocator.get<AgentManager>('AgentManager');
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
        } catch (error) {
            // Container or AgentManager not available - return empty set
            // This is expected during initialization or testing
        }

        return activeTypes;
    }

    /**
     * Get all available templates (alias for getTemplates)
     */
    public getAllTemplates(): ModernAgentTemplate[] {
        return this.getTemplates();
    }

    /**
     * Get available template categories for UI
     */
    public getTemplateCategories(): string[] {
        const categories = new Set<string>();
        for (const template of this.smartTemplates.values()) {
            categories.add(template.config.category);
        }
        return Array.from(categories);
    }

    /**
     * Get templates by category
     */
    public getTemplatesByCategory(category: string): SmartAgentTemplate[] {
        return Array.from(this.smartTemplates.values()).filter(template => template.config.category === category);
    }

    /**
     * Enable/disable smart template system
     */
    public setUseSmartTemplates(use: boolean) {
        this.useSmartTemplates = use;
        if (use) {
            this.initializeSmartTemplates();
        }
        this._onTemplateChange.fire();
    }

    /**
     * Check if smart templates are enabled
     */
    public isUsingSmartTemplates(): boolean {
        return this.useSmartTemplates;
    }

    dispose() {
        this.fileWatcher?.dispose();
        this._onTemplateChange.dispose();
    }
}
