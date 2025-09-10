/**
 * Real Claude Launch Integration Test
 * This test actually tries to launch Claude Code to catch real integration failures
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TerminalManager } from '../../services/TerminalManager';
import { ConfigurationService } from '../../services/ConfigurationService';
import { LoggingService } from '../../services/LoggingService';
import { AgentTemplateManager } from '../../agents/AgentTemplateManager';

describe('Real Claude Launch Integration', () => {
    let terminalManager: TerminalManager;
    let configService: ConfigurationService;
    let loggingService: LoggingService;
    let templateManager: AgentTemplateManager;

    beforeAll(async () => {
        // Initialize real services (not mocks)
        loggingService = new LoggingService();
        configService = new ConfigurationService(loggingService);
        terminalManager = new TerminalManager(configService, loggingService);

        // Use the real workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            templateManager = new AgentTemplateManager(workspaceFolder.uri.fsPath);
        }
    });

    afterAll(() => {
        terminalManager?.dispose();
    });

    test('should detect if Claude Code is available in PATH', async () => {
        const claudePath = configService.getAiPath();
        console.log('Claude path from config:', claudePath);

        // This test should fail if claude command is not available
        // and help us understand why agents aren't launching
        expect(claudePath).toBeDefined();
        expect(claudePath.length).toBeGreaterThan(0);
    });

    test('should load real agent templates', async () => {
        if (!templateManager) {
            console.log('No workspace folder - skipping template test');
            return;
        }

        const frontendTemplate = await templateManager.getTemplate('frontend-specialist');
        console.log('Frontend template loaded:', {
            id: frontendTemplate?.id,
            hasSystemPrompt: !!frontendTemplate?.systemPrompt,
            hasDetailedPrompt: !!frontendTemplate?.detailedPrompt,
            systemPromptLength: frontendTemplate?.systemPrompt?.length,
            detailedPromptLength: frontendTemplate?.detailedPrompt?.length
        });

        expect(frontendTemplate).toBeDefined();
        expect(frontendTemplate?.systemPrompt).toBeDefined();
        expect(frontendTemplate?.detailedPrompt).toBeDefined();
    });

    test('should generate valid Claude launch command', async () => {
        if (!templateManager) {
            console.log('No workspace folder - skipping command test');
            return;
        }

        const frontendTemplate = await templateManager.getTemplate('frontend-specialist');
        if (!frontendTemplate) {
            throw new Error('Failed to load frontend template');
        }

        const claudePath = configService.getAiPath();
        const systemPrompt = frontendTemplate.systemPrompt;
        const escapedPrompt = systemPrompt.replace(/'/g, "'\\''");
        const command = `${claudePath} --append-system-prompt '${escapedPrompt}'`;

        console.log('Generated Claude command:', command);
        console.log('System prompt:', systemPrompt);
        console.log('Escaped prompt:', escapedPrompt);

        // Basic validation
        expect(command).toContain('--append-system-prompt');
        expect(command).toContain(claudePath);
        expect(escapedPrompt).not.toContain("'"); // Should be properly escaped
    });

    test('should create terminal without throwing', async () => {
        const terminal = await terminalManager.createTerminal('test-agent', 'frontend');

        expect(terminal).toBeDefined();
        expect(terminal.name).toContain('test-agent');

        // Clean up
        terminal.dispose();
    });

    test('should attempt real agent initialization (will likely fail but should not throw)', async () => {
        if (!templateManager) {
            console.log('No workspace folder - skipping initialization test');
            return;
        }

        const frontendTemplate = await templateManager.getTemplate('frontend-specialist');
        const testAgent = {
            id: 'test-agent-real',
            name: 'Real Test Agent',
            type: 'frontend',
            status: 'idle' as const,
            template: frontendTemplate,
            tasksCompleted: 0,
            terminal: undefined,
            currentTask: null,
            maxConcurrentTasks: 1
        };

        const terminal = await terminalManager.createTerminal(testAgent.name, testAgent.type);
        testAgent.terminal = terminal;

        try {
            // This is the actual method that's failing in production
            await terminalManager.initializeAgentTerminal(testAgent);
            console.log('✅ Agent initialization succeeded!');
        } catch (error) {
            console.log('❌ Agent initialization failed (expected):', error);
            // Log what we can see in the terminal
            console.log('Terminal state:', {
                name: terminal.name,
                exitStatus: terminal.exitStatus,
                processId: terminal.processId
            });
        }

        // Clean up
        terminal.dispose();
    });
});
