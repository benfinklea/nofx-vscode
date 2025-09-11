# Sub-Agent Architecture Documentation

## Overview

The NofX sub-agent system enables AI agents to spawn specialized sub-agents for parallel task execution. This architecture allows agents to delegate specific tasks to purpose-built sub-agents while maintaining coordination through the conductor system.

## Architecture Components

### 1. AI Provider Abstraction Layer

#### Core Interfaces

- **`IAIProvider`**: Abstract interface for AI providers (Claude, OpenAI, Gemini, etc.)
- **`IAIProviderFactory`**: Factory for creating AI provider instances
- **`ClaudeAIProvider`**: Claude-specific implementation with Task tool integration

#### Key Features

- **Multi-AI Support**: Pluggable architecture for different AI providers
- **Sub-Agent Type Discovery**: Each provider reports its available sub-agent types
- **Request Parsing**: AI-specific parsing of sub-agent requests from terminal output
- **Command Generation**: Provider-specific command formatting

### 2. Task Tool Bridge

#### Purpose
Central service that manages sub-agent lifecycle, execution, and queue management.

#### Key Components

- **Task Queue Management**: Priority queues per agent with concurrency limits
- **Process Lifecycle**: Spawn, monitor, and cleanup sub-agent processes
- **Statistics Tracking**: Performance metrics and success/failure rates
- **Event Emission**: Real-time updates on task progress and completion

#### Configuration
```typescript
interface TaskToolBridgeConfig {
    maxConcurrentTasks: number;        // System-wide limit (default: 10)
    maxTasksPerAgent: number;          // Per-agent limit (default: 3)
    defaultTimeout: number;            // Task timeout in ms (default: 300000)
    retryAttempts: number;             // Retry failed tasks (default: 2)
    retryDelay: number;                // Delay between retries (default: 1000)
    aiPath?: string;                   // Path to AI executable
}
```

### 3. Terminal Monitor

#### Purpose
Monitors agent terminals for sub-agent requests and bridges them to the TaskToolBridge.

#### Detection Methods

1. **AI Provider Parsing**: Uses provider-specific parsing for optimal accuracy
2. **JSON Pattern Matching**: `SUB_AGENT_REQUEST: {...}`
3. **Natural Language Patterns**: `REVIEW_CODE:`, `RESEARCH:`, `DELEGATE:`

#### Monitoring Flow

1. **Terminal Registration**: Agent terminals are registered with monitor
2. **Output Buffering**: Terminal output is buffered and analyzed
3. **Request Detection**: Sub-agent requests are identified and parsed
4. **Task Execution**: Requests are forwarded to TaskToolBridge
5. **Result Injection**: Sub-agent results are injected back into terminal

### 4. Message Orchestration

#### New Message Types

- `SPAWN_SUB_AGENT`: Request to spawn a sub-agent
- `SUB_AGENT_STARTED`: Sub-agent execution started
- `SUB_AGENT_PROGRESS`: Progress update from sub-agent
- `SUB_AGENT_RESULT`: Sub-agent task completed
- `SUB_AGENT_ERROR`: Sub-agent task failed
- `CANCEL_SUB_AGENT`: Cancel running sub-agent
- `SUB_AGENT_CANCELLED`: Sub-agent cancellation confirmed

#### Message Flow

```
Conductor ←→ OrchestrationServer ←→ Agent Terminal
    ↓                                      ↓
MessageRouter                      TerminalMonitor
    ↓                                      ↓
TaskToolBridge ←→ AIProvider → Sub-Agent Process
```

## API Reference

### TaskToolBridge API

#### `executeTaskForAgent()`
```typescript
async executeTaskForAgent(
    parentAgentId: string,
    type: SubAgentType,
    description: string,
    prompt: string,
    options?: {
        priority?: number;
        timeout?: number;
        context?: Record<string, any>;
    }
): Promise<TaskResult>
```

#### `cancelTask()`
```typescript
async cancelTask(taskId: string): Promise<void>
```

#### `getStatistics()`
```typescript
getStatistics(): SubAgentStats
```

#### `getAgentTasks()`
```typescript
getAgentTasks(agentId: string): TaskRequest[]
```

### AI Provider API

#### `executeSubAgent()`
```typescript
async executeSubAgent(
    type: string,
    prompt: string,
    options?: SubAgentOptions
): Promise<SubAgentResult>
```

