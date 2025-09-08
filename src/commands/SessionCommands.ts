import * as vscode from 'vscode';
import {
    ICommandHandler,
    IContainer,
    ICommandService,
    INotificationService,
    ILoggingService,
    SERVICE_TOKENS
} from '../services/interfaces';
import { SessionPersistenceService } from '../services/SessionPersistenceService';
import { SessionSummary, SessionRestoreOptions, BulkRestoreRequest } from '../types/session';
import { PickItem } from '../types/ui';

export class SessionCommands implements ICommandHandler {
    private readonly commandService: ICommandService;
    private readonly notificationService: INotificationService;
    private readonly loggingService?: ILoggingService;
    private sessionService?: SessionPersistenceService;

    constructor(container: IContainer) {
        this.commandService = container.resolve<ICommandService>(SERVICE_TOKENS.CommandService);
        this.notificationService = container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService);
        this.loggingService = container.resolveOptional<ILoggingService>(SERVICE_TOKENS.LoggingService);
    }

    setSessionService(sessionService: SessionPersistenceService): void {
        this.sessionService = sessionService;
    }

    register(): void {
        this.commandService.register('nofx.showSessionManager', this.showSessionManager.bind(this));
        this.commandService.register('nofx.restoreSession', this.restoreSession.bind(this));
        this.commandService.register('nofx.restoreMultipleSessions', this.restoreMultipleSessions.bind(this));
        this.commandService.register('nofx.archiveSession', this.archiveSession.bind(this));
        this.commandService.register('nofx.exportSessions', this.exportSessions.bind(this));
    }

    private async showSessionManager(): Promise<void> {
        if (!this.sessionService) {
            await this.notificationService.showError('Session service not available');
            return;
        }

        try {
            const summaries = await this.sessionService.getSessionSummaries();

            if (summaries.length === 0) {
                await this.notificationService.showInformation(
                    'No sessions found. Sessions will be created automatically when you spawn agents.',
                    'OK'
                );
                return;
            }

            await this.displaySessionManager(summaries);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error('Error showing session manager', err);
            await this.notificationService.showError(`Failed to load sessions: ${err.message}`);
        }
    }

    private async displaySessionManager(summaries: SessionSummary[]): Promise<void> {
        const quickPickItems: PickItem<{ action: string; sessionId: string; summary: SessionSummary }>[] = [];

        // Group by status
        const activeSessions = summaries.filter(s => s.status === 'active');
        const expiredSessions = summaries.filter(s => s.status === 'expired');
        const archivedSessions = summaries.filter(s => s.status === 'archived');

        // Add section headers and items
        if (activeSessions.length > 0) {
            quickPickItems.push({
                label: '$(pulse) Active Sessions',
                description: `${activeSessions.length} running`,
                value: { action: 'header', sessionId: '', summary: {} as SessionSummary },
                kind: vscode.QuickPickItemKind.Separator
            });

            for (const session of activeSessions) {
                const expiryInfo = session.expiresIn ? ` (expires in ${session.expiresIn})` : '';
                quickPickItems.push({
                    label: `$(account) ${session.agentName}`,
                    description: `${session.agentType} • ${session.duration} • ${session.tasksCompleted} tasks${expiryInfo}`,
                    detail: session.name,
                    value: { action: 'view', sessionId: session.sessionId, summary: session }
                });
            }
        }

        if (expiredSessions.length > 0) {
            quickPickItems.push({
                label: '$(warning) Expired Sessions (Restorable)',
                description: `${expiredSessions.length} expired`,
                value: { action: 'header', sessionId: '', summary: {} as SessionSummary },
                kind: vscode.QuickPickItemKind.Separator
            });

            for (const session of expiredSessions) {
                quickPickItems.push({
                    label: `$(clock) ${session.agentName}`,
                    description: `${session.agentType} • ${session.duration} • ${session.tasksCompleted} tasks • Expired`,
                    detail: `${session.name} - Click to restore`,
                    value: { action: 'restore', sessionId: session.sessionId, summary: session }
                });
            }
        }

        if (archivedSessions.length > 0) {
            quickPickItems.push({
                label: '$(archive) Archived Sessions',
                description: `${archivedSessions.length} archived`,
                value: { action: 'header', sessionId: '', summary: {} as SessionSummary },
                kind: vscode.QuickPickItemKind.Separator
            });

            for (const session of archivedSessions) {
                quickPickItems.push({
                    label: `$(file-zip) ${session.agentName}`,
                    description: `${session.agentType} • ${session.duration} • ${session.tasksCompleted} tasks • Archived`,
                    detail: session.name,
                    value: { action: 'view', sessionId: session.sessionId, summary: session }
                });
            }
        }

        // Add action items at the top
        quickPickItems.unshift(
            {
                label: '$(rocket) Restore Multiple Sessions',
                description: 'Select and restore multiple sessions at once',
                value: { action: 'bulk-restore', sessionId: '', summary: {} as SessionSummary }
            },
            {
                label: '$(export) Export All Sessions',
                description: 'Export session data for backup',
                value: { action: 'export', sessionId: '', summary: {} as SessionSummary }
            },
            {
                label: '',
                value: { action: 'separator', sessionId: '', summary: {} as SessionSummary },
                kind: vscode.QuickPickItemKind.Separator
            }
        );

        const selected = await this.notificationService.showQuickPick(quickPickItems, {
            placeHolder: 'Session Manager - Select a session or action',
            title: `NofX Session Manager (${summaries.length} total sessions)`
        });

        if (selected) {
            await this.handleSessionAction(selected.value, summaries);
        }
    }

    private async handleSessionAction(
        selection: { action: string; sessionId: string; summary: SessionSummary },
        allSummaries: SessionSummary[]
    ): Promise<void> {
        switch (selection.action) {
            case 'view':
                await this.showSessionDetails(selection.summary);
                break;

            case 'restore':
                await this.restoreSessionWithOptions(selection.sessionId);
                break;

            case 'bulk-restore':
                await this.showBulkRestoreDialog(allSummaries);
                break;

            case 'export':
                await this.exportAllSessions();
                break;
        }
    }

    private async showSessionDetails(summary: SessionSummary): Promise<void> {
        const actions: PickItem<string>[] = [];

        if (summary.status === 'expired' || summary.status === 'archived') {
            actions.push({
                label: '$(refresh) Restore Session',
                description: 'Create new agent with previous context',
                value: 'restore'
            });
        }

        if (summary.status === 'active') {
            actions.push({
                label: '$(archive) Archive Session',
                description: 'Move to archived storage',
                value: 'archive'
            });
        }

        actions.push(
            {
                label: '$(export) Export Session',
                description: 'Export session data',
                value: 'export'
            },
            {
                label: '$(trash) Delete Session',
                description: 'Permanently delete session data',
                value: 'delete'
            }
        );

        const action = await this.notificationService.showQuickPick(actions, {
            placeHolder: `Actions for ${summary.agentName}`,
            title: `Session: ${summary.name}`
        });

        if (action) {
            switch (action.value) {
                case 'restore':
                    await this.restoreSessionWithOptions(summary.sessionId);
                    break;
                case 'archive':
                    await this.archiveSession(summary.sessionId);
                    break;
                case 'export':
                    await this.exportSession(summary.sessionId);
                    break;
                case 'delete':
                    await this.deleteSession(summary.sessionId);
                    break;
            }
        }
    }

    private async showBulkRestoreDialog(summaries: SessionSummary[]): Promise<void> {
        const restorableSessions = summaries.filter(s => s.isRestorable);

        if (restorableSessions.length === 0) {
            await this.notificationService.showInformation('No restorable sessions found.');
            return;
        }

        // Multi-select for sessions
        const sessionItems = restorableSessions.map(s => ({
            label: `${s.agentName} (${s.agentType})`,
            description: `${s.duration} • ${s.tasksCompleted} tasks`,
            detail: s.name,
            picked: false
        }));

        const selectedSessions = await vscode.window.showQuickPick(sessionItems, {
            placeHolder: 'Select sessions to restore',
            title: 'Bulk Restore Sessions',
            canPickMany: true
        });

        if (!selectedSessions || selectedSessions.length === 0) {
            return;
        }

        // Get restore options
        const options = await this.getRestoreOptions();
        if (!options) {
            return;
        }

        // Restore selected sessions
        const sessionIds = selectedSessions.map(item => {
            const summary = restorableSessions.find(s => `${s.agentName} (${s.agentType})` === item.label);
            return summary!.sessionId;
        });

        await this.restoreMultipleSessions({ sessionIds, options, restoreAsNewSessions: true });
    }

    private async getRestoreOptions(): Promise<SessionRestoreOptions | null> {
        const options: PickItem<keyof SessionRestoreOptions>[] = [
            {
                label: '$(history) Restore conversation history',
                description: 'Include previous messages and context',
                value: 'restoreConversationHistory'
            },
            {
                label: '$(play) Continue current task',
                description: 'Resume any in-progress task',
                value: 'restoreCurrentTask'
            },
            {
                label: '$(folder) Restore working directory',
                description: 'Set the same working directory',
                value: 'restoreWorkingDirectory'
            },
            {
                label: '$(arrow-right) Continue from last message',
                description: 'Resume conversation from where it left off',
                value: 'continueFromLastMessage'
            },
            {
                label: '$(book) Summarize history',
                description: 'Provide summary instead of full history (recommended for long sessions)',
                value: 'summarizeHistory'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select restore options',
            title: 'Session Restore Options',
            canPickMany: true
        });

        if (!selected) {
            return null;
        }

        const restoreOptions: SessionRestoreOptions = {
            restoreConversationHistory: false,
            restoreCurrentTask: false,
            restoreWorkingDirectory: false,
            continueFromLastMessage: false,
            summarizeHistory: false
        };

        for (const option of selected) {
            restoreOptions[option.value] = true;
        }

        return restoreOptions;
    }

    private async restoreSession(sessionId?: string): Promise<void> {
        if (!sessionId) {
            await this.notificationService.showError('Session ID not provided');
            return;
        }

        await this.restoreSessionWithOptions(sessionId);
    }

    private async restoreSessionWithOptions(sessionId: string): Promise<void> {
        if (!this.sessionService) {
            await this.notificationService.showError('Session service not available');
            return;
        }

        try {
            const options = await this.getRestoreOptions();
            if (!options) {
                return;
            }

            const restoredSession = await this.sessionService.restoreSession(sessionId, options);

            if (restoredSession) {
                // Trigger agent creation with restored context
                await vscode.commands.executeCommand('nofx.restoreAgentFromSession', restoredSession);

                await this.notificationService.showInformation(
                    `✅ Session restored for ${restoredSession.agentName}. Agent will be created with previous context.`
                );
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error('Error restoring session', err);
            await this.notificationService.showError(`Failed to restore session: ${err.message}`);
        }
    }

    private async restoreMultipleSessions(request: BulkRestoreRequest): Promise<void> {
        if (!this.sessionService) {
            await this.notificationService.showError('Session service not available');
            return;
        }

        try {
            const results = [];

            for (const sessionId of request.sessionIds) {
                try {
                    const restoredSession = await this.sessionService.restoreSession(sessionId, request.options);
                    if (restoredSession) {
                        results.push({ sessionId, success: true, session: restoredSession });

                        // Trigger agent creation
                        await vscode.commands.executeCommand('nofx.restoreAgentFromSession', restoredSession);
                    }
                } catch (error) {
                    results.push({ sessionId, success: false, error });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            let message = `✅ Successfully restored ${successCount} session(s)`;
            if (failCount > 0) {
                message += `, ${failCount} failed`;
            }
            message += '. Agents will be created with previous context.';

            await this.notificationService.showInformation(message);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error('Error restoring multiple sessions', err);
            await this.notificationService.showError(`Failed to restore sessions: ${err.message}`);
        }
    }

    private async archiveSession(sessionId: string): Promise<void> {
        if (!this.sessionService) {
            await this.notificationService.showError('Session service not available');
            return;
        }

        try {
            await this.sessionService.archiveSession(sessionId);
            await this.notificationService.showInformation('✅ Session archived successfully');
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.loggingService?.error('Error archiving session', err);
            await this.notificationService.showError(`Failed to archive session: ${err.message}`);
        }
    }

    private async exportSession(sessionId: string): Promise<void> {
        await this.notificationService.showInformation('Session export feature coming soon!');
    }

    private async exportSessions(): Promise<void> {
        await this.exportAllSessions();
    }

    private async exportAllSessions(): Promise<void> {
        await this.notificationService.showInformation('Bulk session export feature coming soon!');
    }

    private async deleteSession(sessionId: string): Promise<void> {
        const confirmed = await this.notificationService.showWarning(
            'Are you sure you want to permanently delete this session? This action cannot be undone.',
            'Delete',
            'Cancel'
        );

        if (confirmed === 'Delete') {
            // TODO: Implement delete functionality
            await this.notificationService.showInformation('Session deletion feature coming soon!');
        }
    }

    dispose(): void {
        // Cleanup handled by CommandService
    }
}
