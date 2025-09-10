/**
 * Integration tests for agent creation with prompt injection
 * Tests the full flow from agent creation to terminal command execution
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AgentManager } from '../../agents/AgentManager';
import { AgentTemplateManager } from '../../agents/AgentTemplateManager';
import { TerminalManager } from '../../services/TerminalManager';
import { ConfigurationService } from '../../services/ConfigurationService';
import { LoggingService } from '../../services/LoggingService';
import { ServiceLocator } from '../../services/ServiceLocator';
import { DeveloperSmartTemplate, DeveloperConfig } from '../../agents/SmartTemplateSystem';

describe('Agent Prompt Injection Integration Tests', () => {
    let agentManager: AgentManager;
    let terminalManager: TerminalManager;
    let templateManager: AgentTemplateManager;
    let configService: ConfigurationService;
    let loggingService: LoggingService;
    let sandbox: sinon.SinonSandbox;
    let mockTerminal: any;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Setup mock terminal
        mockTerminal = {
            name: 'test-terminal',
            processId: Promise.resolve(1234),
            creationOptions: {},
            exitStatus: undefined,
            state: { isInteractedWith: false },
            sendText: sandbox.stub(),
            show: sandbox.stub(),
            hide: sandbox.stub(),
            dispose: sandbox.stub()
        };

        // Stub vscode.window.createTerminal
        sandbox.stub(vscode.window, 'createTerminal').returns(mockTerminal);

        // Setup services
        configService = new ConfigurationService();
        const mainChannel = vscode.window.createOutputChannel('NofX Test');
        loggingService = new LoggingService(configService as any, mainChannel);
        terminalManager = new TerminalManager(configService as any, loggingService);
        templateManager = new AgentTemplateManager();
        
        // Register services
        ServiceLocator.register('configService', configService);
        ServiceLocator.register('loggingService', loggingService);
        ServiceLocator.register('terminalManager', terminalManager);
        ServiceLocator.register('templateManager', templateManager);
        
        agentManager = new AgentManager();
    });

    afterEach(() => {
        sandbox.restore();
        ServiceLocator.clear();
    });

    describe('Full Agent Creation Flow', () => {
        it('should create agent with dynamic prompt and inject into terminal', async () => {
            // Stub config
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            // Create agent with frontend specialization
            const agentId = await agentManager.createAgent('frontend-developer', 'Frontend Expert');
            
            assert.ok(agentId, 'Should return agent ID');
            
            // Verify terminal was created with proper command
            assert.ok(mockTerminal.sendText.called, 'Should send command to terminal');
            
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            
            // Verify command structure
            assert.ok(sentCommand.includes('claude'), 'Should include claude');
            assert.ok(sentCommand.includes('--dangerously-skip-permissions'), 'Should include permissions flag');
            assert.ok(sentCommand.includes('--append-system-prompt'), 'Should include append-system-prompt');
            
            // Verify it's using double quotes
            assert.ok(sentCommand.includes('"'), 'Should use double quotes');
            
            // Should not have echo commands
            assert.ok(!sentCommand.includes('echo'), 'Should not include echo commands');
        });

        it('should generate comprehensive prompts for different agent types', async () => {
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(false);

            // Test different agent types
            const agentTypes = [
                'frontend-developer',
                'backend-specialist',
                'fullstack-developer',
                'testing-specialist'
            ];

            for (const type of agentTypes) {
                mockTerminal.sendText.resetHistory();
                
                const agentId = await agentManager.createAgent(type, `${type} Agent`);
                assert.ok(agentId, `Should create ${type} agent`);
                
                const sentCommand = mockTerminal.sendText.firstCall?.args[0] || '';
                
                // Verify prompt contains type-specific content
                if (type.includes('frontend')) {
                    assert.ok(sentCommand.toLowerCase().includes('frontend'), 
                        `Frontend agent prompt should mention frontend`);
                } else if (type.includes('backend')) {
                    assert.ok(sentCommand.toLowerCase().includes('backend'), 
                        `Backend agent prompt should mention backend`);
                } else if (type.includes('fullstack')) {
                    assert.ok(sentCommand.toLowerCase().includes('fullstack'), 
                        `Fullstack agent prompt should mention fullstack`);
                } else if (type.includes('testing')) {
                    assert.ok(sentCommand.toLowerCase().includes('test'), 
                        `Testing agent prompt should mention testing`);
                }
            }
        });

        it('should handle agent creation with custom templates', async () => {
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            // Create custom template
            const customTemplate = {
                id: 'custom-agent',
                name: 'Custom Agent',
                icon: '🔧',
                terminalIcon: 'gear',
                color: '#3498DB',
                description: 'Custom specialized agent',
                version: '1.0.0',
                systemPrompt: 'You are a custom agent with "special" `powers` and $skills',
                detailedPrompt: '',
                capabilities: { custom: true },
                taskPreferences: {
                    preferred: ['custom-tasks'],
                    avoid: [],
                    priority: 'high' as const,
                    complexity: 'high'
                }
            };

            // Stub template manager to return custom template
            sandbox.stub(templateManager, 'getTemplate').returns(customTemplate);

            const agentId = await agentManager.createAgent('custom-agent', 'Custom Agent');
            
            assert.ok(agentId, 'Should create custom agent');
            assert.ok(mockTerminal.sendText.called, 'Should send command');
            
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            
            // Verify special characters are escaped
            assert.ok(sentCommand.includes('\\"special\\"'), 'Should escape double quotes');
            assert.ok(sentCommand.includes('\\`powers\\`'), 'Should escape backticks');
            assert.ok(sentCommand.includes('\\$skills'), 'Should escape dollar signs');
        });
    });

    describe('Dynamic Template System Integration', () => {
        it('should integrate SmartTemplateSystem with AgentManager', async () => {
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            // Create a dynamic template
            const config: DeveloperConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'frontend',
                languages: ['typescript', 'javascript'],
                frameworks: ['react', 'next.js'],
                specializations: ['performance', 'accessibility'],
                toolchain: ['webpack', 'jest']
            };

            const smartTemplate = new DeveloperSmartTemplate(config);
            const generatedTemplate = smartTemplate.generateTemplate();

            // Stub template manager to return generated template
            sandbox.stub(templateManager, 'getTemplate').returns(generatedTemplate);

            const agentId = await agentManager.createAgent('dynamic-frontend', 'Dynamic Agent');
            
            assert.ok(agentId, 'Should create agent with dynamic template');
            
            const sentCommand = mockTerminal.sendText.firstCall?.args[0] || '';
            
            // Verify comprehensive prompt was generated
            assert.ok(sentCommand.length > 3000, 'Should have comprehensive prompt');
            assert.ok(sentCommand.includes('## Core Expertise'), 'Should include core expertise section');
            assert.ok(sentCommand.includes('## Development Methodology'), 'Should include methodology');
            assert.ok(sentCommand.includes('typescript'), 'Should include specified languages');
            assert.ok(sentCommand.includes('react'), 'Should include specified frameworks');
        });

        it('should generate different prompts for different configurations', async () => {
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            const frontendConfig: DeveloperConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'frontend',
                languages: ['typescript'],
                frameworks: ['vue'],
                specializations: ['ui-design'],
                toolchain: ['vite']
            };

            const backendConfig: DeveloperConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'backend',
                languages: ['python'],
                frameworks: ['fastapi'],
                specializations: ['api-design'],
                toolchain: ['docker']
            };

            // Test frontend
            const frontendTemplate = new DeveloperSmartTemplate(frontendConfig);
            sandbox.stub(templateManager, 'getTemplate')
                .onFirstCall().returns(frontendTemplate.generateTemplate());

            const frontendId = await agentManager.createAgent('frontend', 'Frontend');
            const frontendCommand = mockTerminal.sendText.firstCall.args[0];

            // Reset for backend test
            mockTerminal.sendText.resetHistory();
            templateManager.getTemplate.restore();
            
            // Test backend
            const backendTemplate = new DeveloperSmartTemplate(backendConfig);
            sandbox.stub(templateManager, 'getTemplate')
                .returns(backendTemplate.generateTemplate());

            const backendId = await agentManager.createAgent('backend', 'Backend');
            const backendCommand = mockTerminal.sendText.firstCall.args[0];

            // Verify different content
            assert.ok(frontendCommand.includes('vue'), 'Frontend should mention Vue');
            assert.ok(backendCommand.includes('fastapi'), 'Backend should mention FastAPI');
            assert.ok(frontendCommand.includes('Frontend'), 'Frontend should be domain-specific');
            assert.ok(backendCommand.includes('Backend'), 'Backend should be domain-specific');
        });
    });

    describe('Error Recovery', () => {
        it('should handle prompt generation failures gracefully', async () => {
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            // Make template generation fail
            const brokenTemplate = {
                id: 'broken',
                name: 'Broken',
                systemPrompt: null as any, // Invalid prompt
                detailedPrompt: undefined as any
            };

            sandbox.stub(templateManager, 'getTemplate').returns(brokenTemplate as any);

            // Should still create agent with fallback
            const agentId = await agentManager.createAgent('broken', 'Broken Agent');
            assert.ok(agentId, 'Should create agent even with broken template');
            
            // Should send some command
            assert.ok(mockTerminal.sendText.called, 'Should still send command');
        });

        it('should handle terminal creation failures', async () => {
            // Make terminal creation fail
            vscode.window.createTerminal = sandbox.stub().throws(new Error('Terminal failed'));

            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            try {
                await agentManager.createAgent('test', 'Test Agent');
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Terminal failed'), 'Should propagate terminal error');
            }
        });
    });

    describe('Prompt Length Validation', () => {
        it('should ensure prompts stay under CLI limit', async () => {
            sandbox.stub(configService, 'getAiPath').returns('claude');
            sandbox.stub(configService, 'isClaudeSkipPermissions').returns(true);

            // Create config that would generate long prompt
            const config: DeveloperConfig = {
                category: 'developer',
                complexity: 'high',
                priority: 'high',
                primaryDomain: 'fullstack',
                languages: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
                frameworks: ['react', 'vue', 'angular', 'express', 'fastapi', 'spring'],
                specializations: ['everything', 'all-things', 'master-of-all'],
                toolchain: ['docker', 'kubernetes', 'terraform', 'jenkins', 'github']
            };

            const template = new DeveloperSmartTemplate(config);
            const generated = template.generateTemplate();
            
            // Verify prompt length
            assert.ok(generated.systemPrompt.length < 4096, 
                `System prompt should be under 4096 chars, got ${generated.systemPrompt.length}`);
            
            sandbox.stub(templateManager, 'getTemplate').returns(generated);

            const agentId = await agentManager.createAgent('fullstack', 'Fullstack');
            assert.ok(agentId, 'Should create agent with long prompt');
            
            const sentCommand = mockTerminal.sendText.firstCall.args[0];
            
            // Total command should still be reasonable
            assert.ok(sentCommand.length < 5000, 
                `Total command should be reasonable, got ${sentCommand.length}`);
        });
    });
});