#### `parseSubAgentRequest()`
```typescript
parseSubAgentRequest(text: string): ParsedSubAgentRequest | null
```

#### `getAvailableSubAgentTypes()`
```typescript
getAvailableSubAgentTypes(): SubAgentTypeInfo[]
```

### Conductor Commands

#### JSON Commands for Sub-Agents

```json
// Spawn a sub-agent
{
    "type": "spawn_sub_agent",
    "parentAgentId": "agent-1",
    "subAgentType": "general-purpose",
    "description": "Research API patterns",
    "prompt": "Find best REST API patterns for Node.js applications"
}

// Check sub-agent status
{
    "type": "sub_agent_status",
    "parentAgentId": "agent-1"
}

// Cancel sub-agent
{
    "type": "cancel_sub_agent",
    "parentAgentId": "agent-1",
    "taskId": "task-123"
}
```

## Sub-Agent Types

### Claude Provider Sub-Agents

1. **general-purpose**
   - Research and analysis tasks
   - Code exploration and documentation
   - General problem-solving

2. **code-lead-reviewer**
   - Code review and quality analysis
   - Security vulnerability detection
   - Performance optimization suggestions

3. **statusline-setup**
   - Configure Claude Code status line
   - UI/UX setup tasks

4. **output-style-setup**
   - Create Claude Code output styles
   - Formatting and presentation setup

### Future Provider Support

- **OpenAI GPT-4/GPT-5**: Research agents, code generation
- **Google Gemini**: Multi-modal analysis, document processing
- **Microsoft Copilot**: Enterprise integration, Office automation

## Configuration

### VS Code Settings

```json
{
    "nofx.aiPath": "claude",
    "nofx.subAgents.maxTotal": 10,
    "nofx.subAgents.maxPerAgent": 3,
    "nofx.subAgents.timeout": 300000,
    "nofx.subAgents.retryAttempts": 2,
    "nofx.subAgents.retryDelay": 1000
}
```

### Agent Template Configuration

```json
{
    "subAgentCapabilities": {
        "enabled": true,
        "maxConcurrent": 3,
        "allowedTypes": ["general-purpose", "code-lead-reviewer"],
        "presetTasks": [
            {
                "name": "Code Review",
                "type": "code-lead-reviewer",
                "description": "Review code for quality and security"
            }
        ]
    }
}
```

## Performance Characteristics

### Concurrency Limits

- **System-wide**: Maximum 10 concurrent sub-agents
- **Per-agent**: Maximum 3 concurrent sub-agents
- **Queue depth**: Unlimited (memory permitting)

### Resource Management

- **Memory**: Sub-agents run in separate processes
- **CPU**: Load balanced across available cores
- **I/O**: Asynchronous terminal monitoring and output handling

### Monitoring and Metrics

- **Success Rate**: Percentage of successful task completions
- **Response Times**: Average and percentile response times
- **Resource Usage**: CPU and memory utilization per sub-agent
- **Queue Metrics**: Queue depth and processing rates

## Error Handling

### Common Error Scenarios

1. **AI Provider Unavailable**: Graceful degradation with error messages
2. **Timeout Exceeded**: Automatic task cancellation and cleanup
3. **Resource Limits**: Queue management and prioritization
4. **Parse Failures**: Fallback to pattern-based detection

### Recovery Mechanisms

- **Automatic Retry**: Failed tasks are automatically retried
- **Graceful Degradation**: System continues operating with reduced functionality
- **Error Propagation**: Clear error messages propagated to users
- **Resource Cleanup**: Automatic cleanup of failed processes

## Creating Custom AI Providers

### Overview

NofX supports adding custom AI providers that implement sub-agent capabilities. This allows you to integrate any AI tool that can handle task delegation and parallel execution.

### Implementation Template

Create a new file implementing the `IAIProvider` interface:

