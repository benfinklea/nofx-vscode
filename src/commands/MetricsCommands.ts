import * as vscode from 'vscode';
import { IContainer, SERVICE_TOKENS, IMetricsService, INotificationService, IConfigurationService } from '../services/interfaces';

export class MetricsCommands {
    private container: IContainer;
    private metricsService: IMetricsService;
    private notificationService: INotificationService;
    private configService: IConfigurationService;
    private metricsPanel: vscode.WebviewPanel | undefined;

    constructor(container: IContainer) {
        this.container = container;
        this.metricsService = container.resolve(SERVICE_TOKENS.MetricsService);
        this.notificationService = container.resolve(SERVICE_TOKENS.NotificationService);
        this.configService = container.resolve(SERVICE_TOKENS.ConfigurationService);
    }

    register(): void {
        // Show metrics dashboard
        vscode.commands.registerCommand('nofx.showMetricsDashboard', () => {
            this.showMetricsDashboard();
        });

        // Export metrics data
        vscode.commands.registerCommand('nofx.exportMetrics', () => {
            this.exportMetrics();
        });

        // Reset metrics data
        vscode.commands.registerCommand('nofx.resetMetrics', () => {
            this.resetMetrics();
        });

        // Toggle metrics collection
        vscode.commands.registerCommand('nofx.toggleMetrics', () => {
            this.toggleMetrics();
        });
    }

    private async showMetricsDashboard(): Promise<void> {
        try {
            if (this.metricsPanel) {
                this.metricsPanel.reveal();
                return;
            }

            this.metricsPanel = vscode.window.createWebviewPanel(
                'nofxMetricsDashboard',
                'NofX Metrics Dashboard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.metricsPanel.webview.html = this.getMetricsDashboardHtml();

            // Handle messages from webview
            this.metricsPanel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'refresh':
                            this.refreshMetricsDashboard();
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
                    }
                }
            );

            // Update dashboard periodically
            const updateInterval = setInterval(() => {
                if (this.metricsPanel) {
                    this.refreshMetricsDashboard();
                } else {
                    clearInterval(updateInterval);
                }
            }, 5000); // Update every 5 seconds

            this.metricsPanel.onDidDispose(() => {
                clearInterval(updateInterval);
                this.metricsPanel = undefined;
            });

        } catch (error) {
            this.notificationService.showError(`Failed to show metrics dashboard: ${error}`);
        }
    }

    private refreshMetricsDashboard(): void {
        if (!this.metricsPanel) return;

        const dashboardData = this.metricsService.getDashboardData();
        this.metricsPanel.webview.postMessage({
            command: 'update',
            data: dashboardData
        });
    }

    private getMetricsDashboardHtml(): string {
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

    private async exportMetrics(): Promise<void> {
        try {
            const format = await this.notificationService.showQuickPick([
                { label: 'JSON', description: 'Export as JSON format' },
                { label: 'CSV', description: 'Export as CSV format' }
            ]);

            if (!format) return;

            const data = this.metricsService.exportMetrics(format.label.toLowerCase() as 'json' | 'csv');
            
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
        } catch (error) {
            this.notificationService.showError(`Failed to export metrics: ${error}`);
        }
    }

    private async exportMetricsFromDashboard(format: string): Promise<void> {
        try {
            const data = this.metricsService.exportMetrics(format as 'json' | 'csv');
            
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
        } catch (error) {
            this.notificationService.showError(`Failed to export metrics: ${error}`);
        }
    }

    private async resetMetrics(): Promise<void> {
        const confirmed = await this.notificationService.confirmDestructive(
            'Are you sure you want to reset all metrics data? This action cannot be undone.',
            'Reset Metrics'
        );

        if (confirmed) {
            this.metricsService.resetMetrics();
            this.notificationService.showInformation('Metrics data has been reset');
            
            if (this.metricsPanel) {
                this.refreshMetricsDashboard();
            }
        }
    }

    private async resetMetricsFromDashboard(): Promise<void> {
        this.metricsService.resetMetrics();
        this.notificationService.showInformation('Metrics data has been reset');
        this.refreshMetricsDashboard();
    }

    private async toggleMetrics(): Promise<void> {
        const currentEnabled = this.configService.get('enableMetrics', false);
        const newEnabled = !currentEnabled;
        
        await this.configService.update('enableMetrics', newEnabled);
        
        const status = newEnabled ? 'enabled' : 'disabled';
        this.notificationService.showInformation(`Metrics collection ${status}`);
        
        if (this.metricsPanel) {
            this.refreshMetricsDashboard();
        }
    }

    private async toggleMetricsFromDashboard(): Promise<void> {
        const currentEnabled = this.configService.get('enableMetrics', false);
        const newEnabled = !currentEnabled;
        
        await this.configService.update('enableMetrics', newEnabled);
        
        const status = newEnabled ? 'enabled' : 'disabled';
        this.notificationService.showInformation(`Metrics collection ${status}`);
        this.refreshMetricsDashboard();
    }

    dispose(): void {
        if (this.metricsPanel) {
            this.metricsPanel.dispose();
        }
    }
}
