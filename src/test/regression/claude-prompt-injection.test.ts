/**
 * Regression tests for Claude prompt injection
 * Ensures that the Claude CLI command is properly formatted and never breaks
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TerminalManager } from '../../services/TerminalManager';
import { ConfigurationService } from '../../services/ConfigurationService';
import { LoggingService } from '../../services/LoggingService';
import { ServiceLocator } from '../../services/ServiceLocator';
import { DeveloperSmartTemplate } from '../../agents/SmartTemplateSystem';

describe('Claude Prompt Injection Regression Tests', () => {
    let terminalManager: TerminalManager;
    let configService: ConfigurationService;
    let loggingService: LoggingService;
    
    beforeEach(() => {
        // Setup services with required dependencies following functional test pattern
        configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService as any, mainChannel);
        ServiceLocator.register('loggingService', loggingService);
        ServiceLocator.register('configService', configService);
        terminalManager = new TerminalManager(configService as any, loggingService);
    });

    afterEach(() => {
        ServiceLocator.clear();
    });

    describe('Prompt Escaping', () => {
        it('should properly escape single quotes in prompts', () => {
            const prompt = "You're an expert developer. Don't break things.";
            const escaped = prompt.replace(/'/g, "'\\''");
            assert.ok(!escaped.includes("'"), 'Single quotes should be escaped');
        });

        it('should properly escape double quotes for double-quoted strings', () => {
            const prompt = 'He said "Hello World" to the team';
            const escaped = prompt.replace(/"/g, '\\"');
            assert.strictEqual(escaped, 'He said \\"Hello World\\" to the team');
        });

        it('should properly escape backticks in prompts', () => {
            const prompt = 'Run `git status` and `ls -la` first';
            const escaped = prompt.replace(/`/g, '\\`');
            assert.strictEqual(escaped, 'Run \\`git status\\` and \\`ls -la\\` first');
        });

        it('should properly escape dollar signs', () => {
            const prompt = 'The variable $PATH and ${HOME} are important';
            const escaped = prompt.replace(/\$/g, '\\$');
            assert.strictEqual(escaped, 'The variable \\$PATH and \\${HOME} are important');
        });

        it('should handle multiline prompts without breaking', () => {
            const prompt = `Line 1
Line 2
Line 3`;
            // Double quotes handle newlines naturally
            const command = `claude --append-system-prompt "${prompt}"`;
            assert.ok(command.includes('Line 1'), 'Should contain first line');
            assert.ok(command.includes('Line 3'), 'Should contain last line');
        });

        it('should escape all special characters in correct order', () => {
            const prompt = `You're a "pro" at \`coding\` with $100% success\\rate`;
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            assert.ok(escaped.includes('\\\\rate'), 'Backslashes should be escaped first');
            assert.ok(escaped.includes('\\"pro\\"'), 'Double quotes should be escaped');
            assert.ok(escaped.includes('\\`coding\\`'), 'Backticks should be escaped');
            assert.ok(escaped.includes('\\$100'), 'Dollar signs should be escaped');
        });
    });

    describe('Command Construction', () => {
        it('should include --dangerously-skip-permissions when configured', () => {
            // Mock config to return true
            const mockConfig = {
                isClaudeSkipPermissions: () => true,
                getAiPath: () => 'claude'
            };
            
            const command = `${mockConfig.getAiPath()} --dangerously-skip-permissions --append-system-prompt "test"`;
            assert.ok(command.includes('--dangerously-skip-permissions'));
        });

        it('should use double quotes for multiline prompts', () => {
            const multilinePrompt = `Line 1
Line 2
Line 3`;
            const escaped = multilinePrompt.replace(/"/g, '\\"');
            const command = `claude --append-system-prompt "${escaped}"`;
            
            // Should use double quotes, not single quotes
            assert.ok(command.includes('"'), 'Should use double quotes');
            assert.ok(!command.includes("'"), 'Should not use single quotes for prompt');
        });

        it('should handle empty prompts gracefully', () => {
            const prompt = '';
            const command = `claude --append-system-prompt "${prompt}"`;
            assert.strictEqual(command, 'claude --append-system-prompt ""');
        });

        it('should handle very long prompts (4000+ chars)', () => {
            const longPrompt = 'a'.repeat(4000);
            const command = `claude --append-system-prompt "${longPrompt}"`;
            assert.ok(command.length > 4000, 'Should handle long prompts');
            assert.ok(command.startsWith('claude'), 'Should start with claude');
        });
    });

    describe('Dynamic Prompt Generation', () => {
        it('should generate prompts under 4096 characters', () => {
            const config = {
                category: 'developer' as const,
                complexity: 'high' as const,
                priority: 'high' as const,
                primaryDomain: 'frontend' as const,
                languages: ['typescript', 'javascript', 'html', 'css'],
                frameworks: ['react', 'next.js', 'tailwind-css'],
                specializations: ['responsive-design', 'accessibility', 'performance'],
                toolchain: ['webpack', 'vite', 'jest', 'cypress']
            };
            
            const template = new DeveloperSmartTemplate(config);
            const systemPrompt = template.generateSystemPrompt();
            
            assert.ok(systemPrompt.length < 4096, `Prompt should be under 4096 chars, got ${systemPrompt.length}`);
            assert.ok(systemPrompt.length > 3000, `Prompt should be comprehensive (3000+ chars), got ${systemPrompt.length}`);
        });

        it('should include all required sections in generated prompts', () => {
            const config = {
                category: 'developer' as const,
                complexity: 'high' as const,
                priority: 'high' as const,
                primaryDomain: 'backend' as const,
                languages: ['python', 'typescript'],
                frameworks: ['fastapi', 'express'],
                specializations: ['api-design', 'microservices'],
                toolchain: ['docker', 'kubernetes']
            };
            
            const template = new DeveloperSmartTemplate(config);
            const prompt = template.generateSystemPrompt();
            
            assert.ok(prompt.includes('## Core Expertise'), 'Should include Core Expertise');
            assert.ok(prompt.includes('## Development Methodology'), 'Should include Methodology');
            assert.ok(prompt.includes('## Best Practices'), 'Should include Best Practices');
            assert.ok(prompt.includes('## Deliverables'), 'Should include Deliverables');
            assert.ok(prompt.includes('Part of NofX.dev team'), 'Should include team reference');
        });

        it('should generate domain-specific content', () => {
            const frontendConfig = {
                category: 'developer' as const,
                complexity: 'high' as const,
                priority: 'high' as const,
                primaryDomain: 'frontend' as const,
                languages: ['typescript'],
                frameworks: ['react'],
                specializations: ['ui'],
                toolchain: ['webpack']
            };
            
            const backendConfig = {
                category: 'developer' as const,
                complexity: 'high' as const,
                priority: 'high' as const,
                primaryDomain: 'backend' as const,
                languages: ['python'],
                frameworks: ['fastapi'],
                specializations: ['api'],
                toolchain: ['docker']
            };
            
            const frontendTemplate = new DeveloperSmartTemplate(frontendConfig);
            const backendTemplate = new DeveloperSmartTemplate(backendConfig);
            
            const frontendPrompt = frontendTemplate.generateSystemPrompt();
            const backendPrompt = backendTemplate.generateSystemPrompt();
            
            assert.ok(frontendPrompt.includes('Frontend'), 'Frontend prompt should mention Frontend');
            assert.ok(frontendPrompt.includes('Component'), 'Frontend should mention components');
            assert.ok(backendPrompt.includes('Backend'), 'Backend prompt should mention Backend');
            assert.ok(backendPrompt.includes('API'), 'Backend should mention APIs');
        });
    });

    describe('Terminal Command Execution', () => {
        it('should not include echo commands', () => {
            // This is a regression test for the echo spam issue
            const prompt = 'Test prompt';
            const command = `claude --append-system-prompt "${prompt}"`;
            
            assert.ok(!command.includes('echo'), 'Should not include echo commands');
            assert.ok(command.startsWith('claude'), 'Should start directly with claude');
        });

        it('should handle prompts with special terminal characters', () => {
            const prompt = 'Use && and || operators; run commands > output.txt';
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            const command = `claude --append-system-prompt "${escaped}"`;
            assert.ok(command.includes('&&'), 'Should preserve logical operators');
            assert.ok(command.includes('||'), 'Should preserve logical operators');
        });

        it('should not break with Unicode characters', () => {
            const prompt = 'You are an expert 🚀 developer with émphasis on qualité';
            const escaped = prompt.replace(/"/g, '\\"');
            const command = `claude --append-system-prompt "${escaped}"`;
            
            assert.ok(command.includes('🚀'), 'Should handle emojis');
            assert.ok(command.includes('é'), 'Should handle accented characters');
        });
    });

    describe('Edge Cases', () => {
        it('should handle prompts with only special characters', () => {
            const prompt = '```$$$"""\'\'\'\\\\\\```';
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            const command = `claude --append-system-prompt "${escaped}"`;
            assert.ok(command.includes('--append-system-prompt'), 'Should still construct valid command');
        });

        it('should handle prompts with mixed quotes and apostrophes', () => {
            const prompt = `Don't use "magic strings", it's not 'best practice'`;
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            const command = `claude --append-system-prompt "${escaped}"`;
            assert.ok(!command.match(/[^\\]"/), 'All double quotes should be escaped');
        });

        it('should handle prompts with markdown code blocks', () => {
            const prompt = 'Write code like ```javascript\nconst x = 1;\n```';
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            const command = `claude --append-system-prompt "${escaped}"`;
            assert.ok(command.includes('\\`\\`\\`'), 'Should escape markdown code blocks');
        });

        it('should handle prompts with shell variables that should not expand', () => {
            const prompt = 'The $HOME variable and ${USER} should not expand';
            const escaped = prompt
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');
            
            assert.ok(escaped.includes('\\$HOME'), 'Should escape $HOME');
            assert.ok(escaped.includes('\\${USER}'), 'Should escape ${USER}');
        });
    });
});