```typescript
// src/services/ai/MyCustomAIProvider.ts
import { spawn, ChildProcess } from 'child_process';
import {
    IAIProvider,
    SubAgentTypeInfo,
    SubAgentOptions,
    SubAgentResult,
    ParsedSubAgentRequest,
    AIProviderConfig
} from './IAIProvider';

export class MyCustomAIProvider implements IAIProvider {
    readonly name = 'my-custom-ai';
    readonly version = '1.0.0';
    
    private processes: Map<string, ChildProcess> = new Map();
    
    constructor(private executablePath: string = 'my-ai-tool') {}

    supportsSubAgents(): boolean {
        // Return true if your AI supports sub-agents
        return true;
    }

    getAvailableSubAgentTypes(): SubAgentTypeInfo[] {
        return [
            {
                id: 'researcher',
                name: 'Research Agent',
                description: 'Specialized in research and data analysis',
                capabilities: ['research', 'analysis', 'fact-checking'],
                maxConcurrent: 2
            },
            {
                id: 'coder',
                name: 'Code Generator',
                description: 'Generates and reviews code',
                capabilities: ['code-generation', 'review', 'testing'],
                maxConcurrent: 3
            }
        ];
    }

    async executeSubAgent(
        type: string,
        prompt: string,
        options?: SubAgentOptions
    ): Promise<SubAgentResult> {
        const taskId = `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            // Build command line arguments for your AI tool
            const args = [
                '--mode', 'sub-agent',
                '--type', type,
                '--prompt', prompt
            ];
            
            // Add optional parameters
            if (options?.timeout) {
                args.push('--timeout', options.timeout.toString());
            }
            
            // Spawn your AI process
            const aiProcess = spawn(this.executablePath, args, {
                cwd: options?.workingDirectory || process.cwd(),
                env: { ...process.env, ...options?.environment },
                shell: true
            });

            this.processes.set(taskId, aiProcess);

            let output = '';
            let errorOutput = '';

            aiProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            aiProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            aiProcess.on('close', (code) => {
                this.processes.delete(taskId);
                const duration = Date.now() - startTime;

                resolve({
                    taskId,
                    success: code === 0,
                    result: output.trim(),
                    error: code !== 0 ? errorOutput.trim() : undefined,
                    duration,
                    metadata: { type, exitCode: code }
                });
            });

            aiProcess.on('error', (error) => {
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
        // Format command to start your AI with system prompt
        const escapedPrompt = systemPrompt.replace(/'/g, "'\\''")
        return `${this.executablePath} --system '${escapedPrompt}'`;
    }

    parseSubAgentRequest(text: string): ParsedSubAgentRequest | null {
        // Implement your AI's specific patterns for detecting sub-agent requests
        
        // Example: JSON format detection
        const jsonPattern = /MY_AI_TASK:\s*({[^}]+})/i;
        const jsonMatch = text.match(jsonPattern);
        
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                return {
                    type: parsed.type || 'researcher',
                    description: parsed.description || 'Sub-agent task',
                    prompt: parsed.prompt || parsed.task || '',
                    options: {
                        timeout: parsed.timeout,
                        priority: parsed.priority,
                        context: parsed.context
                    }
                };
            } catch (e) {
                // JSON parse failed
            }
        }

        // Example: Natural language patterns
        const researchPattern = /RESEARCH_THIS:\s*(.+)/is;
        const researchMatch = text.match(researchPattern);
        
        if (researchMatch) {
            return {
                type: 'researcher',
                description: 'Research task',
                prompt: researchMatch[1].trim()
            };
        }

        return null;
    }

    formatSubAgentResponse(result: SubAgentResult): string {
        const header = `\n[${this.name.toUpperCase()} RESULT - ${result.taskId}]\n`;
        const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
        const duration = `Duration: ${(result.duration / 1000).toFixed(2)}s`;
        
        return `${header}Status: ${status}\n${duration}\n---\n${result.result || result.error}\n---\n`;
    }

    async isAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const testProcess = spawn(this.executablePath, ['--version'], {
                shell: true,
                timeout: 5000
            });

            testProcess.on('close', (code) => {
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
            maxConcurrentSubAgents: 5,
            supportedFeatures: [
                'sub-agents',
                'parallel-execution',
                'task-delegation',
                'research',
                'code-generation'
            ],
            environmentVariables: {
                MY_AI_SUB_AGENTS_ENABLED: 'true'
            }
        };
    }
}
```

### Registration

Register your custom provider in the extension activation:

```typescript
// In extension.ts or your initialization code
import { MyCustomAIProvider } from './services/ai/MyCustomAIProvider';
import { getAIProviderFactory } from './services/ai/AIProviderFactory';

