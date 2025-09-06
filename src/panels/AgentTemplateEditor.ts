import * as vscode from 'vscode';
import { AgentTemplate, AgentTemplateManager } from '../agents/AgentTemplateManager';

export class AgentTemplateEditor {
    public static currentPanel: AgentTemplateEditor | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private templateManager: AgentTemplateManager;
    private template?: AgentTemplate;

    public static createOrShow(
        context: vscode.ExtensionContext,
        templateManager: AgentTemplateManager,
        templateId?: string
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (AgentTemplateEditor.currentPanel) {
            AgentTemplateEditor.currentPanel._panel.reveal(column);
            if (templateId) {
                AgentTemplateEditor.currentPanel.loadTemplate(templateId);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'agentTemplateEditor',
            'Agent Template Editor',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AgentTemplateEditor.currentPanel = new AgentTemplateEditor(
            panel,
            context,
            templateManager,
            templateId
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        templateManager: AgentTemplateManager,
        templateId?: string
    ) {
        this._panel = panel;
        this.templateManager = templateManager;

        this._panel.webview.html = this._getHtmlForWebview();

        if (templateId) {
            this.loadTemplate(templateId);
        }

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'save':
                        this.saveTemplate(message.template);
                        break;
                    case 'test':
                        this.testTemplate(message.template);
                        break;
                    case 'export':
                        this.exportTemplate(message.template);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private loadTemplate(templateId: string) {
        this.template = this.templateManager.getTemplate(templateId);
        if (this.template) {
            this._panel.webview.postMessage({
                command: 'loadTemplate',
                template: this.template
            });
        }
    }

    private async saveTemplate(template: AgentTemplate) {
        const success = await this.templateManager.createTemplate(template);
        if (success) {
            vscode.window.showInformationMessage(`Template "${template.name}" saved successfully`);
            this._panel.webview.postMessage({ command: 'saved' });
        }
    }

    private async testTemplate(template: AgentTemplate) {
        // Create a test agent with this template
        vscode.commands.executeCommand('nofx.spawnAgentWithTemplate', template);
    }

    private async exportTemplate(template: AgentTemplate) {
        await this.templateManager.exportTemplate(template.id);
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Template Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        
        h1 {
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: var(--vscode-input-foreground);
        }
        
        input, textarea, select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
        }
        
        textarea {
            min-height: 150px;
            resize: vertical;
        }
        
        .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }
        
        .chip {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            font-size: 12px;
        }
        
        .chip button {
            margin-left: 8px;
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
            padding: 0;
        }
        
        .add-chip {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        
        .add-chip input {
            flex: 1;
        }
        
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 30px;
        }
        
        .tabs {
            display: flex;
            gap: 10px;
            border-bottom: 2px solid var(--vscode-panel-border);
            margin-bottom: 20px;
        }
        
        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--vscode-foreground);
            opacity: 0.7;
        }
        
        .tab.active {
            opacity: 1;
            border-bottom: 2px solid var(--vscode-focusBorder);
            margin-bottom: -2px;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .icon-picker {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        
        .icon-option {
            font-size: 24px;
            padding: 8px;
            cursor: pointer;
            border: 2px solid transparent;
            border-radius: 4px;
        }
        
        .icon-option:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .icon-option.selected {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-activeSelectionBackground);
        }
    </style>
</head>
<body>
    <h1>🛠️ Agent Template Editor</h1>
    
    <div class="tabs">
        <button class="tab active" onclick="showTab('basic')">Basic Info</button>
        <button class="tab" onclick="showTab('capabilities')">Capabilities</button>
        <button class="tab" onclick="showTab('prompt')">System Prompt</button>
        <button class="tab" onclick="showTab('preferences')">Task Preferences</button>
        <button class="tab" onclick="showTab('advanced')">Advanced</button>
    </div>
    
    <div id="basic" class="tab-content active">
        <div class="form-group">
            <label for="name">Template Name</label>
            <input type="text" id="name" placeholder="e.g., Frontend Specialist">
        </div>
        
        <div class="form-group">
            <label for="id">Template ID</label>
            <input type="text" id="id" placeholder="e.g., frontend-specialist">
        </div>
        
        <div class="form-group">
            <label>Icon</label>
            <div class="icon-picker">
                <span class="icon-option" onclick="selectIcon('🎨')">🎨</span>
                <span class="icon-option" onclick="selectIcon('⚙️')">⚙️</span>
                <span class="icon-option" onclick="selectIcon('🚀')">🚀</span>
                <span class="icon-option" onclick="selectIcon('🔧')">🔧</span>
                <span class="icon-option" onclick="selectIcon('📊')">📊</span>
                <span class="icon-option" onclick="selectIcon('🔒')">🔒</span>
                <span class="icon-option" onclick="selectIcon('🧪')">🧪</span>
                <span class="icon-option" onclick="selectIcon('🤖')">🤖</span>
                <span class="icon-option" onclick="selectIcon('📱')">📱</span>
                <span class="icon-option" onclick="selectIcon('☁️')">☁️</span>
            </div>
            <input type="hidden" id="icon" value="🤖">
        </div>
        
        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" placeholder="Brief description of what this agent specializes in"></textarea>
        </div>
        
        <div class="form-group">
            <label>Tags</label>
            <div id="tags" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-tag" placeholder="Add tag...">
                <button onclick="addTag()">Add</button>
            </div>
        </div>
    </div>
    
    <div id="capabilities" class="tab-content">
        <div class="form-group">
            <label>Programming Languages</label>
            <div id="languages" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-language" placeholder="e.g., typescript, python...">
                <button onclick="addCapability('languages')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label>Frameworks</label>
            <div id="frameworks" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-framework" placeholder="e.g., react, express...">
                <button onclick="addCapability('frameworks')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label>Tools</label>
            <div id="tools" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-tool" placeholder="e.g., docker, git...">
                <button onclick="addCapability('tools')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label>Testing Frameworks</label>
            <div id="testing" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-testing" placeholder="e.g., jest, cypress...">
                <button onclick="addCapability('testing')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label>Specialties</label>
            <div id="specialties" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-specialty" placeholder="e.g., api-design, optimization...">
                <button onclick="addCapability('specialties')">Add</button>
            </div>
        </div>
    </div>
    
    <div id="prompt" class="tab-content">
        <div class="form-group">
            <label for="systemPrompt">System Prompt</label>
            <textarea id="systemPrompt" placeholder="Enter the system prompt that defines this agent's behavior and expertise..." style="min-height: 400px;"></textarea>
        </div>
        
        <div class="form-group">
            <button onclick="insertPromptTemplate()">Insert Template</button>
            <button onclick="testPrompt()">Test Prompt</button>
        </div>
    </div>
    
    <div id="preferences" class="tab-content">
        <div class="form-group">
            <label>Preferred Task Types</label>
            <div id="preferred" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-preferred" placeholder="e.g., ui-component, api...">
                <button onclick="addPreference('preferred')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label>Tasks to Avoid</label>
            <div id="avoid" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-avoid" placeholder="e.g., database, styling...">
                <button onclick="addPreference('avoid')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label for="priority">Default Priority</label>
            <select id="priority">
                <option value="high">High</option>
                <option value="medium" selected>Medium</option>
                <option value="low">Low</option>
            </select>
        </div>
    </div>
    
    <div id="advanced" class="tab-content">
        <div class="form-group">
            <label>File Patterns to Watch</label>
            <div id="watch" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-watch" placeholder="e.g., *.tsx, components/**">
                <button onclick="addFilePattern('watch')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label>File Patterns to Ignore</label>
            <div id="ignore" class="chips"></div>
            <div class="add-chip">
                <input type="text" id="new-ignore" placeholder="e.g., *.sql, backend/**">
                <button onclick="addFilePattern('ignore')">Add</button>
            </div>
        </div>
        
        <div class="form-group">
            <label for="commands">Custom Commands (JSON)</label>
            <textarea id="commands" placeholder='{"test": "npm test", "build": "npm run build"}'></textarea>
        </div>
        
        <div class="form-group">
            <label for="version">Version</label>
            <input type="text" id="version" placeholder="1.0.0">
        </div>
        
        <div class="form-group">
            <label for="author">Author</label>
            <input type="text" id="author" placeholder="Your name">
        </div>
    </div>
    
    <div class="button-group">
        <button onclick="saveTemplate()">💾 Save Template</button>
        <button onclick="testTemplate()">🧪 Test Agent</button>
        <button onclick="exportTemplate()">📤 Export</button>
        <button onclick="resetForm()">🔄 Reset</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let currentTemplate = {
            capabilities: {
                languages: [],
                frameworks: [],
                tools: [],
                testing: [],
                specialties: []
            },
            taskPreferences: {
                preferred: [],
                avoid: [],
                priority: 'medium'
            },
            filePatterns: {
                watch: [],
                ignore: []
            },
            tags: []
        };
        
        function showTab(tabName) {
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            event.target.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        }
        
        function selectIcon(icon) {
            document.querySelectorAll('.icon-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            event.target.classList.add('selected');
            document.getElementById('icon').value = icon;
        }
        
        function addTag() {
            const input = document.getElementById('new-tag');
            if (input.value) {
                currentTemplate.tags.push(input.value);
                renderChips('tags', currentTemplate.tags);
                input.value = '';
            }
        }
        
        function addCapability(type) {
            const input = document.getElementById('new-' + type.slice(0, -1));
            if (input.value) {
                currentTemplate.capabilities[type].push(input.value);
                renderChips(type, currentTemplate.capabilities[type]);
                input.value = '';
            }
        }
        
        function addPreference(type) {
            const input = document.getElementById('new-' + type);
            if (input.value) {
                currentTemplate.taskPreferences[type].push(input.value);
                renderChips(type, currentTemplate.taskPreferences[type]);
                input.value = '';
            }
        }
        
        function addFilePattern(type) {
            const input = document.getElementById('new-' + type);
            if (input.value) {
                if (!currentTemplate.filePatterns) {
                    currentTemplate.filePatterns = { watch: [], ignore: [] };
                }
                currentTemplate.filePatterns[type].push(input.value);
                renderChips(type, currentTemplate.filePatterns[type]);
                input.value = '';
            }
        }
        
        function renderChips(containerId, items) {
            const container = document.getElementById(containerId);
            container.innerHTML = items.map((item, index) => 
                \`<div class="chip">
                    \${item}
                    <button onclick="removeChip('\${containerId}', \${index})">×</button>
                </div>\`
            ).join('');
        }
        
        function removeChip(containerId, index) {
            if (containerId === 'tags') {
                currentTemplate.tags.splice(index, 1);
                renderChips(containerId, currentTemplate.tags);
            } else if (currentTemplate.capabilities[containerId]) {
                currentTemplate.capabilities[containerId].splice(index, 1);
                renderChips(containerId, currentTemplate.capabilities[containerId]);
            } else if (currentTemplate.taskPreferences[containerId]) {
                currentTemplate.taskPreferences[containerId].splice(index, 1);
                renderChips(containerId, currentTemplate.taskPreferences[containerId]);
            } else if (currentTemplate.filePatterns && currentTemplate.filePatterns[containerId]) {
                currentTemplate.filePatterns[containerId].splice(index, 1);
                renderChips(containerId, currentTemplate.filePatterns[containerId]);
            }
        }
        
        function saveTemplate() {
            const template = {
                ...currentTemplate,
                id: document.getElementById('id').value,
                name: document.getElementById('name').value,
                icon: document.getElementById('icon').value,
                description: document.getElementById('description').value,
                systemPrompt: document.getElementById('systemPrompt').value,
                taskPreferences: {
                    ...currentTemplate.taskPreferences,
                    priority: document.getElementById('priority').value
                },
                version: document.getElementById('version').value,
                author: document.getElementById('author').value
            };
            
            const commandsText = document.getElementById('commands').value;
            if (commandsText) {
                try {
                    template.commands = JSON.parse(commandsText);
                } catch (e) {
                    alert('Invalid JSON in commands field');
                    return;
                }
            }
            
            vscode.postMessage({ command: 'save', template });
        }
        
        function testTemplate() {
            saveTemplate();
            vscode.postMessage({ command: 'test', template: currentTemplate });
        }
        
        function exportTemplate() {
            saveTemplate();
            vscode.postMessage({ command: 'export', template: currentTemplate });
        }
        
        function insertPromptTemplate() {
            const promptField = document.getElementById('systemPrompt');
            promptField.value = \`You are a \${document.getElementById('name').value || '[Agent Name]'} with expertise in [specific areas].

## Core Responsibilities
1. [Primary responsibility]
2. [Secondary responsibility]
3. [Additional responsibility]

## Technical Expertise
- Languages: [List languages]
- Frameworks: [List frameworks]
- Best Practices: [List practices]

## Working Principles
- Always follow [principle 1]
- Ensure [principle 2]
- Maintain [principle 3]

## Task Approach
When given a task:
1. Analyze requirements thoroughly
2. Consider best practices and patterns
3. Implement clean, maintainable code
4. Include appropriate error handling
5. Add necessary documentation

## Quality Standards
- Code should be [standard 1]
- Always include [standard 2]
- Ensure [standard 3]\`;
        }
        
        function resetForm() {
            if (confirm('Reset all fields? This cannot be undone.')) {
                document.getElementById('id').value = '';
                document.getElementById('name').value = '';
                document.getElementById('description').value = '';
                document.getElementById('systemPrompt').value = '';
                document.getElementById('commands').value = '';
                document.getElementById('version').value = '';
                document.getElementById('author').value = '';
                currentTemplate = {
                    capabilities: {
                        languages: [],
                        frameworks: [],
                        tools: [],
                        testing: [],
                        specialties: []
                    },
                    taskPreferences: {
                        preferred: [],
                        avoid: [],
                        priority: 'medium'
                    },
                    filePatterns: {
                        watch: [],
                        ignore: []
                    },
                    tags: []
                };
                // Clear all chips
                ['tags', 'languages', 'frameworks', 'tools', 'testing', 'specialties', 
                 'preferred', 'avoid', 'watch', 'ignore'].forEach(id => {
                    const container = document.getElementById(id);
                    if (container) container.innerHTML = '';
                });
            }
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadTemplate':
                    loadTemplateData(message.template);
                    break;
                case 'saved':
                    // Show success feedback
                    break;
            }
        });
        
        function loadTemplateData(template) {
            currentTemplate = template;
            document.getElementById('id').value = template.id || '';
            document.getElementById('name').value = template.name || '';
            document.getElementById('icon').value = template.icon || '🤖';
            document.getElementById('description').value = template.description || '';
            document.getElementById('systemPrompt').value = template.systemPrompt || '';
            document.getElementById('priority').value = template.taskPreferences?.priority || 'medium';
            document.getElementById('version').value = template.version || '';
            document.getElementById('author').value = template.author || '';
            
            if (template.commands) {
                document.getElementById('commands').value = JSON.stringify(template.commands, null, 2);
            }
            
            // Render all chips
            if (template.tags) renderChips('tags', template.tags);
            if (template.capabilities) {
                Object.keys(template.capabilities).forEach(key => {
                    if (template.capabilities[key]) {
                        renderChips(key, template.capabilities[key]);
                    }
                });
            }
            if (template.taskPreferences) {
                if (template.taskPreferences.preferred) renderChips('preferred', template.taskPreferences.preferred);
                if (template.taskPreferences.avoid) renderChips('avoid', template.taskPreferences.avoid);
            }
            if (template.filePatterns) {
                if (template.filePatterns.watch) renderChips('watch', template.filePatterns.watch);
                if (template.filePatterns.ignore) renderChips('ignore', template.filePatterns.ignore);
            }
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        AgentTemplateEditor.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
