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
exports.AgentTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const ui_1 = require("../types/ui");
class AgentTreeProvider {
    constructor(treeStateManager, uiStateManager) {
        this.treeStateManager = treeStateManager;
        this.uiStateManager = uiStateManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.disposables = [];
        this.disposables.push(this.treeStateManager.subscribe(() => {
            this._onDidChangeTreeData.fire();
        }));
        this.disposables.push(this.uiStateManager.subscribe(() => {
            this._onDidChangeTreeData.fire();
        }));
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const data = this.treeStateManager.getSectionItems();
            return Promise.resolve(this.createTreeItemsFromData(data));
        }
        if (element instanceof TeamSectionItem) {
            return Promise.resolve(element.agents.map(agent => new AgentItem(agent)));
        }
        return Promise.resolve([]);
    }
    createTreeItemsFromData(data) {
        const items = [];
        if (data.agents && data.agents.length > 0) {
            const isExpanded = this.treeStateManager.isSectionExpanded('teamSection');
            items.push(new TeamSectionItem(data.teamName, 'organization', data.agents, isExpanded));
        }
        if (data.tasks && data.tasks.length > 0) {
            items.push(new SectionItem('Tasks', 'tasklist'));
            const activeTasks = data.tasks.filter((t) => (0, ui_1.normalizeTaskStatus)(t.status) === 'in-progress' || (0, ui_1.normalizeTaskStatus)(t.status) === 'assigned');
            const pendingTasks = data.tasks.filter((t) => (0, ui_1.normalizeTaskStatus)(t.status) === 'queued');
            if (activeTasks.length > 0) {
                items.push(...activeTasks.map((task) => new TaskItem(task, true)));
            }
            if (pendingTasks.length > 0) {
                items.push(...pendingTasks.map((task) => new TaskItem(task, false)));
            }
        }
        if (!data.hasData) {
            items.push(new MessageItem('No agents or tasks available'));
        }
        return items;
    }
    createTreeItem(item) {
        if (item.type === 'teamSection') {
            const isExpanded = this.treeStateManager.isSectionExpanded('teamSection');
            return new TeamSectionItem(item.label, item.icon, item.agents, isExpanded);
        }
        else if (item.type === 'section') {
            return new SectionItem(item.label, item.icon);
        }
        else if (item.type === 'agent') {
            return new AgentItem(item.agent);
        }
        else if (item.type === 'task') {
            return new TaskItem(item.task, item.isActive);
        }
        else if (item.type === 'message') {
            return new MessageItem(item.message);
        }
        return new SectionItem(item.label || 'Unknown', 'question');
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    setTeamName(name) {
        this.treeStateManager.setTeamName(name);
    }
    dispose() {
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        this._onDidChangeTreeData.dispose();
    }
}
exports.AgentTreeProvider = AgentTreeProvider;
class TreeItem extends vscode.TreeItem {
}
class SectionItem extends TreeItem {
    constructor(label, icon) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'section';
    }
}
class TeamSectionItem extends TreeItem {
    constructor(label, icon, agents, isExpanded = true) {
        super(label, isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.agents = agents;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'teamSection';
        this.tooltip = `${label} (${agents.length} agents)`;
        this.command = {
            command: 'nofx.openConductorTerminal',
            title: 'Open Conductor',
            arguments: []
        };
    }
}
class MessageItem extends TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'message';
    }
}
class AgentItem extends TreeItem {
    constructor(agent) {
        super(`  ${agent.name}`, vscode.TreeItemCollapsibleState.None);
        this.agent = agent;
        this.tooltip = `${agent.name} (${agent.type})`;
        const normalizedStatus = (0, ui_1.normalizeAgentStatus)(agent.status);
        this.description = normalizedStatus === 'working'
            ? `Working on: ${agent.currentTask?.title}`
            : normalizedStatus;
        this.iconPath = new vscode.ThemeIcon(normalizedStatus === 'working' ? 'debug-start' :
            normalizedStatus === 'idle' ? 'check' :
                normalizedStatus === 'error' ? 'error' : 'circle-outline');
        this.contextValue = 'agent';
        this.command = {
            command: 'nofx.focusAgentTerminal',
            title: 'Focus Agent Terminal',
            arguments: [agent.id]
        };
    }
}
class TaskItem extends TreeItem {
    constructor(task, isActive) {
        super(`  ${task.title}`, vscode.TreeItemCollapsibleState.None);
        this.task = task;
        this.tooltip = task.description || task.title;
        this.description = isActive ? 'In Progress' : `Priority: ${task.priority}`;
        this.iconPath = new vscode.ThemeIcon(isActive ? 'sync~spin' :
            task.priority === 'high' ? 'warning' :
                task.priority === 'medium' ? 'circle-filled' : 'circle-outline');
        this.contextValue = 'task';
    }
}
//# sourceMappingURL=AgentTreeProvider.js.map