// Register your provider
const factory = getAIProviderFactory(loggingService);
factory.registerProvider('my-custom-ai', () => new MyCustomAIProvider());
```

### Configuration

Users can then configure NofX to use your AI provider:

```json
{
    "nofx.aiPath": "my-custom-ai"
}
```

Or with a custom path:

```json
{
    "nofx.aiPath": "/path/to/my-custom-ai-tool"
}
```

### Testing Your Provider

Create unit tests for your provider:

```typescript
// test/MyCustomAIProvider.test.ts
import { MyCustomAIProvider } from '../src/services/ai/MyCustomAIProvider';

describe('MyCustomAIProvider', () => {
    let provider: MyCustomAIProvider;

    beforeEach(() => {
        provider = new MyCustomAIProvider('mock-ai-tool');
    });

    test('should support sub-agents', () => {
        expect(provider.supportsSubAgents()).toBe(true);
    });

    test('should parse sub-agent requests', () => {
        const text = 'RESEARCH_THIS: Find information about TypeScript';
        const request = provider.parseSubAgentRequest(text);
        
        expect(request).toEqual({
            type: 'researcher',
            description: 'Research task',
            prompt: 'Find information about TypeScript'
        });
    });

    test('should return available sub-agent types', () => {
        const types = provider.getAvailableSubAgentTypes();
        expect(types).toHaveLength(2);
        expect(types[0].id).toBe('researcher');
        expect(types[1].id).toBe('coder');
    });
});
```

### Best Practices

1. **Error Handling**: Always handle process errors gracefully
2. **Timeouts**: Implement proper timeout handling for long-running tasks
3. **Resource Cleanup**: Clean up processes and resources on completion/cancellation
4. **Logging**: Use appropriate logging levels for debugging
5. **Pattern Matching**: Make sub-agent request patterns distinctive but intuitive
6. **Documentation**: Document your AI's specific command format and capabilities

### AI Provider Checklist

- [ ] Implement all `IAIProvider` interface methods
- [ ] Handle process spawning and management
- [ ] Implement request parsing patterns
- [ ] Add proper error handling and timeouts
- [ ] Create unit tests
- [ ] Document command line interface
- [ ] Register provider in factory
- [ ] Test integration with NofX

## Integration Points

### Extensions

```typescript
// Register custom AI provider
const factory = getAIProviderFactory(loggingService);
factory.registerProvider('custom-ai', () => new CustomAIProvider());
```

### Webhooks and Events

```typescript
// Listen for sub-agent events
terminalMonitor.on('subAgentRequestDetected', (event) => {
    console.log(`Sub-agent request from ${event.agentId}`);
});

taskToolBridge.on('taskCompleted', (result) => {
    console.log(`Task ${result.id} completed with status ${result.status}`);
});
```

## Testing

### Unit Tests

- **TaskToolBridge**: Queue management, process lifecycle
- **TerminalMonitor**: Request detection, result injection
- **AIProvider**: Request parsing, command generation
- **MessageRouter**: Sub-agent message routing

### Integration Tests

- **End-to-end Sub-agent Flow**: From detection to result
- **Conductor Integration**: JSON command processing
- **Multi-provider Support**: Different AI provider interactions

### Performance Tests

- **Concurrency Stress Testing**: Maximum concurrent sub-agents
- **Memory Leak Detection**: Long-running sub-agent operations
- **Response Time Benchmarks**: Sub-agent execution performance

## Security Considerations

### Process Isolation

- Sub-agents run in separate processes with limited privileges
- Working directory restrictions
- Environment variable sanitization

### Input Validation

- Prompt sanitization and length limits
- JSON schema validation for commands
- Path traversal prevention

### Resource Limits

- CPU and memory quotas per sub-agent
- Maximum execution time enforcement
- File system access restrictions

## Future Enhancements

### Planned Features

1. **Multi-AI Orchestration**: Sub-agents using different AI providers simultaneously
2. **Persistent Sub-Agents**: Long-running sub-agents for complex tasks
3. **Sub-Agent Communication**: Direct agent-to-agent communication protocols
4. **Cloud Integration**: Remote sub-agent execution in cloud environments
5. **Custom Sub-Agent Types**: User-defined sub-agent specializations

### Architecture Evolution

1. **Distributed Architecture**: Sub-agents across multiple machines
2. **Container-Based Isolation**: Docker/Podman for enhanced security
3. **GraphQL API**: Rich query interface for sub-agent management
4. **Real-time Dashboard**: Live visualization of sub-agent activities

---

*This architecture enables unprecedented parallel AI agent collaboration while maintaining clean abstractions for multi-provider support.*