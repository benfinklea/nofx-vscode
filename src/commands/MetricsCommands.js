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
exports.MetricsCommands = void 0;
const vscode = __importStar(require("vscode"));
const interfaces_1 = require("../services/interfaces");
class MetricsCommands {
    constructor(container) {
        this.disposables = [];
        this.autoRefreshEnabled = true;
        this.currentFilters = {};
        this.container = container;
        this.metricsService = container.resolve(interfaces_1.SERVICE_TOKENS.MetricsService);
        this.notificationService = container.resolve(interfaces_1.SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(interfaces_1.SERVICE_TOKENS.ConfigurationService);
        this.commandService = container.resolve(interfaces_1.SERVICE_TOKENS.CommandService);
        this.setupEventListeners();
    }
    setupEventListeners() {
        const eventBus = this.container.resolve(interfaces_1.SERVICE_TOKENS.EventBus);
        this.disposables.push(eventBus.subscribe('metrics.counter.incremented', () => {
            if (this.metricsPanel && this.autoRefreshEnabled) {
                this.refreshMetricsDashboard(this.currentFilters);
            }
        }));
        this.disposables.push(eventBus.subscribe('metrics.duration.recorded', () => {
            if (this.metricsPanel && this.autoRefreshEnabled) {
                this.refreshMetricsDashboard(this.currentFilters);
            }
        }));
        this.disposables.push(eventBus.subscribe('metrics.gauge.set', () => {
            if (this.metricsPanel && this.autoRefreshEnabled) {
                this.refreshMetricsDashboard(this.currentFilters);
            }
        }));
        this.disposables.push(eventBus.subscribe('metrics.recorded', () => {
            if (this.metricsPanel && this.autoRefreshEnabled) {
                this.refreshMetricsDashboard(this.currentFilters);
            }
        }));
    }
    register() {
        this.disposables.push(this.commandService.register('nofx.showMetricsDashboard', this.showMetricsDashboard.bind(this)));
        this.disposables.push(this.commandService.register('nofx.exportMetrics', this.exportMetrics.bind(this)));
        this.disposables.push(this.commandService.register('nofx.resetMetrics', this.resetMetrics.bind(this)));
        this.disposables.push(this.commandService.register('nofx.toggleMetrics', this.toggleMetrics.bind(this)));
    }
    async showMetricsDashboard() {
        try {
            if (this.metricsPanel) {
                this.metricsPanel.reveal();
                return;
            }
            this.metricsPanel = vscode.window.createWebviewPanel('nofxMetricsDashboard', 'NofX Metrics Dashboard', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true
            });
            this.metricsPanel.webview.html = this.getMetricsDashboardHtml();
            this.metricsPanel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'refresh':
                        this.refreshMetricsDashboard(message.filters);
                        break;
                    case 'export':
                        await this.exportMetricsFromDashboard(message.format);
                        break;
                    case 'reset':
                        await this.resetMetricsFromDashboard();
                        break;
                    case 'toggle':
                        await this.toggleMetricsFromDashboard();
                        break;
                    case 'setAutoRefresh':
                        this.setAutoRefresh(message.enabled);
                        break;
                }
            });
            const updateInterval = setInterval(() => {
                if (this.metricsPanel && this.autoRefreshEnabled) {
                    this.refreshMetricsDashboard(this.currentFilters);
                }
                else if (!this.metricsPanel) {
                    clearInterval(updateInterval);
                }
            }, 5000);
            this.metricsPanel.onDidDispose(() => {
                clearInterval(updateInterval);
                this.metricsPanel = undefined;
            });
        }
        catch (error) {
            this.notificationService.showError(`Failed to show metrics dashboard: ${error}`);
        }
    }
    refreshMetricsDashboard(filters) {
        if (!this.metricsPanel)
            return;
        if (filters) {
            this.currentFilters = filters;
        }
        const dashboardData = this.metricsService.getDashboardData();
        const filteredData = this.applyFiltersToData(dashboardData, this.currentFilters);
        this.metricsPanel.webview.postMessage({
            command: 'update',
            data: filteredData
        });
    }
    applyFiltersToData(data, filters) {
        if (!filters || Object.keys(filters).length === 0) {
            return data;
        }
        const filtered = { ...data };
        let filteredRecent = data.recent || [];
        if (filters.timeRange && filters.timeRange !== 'all') {
            const now = new Date();
            let cutoffTime;
            switch (filters.timeRange) {
                case '1h':
                    cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
                    break;
                case '6h':
                    cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
                    break;
                case '24h':
                    cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    cutoffTime = new Date(0);
            }
            filteredRecent = filteredRecent.filter((metric) => new Date(metric.timestamp) >= cutoffTime);
        }
        if (filters.metricType && filters.metricType !== 'all') {
            filteredRecent = filteredRecent.filter((metric) => metric.type === filters.metricType);
        }
        if (filters.searchFilter && filters.searchFilter.trim()) {
            const searchTerm = filters.searchFilter.toLowerCase();
            filteredRecent = filteredRecent.filter((metric) => metric.name.toLowerCase().includes(searchTerm));
        }
        filtered.recent = filteredRecent;
        filtered.recentMetrics = filteredRecent.length;
        filtered.topCounters = this.getTopCountersFromRecent(filteredRecent);
        filtered.averageDurations = this.getAverageDurationsFromRecent(filteredRecent);
        return filtered;
    }
    getTopCountersFromRecent(recentMetrics) {
        const counterMap = new Map();
        recentMetrics
            .filter(m => m.type === 'counter')
            .forEach(m => {
            const current = counterMap.get(m.name) || 0;
            counterMap.set(m.name, current + m.value);
        });
        return Array.from(counterMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }
    getAverageDurationsFromRecent(recentMetrics) {
        const durationMap = new Map();
        recentMetrics
            .filter(m => m.type === 'histogram')
            .forEach(m => {
            const current = durationMap.get(m.name) || { total: 0, count: 0 };
            current.total += m.value;
            current.count += 1;
            durationMap.set(m.name, current);
        });
        return Array.from(durationMap.entries())
            .map(([name, data]) => ({ name, average: data.total / data.count }))
            .sort((a, b) => b.average - a.average)
            .slice(0, 10);
    }
    setAutoRefresh(enabled) {
        this.autoRefreshEnabled = enabled;
    }
    getMetricsDashboardHtml() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NofX Metrics Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .title {
            font-size: 1.5em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        
        .controls {
            display: flex;
            gap: 10px;
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .metric-card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 15px;
        }
        
        .metric-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: var(--vscode-textPreformat-foreground);
        }
        
        .metric-description {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        
        .chart-container {
            height: 200px;
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-descriptionForeground);
        }
        
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-enabled {
            background-color: #4CAF50;
        }
        
        .status-disabled {
            background-color: #F44336;
        }
        
        .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        
        .table th, .table td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .table th {
            background-color: var(--vscode-panel-background);
            font-weight: bold;
        }
        
        .loading {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        
        .filters {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .filter-row {
            display: flex;
            gap: 15px;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .filter-row:last-child {
            margin-bottom: 0;
        }
        
        .filter-group {
            display: flex;
            flex-direction: column;
            min-width: 150px;
        }
        
        .filter-label {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }
        
        select, input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 6px 8px;
            font-size: 12px;
        }
        
        select:focus, input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .auto-refresh {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .auto-refresh input[type="checkbox"] {
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">🎸 NofX Metrics Dashboard</div>
        <div class="controls">
            <button onclick="refreshMetrics()">Refresh</button>
            <button onclick="exportMetrics('json')">Export JSON</button>
            <button onclick="exportMetrics('csv')">Export CSV</button>
            <button onclick="resetMetrics()">Reset</button>
            <button onclick="toggleMetrics()">Toggle Collection</button>
        </div>
    </div>
    
    <div id="loading" class="loading">Loading metrics...</div>
    
    <div id="dashboard" style="display: none;">
        <div class="filters">
            <div class="filter-row">
                <div class="filter-group">
                    <div class="filter-label">Time Range</div>
                    <select id="timeRange" onchange="applyFilters()">
                        <option value="1h">Last Hour</option>
                        <option value="6h">Last 6 Hours</option>
                        <option value="24h" selected>Last 24 Hours</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
                <div class="filter-group">
                    <div class="filter-label">Metric Type</div>
                    <select id="metricType" onchange="applyFilters()">
                        <option value="all">All Types</option>
                        <option value="counter">Counters</option>
                        <option value="histogram">Histograms</option>
                        <option value="gauge">Gauges</option>
                    </select>
                </div>
                <div class="filter-group">
                    <div class="filter-label">Search</div>
                    <input type="text" id="searchFilter" placeholder="Filter by name..." onkeyup="applyFilters()">
                </div>
                <div class="filter-group">
                    <div class="auto-refresh">
                        <input type="checkbox" id="autoRefresh" checked onchange="toggleAutoRefresh()">
                        <label for="autoRefresh">Auto Refresh</label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">Collection Status</div>
                <div class="metric-value">
                    <span id="status-indicator" class="status-indicator"></span>
                    <span id="status-text">Unknown</span>
                </div>
                <div class="metric-description">Metrics collection status</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Total Metrics</div>
                <div class="metric-value" id="total-metrics">0</div>
                <div class="metric-description">Total metrics recorded</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Recent Metrics</div>
                <div class="metric-value" id="recent-metrics">0</div>
                <div class="metric-description">Metrics in last hour</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Output Level</div>
                <div class="metric-value" id="output-level">Unknown</div>
                <div class="metric-description">Current output detail level</div>
            </div>
        </div>
        
        <div class="chart-container">
            <div>📊 Performance charts would be displayed here</div>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">Top Counters</div>
            <table class="table" id="top-counters">
                <thead>
                    <tr>
                        <th>Metric Name</th>
                        <th>Count</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">Average Durations</div>
            <table class="table" id="avg-durations">
                <thead>
                    <tr>
                        <th>Operation</th>
                        <th>Average (ms)</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">System Metrics</div>
            <div id="system-metrics">
                <div>Memory Usage: <span id="memory-usage">Loading...</span></div>
                <div>Uptime: <span id="uptime">Loading...</span></div>
                <div>Node Version: <span id="node-version">Loading...</span></div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function refreshMetrics() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function exportMetrics(format) {
            vscode.postMessage({ command: 'export', format: format });
        }
        
        function resetMetrics() {
            if (confirm('Are you sure you want to reset all metrics data?')) {
                vscode.postMessage({ command: 'reset' });
            }
        }
        
        function toggleMetrics() {
            vscode.postMessage({ command: 'toggle' });
        }
        
        function applyFilters() {
            const timeRange = document.getElementById('timeRange').value;
            const metricType = document.getElementById('metricType').value;
            const searchFilter = document.getElementById('searchFilter').value;
            
            vscode.postMessage({ 
                command: 'refresh', 
                filters: { 
                    timeRange, 
                    metricType, 
                    searchFilter 
                } 
            });
        }
        
        function toggleAutoRefresh() {
            const autoRefresh = document.getElementById('autoRefresh').checked;
            vscode.postMessage({ 
                command: 'setAutoRefresh', 
                enabled: autoRefresh 
            });
        }
        
        function updateDashboard(data) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            
            // Update status
            const statusIndicator = document.getElementById('status-indicator');
            const statusText = document.getElementById('status-text');
            if (data.enabled) {
                statusIndicator.className = 'status-indicator status-enabled';
                statusText.textContent = 'Enabled';
            } else {
                statusIndicator.className = 'status-indicator status-disabled';
                statusText.textContent = 'Disabled';
            }
            
            // Update metrics
            document.getElementById('total-metrics').textContent = data.totalMetrics || 0;
            document.getElementById('recent-metrics').textContent = data.recentMetrics || 0;
            document.getElementById('output-level').textContent = data.outputLevel || 'Unknown';
            
            // Update top counters
            const countersTable = document.querySelector('#top-counters tbody');
            countersTable.innerHTML = '';
            if (data.topCounters) {
                data.topCounters.forEach(counter => {
                    const row = countersTable.insertRow();
                    row.insertCell(0).textContent = counter.name;
                    row.insertCell(1).textContent = counter.count;
                });
            }
            
            // Update average durations
            const durationsTable = document.querySelector('#avg-durations tbody');
            durationsTable.innerHTML = '';
            if (data.averageDurations) {
                data.averageDurations.forEach(duration => {
                    const row = durationsTable.insertRow();
                    row.insertCell(0).textContent = duration.name;
                    row.insertCell(1).textContent = duration.average.toFixed(2);
                });
            }
            
            // Update system metrics
            if (data.systemMetrics) {
                const memUsage = data.systemMetrics.memory;
                document.getElementById('memory-usage').textContent = 
                    \`\${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB / \${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB\`;
                document.getElementById('uptime').textContent = 
                    \`\${Math.floor(data.systemMetrics.uptime / 60)} minutes\`;
                document.getElementById('node-version').textContent = data.systemMetrics.nodeVersion;
            }
        }
        
        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'update':
                    updateDashboard(message.data);
                    break;
            }
        });
        
        // Initial load
        refreshMetrics();
    </script>
</body>
</html>`;
    }
    async exportMetrics() {
        try {
            const format = await this.notificationService.showQuickPick([
                { label: 'JSON', description: 'Export as JSON format' },
                { label: 'CSV', description: 'Export as CSV format' }
            ]);
            if (!format)
                return;
            const data = this.metricsService.exportMetrics(format.label.toLowerCase());
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`nofx-metrics-${new Date().toISOString().split('T')[0]}.${format.label.toLowerCase()}`),
                filters: {
                    'Data Files': [format.label.toLowerCase()]
                }
            });
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
                this.notificationService.showInformation(`Metrics exported to ${uri.fsPath}`);
            }
        }
        catch (error) {
            this.notificationService.showError(`Failed to export metrics: ${error}`);
        }
    }
    async exportMetricsFromDashboard(format) {
        try {
            const data = this.metricsService.exportMetrics(format);
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`nofx-metrics-${new Date().toISOString().split('T')[0]}.${format}`),
                filters: {
                    'Data Files': [format]
                }
            });
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
                this.notificationService.showInformation(`Metrics exported to ${uri.fsPath}`);
            }
        }
        catch (error) {
            this.notificationService.showError(`Failed to export metrics: ${error}`);
        }
    }
    async resetMetrics() {
        const confirmed = await this.notificationService.confirmDestructive('Are you sure you want to reset all metrics data? This action cannot be undone.', 'Reset Metrics');
        if (confirmed) {
            this.metricsService.resetMetrics();
            this.notificationService.showInformation('Metrics data has been reset');
            if (this.metricsPanel) {
                this.refreshMetricsDashboard();
            }
        }
    }
    async resetMetricsFromDashboard() {
        this.metricsService.resetMetrics();
        this.notificationService.showInformation('Metrics data has been reset');
        this.refreshMetricsDashboard();
    }
    async toggleMetrics() {
        await this.toggleMetricsImpl();
        if (this.metricsPanel) {
            this.refreshMetricsDashboard();
        }
    }
    async toggleMetricsFromDashboard() {
        await this.toggleMetricsImpl();
        this.refreshMetricsDashboard();
    }
    async toggleMetricsImpl() {
        const currentEnabled = this.configService.get(interfaces_1.CONFIG_KEYS.ENABLE_METRICS, false);
        const newEnabled = !currentEnabled;
        const target = vscode.workspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
        await this.configService.update(interfaces_1.CONFIG_KEYS.ENABLE_METRICS, newEnabled, target);
        const status = newEnabled ? 'enabled' : 'disabled';
        this.notificationService.showInformation(`Metrics collection ${status}`);
    }
    dispose() {
        if (this.metricsPanel) {
            this.metricsPanel.dispose();
            this.metricsPanel = undefined;
        }
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}
exports.MetricsCommands = MetricsCommands;
//# sourceMappingURL=MetricsCommands.js.map