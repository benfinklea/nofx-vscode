import * as vscode from 'vscode';
import { Agent } from '../types/agent';
import { AgentActivityStatus, MonitoringEvent } from './ActivityMonitor';

export type NotificationLevel = 'minimal' | 'normal' | 'verbose';
export type NotificationReason = 'permission' | 'inactive' | 'stuck' | 'error' | 'completion';

export interface NotificationConfig {
    level: NotificationLevel;
    soundAlerts: boolean;
    autoComplete: boolean;
    statusBarEnabled: boolean;
    toastEnabled: boolean;
    modalEnabled: boolean;
}

export interface NotificationAction {
    title: string;
    action: () => void;
}

export class AgentNotificationService {
    private statusBarItem: vscode.StatusBarItem;
    private config: NotificationConfig;
    private notificationHistory: Map<string, Date> = new Map();
    private activeNotifications: Map<string, vscode.Disposable> = new Map();

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.config = this.loadConfiguration();
        this.setupConfigurationListener();
    }

    /**
     * Load configuration from VS Code settings
     */
    private loadConfiguration(): NotificationConfig {
        const config = vscode.workspace.getConfiguration('nofx.monitoring');
        return {
            level: config.get<NotificationLevel>('notificationLevel', 'normal'),
            soundAlerts: config.get<boolean>('soundAlerts', false),
            autoComplete: config.get<boolean>('autoComplete', true),
            statusBarEnabled: config.get<boolean>('statusBarNotifications', true),
            toastEnabled: config.get<boolean>('toastNotifications', true),
            modalEnabled: config.get<boolean>('modalNotifications', true)
        };
    }

    /**
     * Setup configuration change listener
     */
    private setupConfigurationListener(): void {
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('nofx.monitoring')) {
                this.config = this.loadConfiguration();
            }
        });
    }

    /**
     * Notify user that an agent needs attention
     */
    public async notifyUserAttention(
        agent: Agent, 
        reason: NotificationReason, 
        event?: MonitoringEvent
    ): Promise<void> {
        const notificationKey = `${agent.id}-${reason}`;
        
        // Check if we've recently shown this notification (debounce)
        if (this.shouldDebounce(notificationKey)) {
            return;
        }

        // Determine notification priority based on reason
        const priority = this.getNotificationPriority(reason);
        
        // Progressive notification based on priority and configuration
        switch (priority) {
            case 'low':
                if (this.config.level !== 'minimal') {
                    this.showStatusBarNotification(agent, reason, event);
                }
                break;
                
            case 'medium':
                this.showStatusBarNotification(agent, reason, event);
                if (this.config.level !== 'minimal' && this.config.toastEnabled) {
                    await this.showToastNotification(agent, reason, event);
                }
                break;
                
            case 'high':
                this.showStatusBarNotification(agent, reason, event);
                if (this.config.toastEnabled) {
                    await this.showToastNotification(agent, reason, event);
                }
                if (this.config.soundAlerts) {
                    this.playNotificationSound();
                }
                break;
                
            case 'critical':
                this.showStatusBarNotification(agent, reason, event);
                if (this.config.modalEnabled) {
                    await this.showModalNotification(agent, reason, event);
                } else if (this.config.toastEnabled) {
                    await this.showToastNotification(agent, reason, event);
                }
                if (this.config.soundAlerts) {
                    this.playNotificationSound();
                }
                break;
        }

        // Record notification time
        this.notificationHistory.set(notificationKey, new Date());
    }

    /**
     * Show status bar notification
     */
    private showStatusBarNotification(agent: Agent, reason: NotificationReason, event?: MonitoringEvent): void {
        if (!this.config.statusBarEnabled) return;

        const icon = this.getStatusIcon(reason);
        const message = this.getNotificationMessage(agent, reason, 'short');
        
        this.statusBarItem.text = `${icon} ${message}`;
        this.statusBarItem.tooltip = this.getNotificationMessage(agent, reason, 'long');
        this.statusBarItem.command = {
            command: 'nofx.focusAgentTerminal',
            title: 'Focus Agent Terminal',
            arguments: [agent.id]
        };
        
        this.statusBarItem.show();

        // Auto-hide after a period
        setTimeout(() => {
            if (this.statusBarItem.text === `${icon} ${message}`) {
                this.statusBarItem.hide();
            }
        }, 30000); // Hide after 30 seconds
    }

    /**
     * Show toast notification
     */
    private async showToastNotification(agent: Agent, reason: NotificationReason, event?: MonitoringEvent): Promise<void> {
        const icon = this.getStatusIcon(reason);
        const message = `${icon} ${this.getNotificationMessage(agent, reason, 'medium')}`;
        
        const actions = this.getNotificationActions(agent, reason);
        const actionTitles = actions.map(a => a.title);
        
        let selectedAction: string | undefined;
        
        switch (reason) {
            case 'permission':
                selectedAction = await vscode.window.showWarningMessage(
                    message,
                    ...actionTitles
                );
                break;
                
            case 'error':
                selectedAction = await vscode.window.showErrorMessage(
                    message,
                    ...actionTitles
                );
                break;
                
            case 'completion':
                if (this.config.level === 'verbose') {
                    selectedAction = await vscode.window.showInformationMessage(
                        message,
                        ...actionTitles
                    );
                }
                break;
                
            default:
                selectedAction = await vscode.window.showWarningMessage(
                    message,
                    ...actionTitles
                );
        }

        // Execute selected action
        if (selectedAction) {
            const action = actions.find(a => a.title === selectedAction);
            if (action) {
                action.action();
            }
        }
    }

    /**
     * Show modal notification for critical issues
     */
    private async showModalNotification(agent: Agent, reason: NotificationReason, event?: MonitoringEvent): Promise<void> {
        const icon = this.getStatusIcon(reason);
        const message = this.getNotificationMessage(agent, reason, 'long');
        
        const detail = event?.data?.message || 'The agent requires immediate attention.';
        
        const result = await vscode.window.showInformationMessage(
            `${icon} Critical: ${message}`,
            { modal: true, detail },
            'Go to Terminal',
            'View Details',
            'Dismiss'
        );

        switch (result) {
            case 'Go to Terminal':
                vscode.commands.executeCommand('nofx.focusAgentTerminal', agent.id);
                break;
            case 'View Details':
                this.showAgentDetails(agent);
                break;
        }
    }

    /**
     * Get notification message based on reason and length
     */
    private getNotificationMessage(agent: Agent, reason: NotificationReason, length: 'short' | 'medium' | 'long'): string {
        const name = agent.name || agent.id;
        
        const messages: { [key in NotificationReason]: { [key in 'short' | 'medium' | 'long']: string } } = {
            permission: {
                short: `${name} needs permission`,
                medium: `${name} is requesting permission to proceed`,
                long: `Agent "${name}" is waiting for your permission to continue with the current operation`
            },
            inactive: {
                short: `${name} inactive`,
                medium: `${name} has been inactive for 30+ seconds`,
                long: `Agent "${name}" has shown no activity for over 30 seconds and may need attention`
            },
            stuck: {
                short: `${name} stuck`,
                medium: `${name} needs immediate attention (2+ min inactive)`,
                long: `Agent "${name}" has been inactive for over 2 minutes and requires immediate intervention`
            },
            error: {
                short: `${name} error`,
                medium: `${name} encountered an error`,
                long: `Agent "${name}" has encountered an error that may require your attention`
            },
            completion: {
                short: `${name} done`,
                medium: `${name} completed task`,
                long: `Agent "${name}" has successfully completed the assigned task`
            }
        };

        return messages[reason][length];
    }

    /**
     * Get status icon for notification
     */
    private getStatusIcon(reason: NotificationReason): string {
        const icons: { [key in NotificationReason]: string } = {
            permission: '⚠️',
            inactive: '🟠',
            stuck: '🔴',
            error: '❌',
            completion: '✅'
        };
        return icons[reason];
    }

    /**
     * Get notification actions based on reason
     */
    private getNotificationActions(agent: Agent, reason: NotificationReason): NotificationAction[] {
        const baseActions: NotificationAction[] = [
            {
                title: 'Go to Terminal',
                action: () => vscode.commands.executeCommand('nofx.focusAgentTerminal', agent.id)
            },
            {
                title: 'Dismiss',
                action: () => {} // No-op
            }
        ];

        switch (reason) {
            case 'permission':
                return [
                    baseActions[0],
                    {
                        title: 'Auto-Approve',
                        action: () => this.autoApprovePermission(agent)
                    },
                    baseActions[1]
                ];
                
            case 'error':
                return [
                    baseActions[0],
                    {
                        title: 'View Logs',
                        action: () => this.showAgentLogs(agent)
                    },
                    baseActions[1]
                ];
                
            case 'stuck':
                return [
                    baseActions[0],
                    {
                        title: 'Restart Agent',
                        action: () => vscode.commands.executeCommand('nofx.restartAgent', agent.id)
                    },
                    baseActions[1]
                ];
                
            default:
                return baseActions;
        }
    }

    /**
     * Determine notification priority
     */
    private getNotificationPriority(reason: NotificationReason): 'low' | 'medium' | 'high' | 'critical' {
        const priorities: { [key in NotificationReason]: 'low' | 'medium' | 'high' | 'critical' } = {
            completion: 'low',
            inactive: 'medium',
            permission: 'high',
            error: 'high',
            stuck: 'critical'
        };
        return priorities[reason];
    }

    /**
     * Check if notification should be debounced
     */
    private shouldDebounce(notificationKey: string): boolean {
        const lastNotification = this.notificationHistory.get(notificationKey);
        if (!lastNotification) return false;
        
        const now = new Date();
        const timeSinceLastMs = now.getTime() - lastNotification.getTime();
        const debounceMs = 10000; // 10 seconds
        
        return timeSinceLastMs < debounceMs;
    }

    /**
     * Play notification sound (platform-specific)
     */
    private playNotificationSound(): void {
        // VS Code doesn't have direct audio API, but we can trigger system notification
        // which usually includes a sound
        if (process.platform === 'darwin') {
            // macOS: Use system notification sound
            require('child_process').exec('afplay /System/Library/Sounds/Glass.aiff');
        } else if (process.platform === 'win32') {
            // Windows: Use PowerShell to play sound
            require('child_process').exec('powershell -c (New-Object Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync();');
        }
        // Linux: Could use paplay or similar if available
    }

    /**
     * Auto-approve permission for an agent
     */
    private autoApprovePermission(agent: Agent): void {
        const terminal = vscode.window.terminals.find(t => t.name.includes(agent.name));
        if (terminal) {
            terminal.sendText('y'); // Send 'y' to approve
            console.log(`[NotificationService] Auto-approved permission for agent ${agent.name}`);
        }
    }

    /**
     * Show agent logs
     */
    private showAgentLogs(agent: Agent): void {
        // Open output channel with agent logs
        const outputChannel = vscode.window.createOutputChannel(`Agent Logs: ${agent.name}`);
        outputChannel.appendLine(`Logs for agent ${agent.name} (${agent.id})`);
        outputChannel.appendLine('=' .repeat(50));
        // Add actual log content here
        outputChannel.show();
    }

    /**
     * Show agent details
     */
    private showAgentDetails(agent: Agent): void {
        vscode.commands.executeCommand('nofx.showAgentDetails', agent.id);
    }

    /**
     * Clear notification for an agent
     */
    public clearNotification(agentId: string): void {
        // Clear from history
        const keysToRemove: string[] = [];
        this.notificationHistory.forEach((_, key) => {
            if (key.startsWith(agentId)) {
                keysToRemove.push(key);
            }
        });
        keysToRemove.forEach(key => this.notificationHistory.delete(key));
        
        // Hide status bar if it's for this agent
        if (this.statusBarItem.text?.includes(agentId)) {
            this.statusBarItem.hide();
        }
    }

    /**
     * Update status bar with agent status
     */
    public updateStatusBar(statuses: Map<string, AgentActivityStatus>): void {
        if (!this.config.statusBarEnabled) return;
        
        const statusCounts = {
            active: 0,
            waiting: 0,
            inactive: 0,
            stuck: 0,
            error: 0
        };
        
        statuses.forEach(status => {
            if (status in statusCounts) {
                statusCounts[status as keyof typeof statusCounts]++;
            }
        });
        
        const parts: string[] = [];
        if (statusCounts.stuck > 0) parts.push(`🔴 ${statusCounts.stuck}`);
        if (statusCounts.error > 0) parts.push(`❌ ${statusCounts.error}`);
        if (statusCounts.waiting > 0) parts.push(`🟡 ${statusCounts.waiting}`);
        if (statusCounts.inactive > 0) parts.push(`🟠 ${statusCounts.inactive}`);
        if (statusCounts.active > 0) parts.push(`🟢 ${statusCounts.active}`);
        
        if (parts.length > 0) {
            this.statusBarItem.text = `Agents: ${parts.join(' ')}`;
            this.statusBarItem.tooltip = 'Click to view agent status';
            this.statusBarItem.command = 'nofx.showAgentStatus';
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.statusBarItem.dispose();
        this.activeNotifications.forEach(d => d.dispose());
        this.activeNotifications.clear();
        this.notificationHistory.clear();
    }
}