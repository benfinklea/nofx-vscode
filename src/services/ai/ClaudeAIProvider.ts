import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import {
    IAIProvider,
    SubAgentTypeInfo,
    SubAgentOptions,
    SubAgentResult,
    ParsedSubAgentRequest,
    AIProviderConfig
} from './IAIProvider';

/**
 * Claude AI Provider implementation
 * Handles Claude-specific sub-agent execution and command formatting
 */
export class ClaudeAIProvider implements IAIProvider {
    readonly name = 'claude';
    readonly version = '1.0.0';

    private processes: Map<string, ChildProcess> = new Map();

    constructor(private executablePath: string = 'claude') {}

    supportsSubAgents(): boolean {
        return true;
    }

    getAvailableSubAgentTypes(): SubAgentTypeInfo[] {
        return [
            {
                id: 'general-purpose',
                name: 'General Purpose Agent',
                description: 'Versatile agent for research, code analysis, and general tasks',
                capabilities: ['research', 'analysis', 'code-review', 'documentation'],
                maxConcurrent: 3
            },
            {
                id: 'code-lead-reviewer',
                name: 'Code Lead Reviewer',
                description: 'Specialized agent for code review and quality assurance',
                capabilities: ['code-review', 'testing', 'refactoring', 'best-practices'],
                maxConcurrent: 2
            },
            {
                id: 'statusline-setup',
                name: 'Status Line Setup',
                description: 'Configure Claude Code status line settings',
                capabilities: ['configuration', 'setup'],
                maxConcurrent: 1
            },
            {
                id: 'output-style-setup',
                name: 'Output Style Setup',
                description: 'Create Claude Code output styles',
                capabilities: ['configuration', 'styling'],
                maxConcurrent: 1
            }
        ];
    }

    async executeSubAgent(type: string, prompt: string, options?: SubAgentOptions): Promise<SubAgentResult> {
        const taskId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const timeout = options?.timeout || 120000; // 2 minutes default

            // Build the command for Claude's Task tool
            const taskCommand = this.buildTaskCommand(type, prompt, options);

            // Execute via Claude CLI
            const aiProcess = spawn(this.executablePath, ['--task', type, '--prompt', prompt], {
                cwd: options?.workingDirectory || process.cwd(),
                env: { ...process.env, ...options?.environment },
                shell: true
            });

            this.processes.set(taskId, aiProcess);

            let output = '';
            let errorOutput = '';
            let timeoutHandle: NodeJS.Timeout;

            // Set timeout
            timeoutHandle = setTimeout(() => {
                aiProcess.kill('SIGTERM');
                this.processes.delete(taskId);
                reject(new Error(`Sub-agent task timed out after ${timeout}ms`));
            }, timeout);

            aiProcess.stdout.on('data', data => {
                output += data.toString();
            });

            aiProcess.stderr.on('data', data => {
                errorOutput += data.toString();
            });

            aiProcess.on('close', code => {
                clearTimeout(timeoutHandle);
                this.processes.delete(taskId);

                const duration = Date.now() - startTime;

                if (code === 0) {
                    resolve({
                        taskId,
                        success: true,
                        result: output.trim(),
                        duration,
                        metadata: { type, exitCode: code }
                    });
                } else {
                    resolve({
                        taskId,
                        success: false,
                        result: output.trim(),
                        error: errorOutput.trim() || `Process exited with code ${code}`,
                        duration,
                        metadata: { type, exitCode: code }
                    });
                }
            });

            aiProcess.on('error', error => {
                clearTimeout(timeoutHandle);
                this.processes.delete(taskId);
                reject(error);
            });
        });
    }

    async cancelSubAgent(taskId: string): Promise<void> {
        const process = this.processes.get(taskId);
        if (process) {
            process.kill('SIGTERM');
            this.processes.delete(taskId);
        }
    }

    getAICommand(systemPrompt: string): string {
        // Escape single quotes in the prompt for shell
        const escapedPrompt = systemPrompt.replace(/'/g, "'\\''");
        return `${this.executablePath} --append-system-prompt '${escapedPrompt}'`;
    }

    parseSubAgentRequest(text: string): ParsedSubAgentRequest | null {
        // Pattern 1: JSON format with subagent or task field
        const jsonPattern = /\{[^{}]*(?:"subagent"|"task"|"sub_agent"|"sub-agent")[^{}]*\}/i;
        const jsonMatch = text.match(jsonPattern);

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.subagent || parsed.task || parsed.sub_agent || parsed['sub-agent']) {
                    const taskInfo = parsed.subagent || parsed.task || parsed.sub_agent || parsed['sub-agent'];
                    return {
                        type: taskInfo.type || 'general-purpose',
                        description: taskInfo.description || taskInfo.name || 'Sub-agent task',
                        prompt: taskInfo.prompt || taskInfo.task || parsed.prompt || '',
                        options: {
                            timeout: taskInfo.timeout,
                            priority: taskInfo.priority,
                            context: taskInfo.context
                        }
                    };
                }
            } catch (e) {
                // JSON parse failed, continue to other patterns
            }
        }

        // Pattern 2: Natural language patterns for code review
        const reviewPattern =
            /(?:REVIEW_CODE|CODE_REVIEW|Please review|Review this code|Check this implementation):\s*(.+)/is;
        const reviewMatch = text.match(reviewPattern);

        if (reviewMatch) {
            return {
                type: 'code-lead-reviewer',
                description: 'Code review request',
                prompt: reviewMatch[1].trim(),
                options: { priority: 3 }
            };
        }

        // Pattern 3: Research/investigation patterns
        const researchPattern = /(?:RESEARCH|INVESTIGATE|Find out|Look into|Research):\s*(.+)/is;
        const researchMatch = text.match(researchPattern);

        if (researchMatch) {
            return {
                type: 'general-purpose',
                description: 'Research task',
                prompt: researchMatch[1].trim(),
                options: { priority: 2 }
            };
        }

        // Pattern 4: Task delegation patterns
        const delegatePattern = /(?:DELEGATE|SPAWN_TASK|Create sub-?agent|Delegate to sub-?agent)(?:\s+for)?:\s*(.+)/is;
        const delegateMatch = text.match(delegatePattern);

        if (delegateMatch) {
            return {
                type: 'general-purpose',
                description: 'Delegated task',
                prompt: delegateMatch[1].trim(),
                options: { priority: 2 }
            };
        }

        return null;
    }

    formatSubAgentResponse(result: SubAgentResult): string {
        const header = `\n[SUB-AGENT RESULT - ${result.taskId}]\n`;
        const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
        const duration = `Duration: ${(result.duration / 1000).toFixed(2)}s`;

        let response = header;
        response += `Status: ${status}\n`;
        response += `${duration}\n`;
        response += '---\n';
        response += result.result || result.error || 'No output';
        response += '\n---\n';

        return response;
    }

    async isAvailable(): Promise<boolean> {
        return new Promise(resolve => {
            const testProcess = spawn(this.executablePath, ['--version'], {
                shell: true,
                timeout: 5000
            });

            testProcess.on('close', code => {
                resolve(code === 0);
            });

            testProcess.on('error', () => {
                resolve(false);
            });
        });
    }

    getConfiguration(): AIProviderConfig {
        return {
            executablePath: this.executablePath,
            defaultTimeout: 120000,
            maxConcurrentSubAgents: 10,
            supportedFeatures: ['sub-agents', 'parallel-execution', 'task-delegation', 'code-review', 'research'],
            environmentVariables: {
                CLAUDE_SUB_AGENTS_ENABLED: 'true'
            }
        };
    }

    private buildTaskCommand(type: string, prompt: string, options?: SubAgentOptions): string {
        // Build command line arguments for Claude's Task tool
        const args = ['--task', type];

        if (options?.timeout) {
            args.push('--timeout', options.timeout.toString());
        }

        if (options?.context) {
            args.push('--context', JSON.stringify(options.context));
        }

        // Add the prompt last
        args.push('--prompt', prompt);

        return args.join(' ');
    }
}
