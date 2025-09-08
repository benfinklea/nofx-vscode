import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.TEST_PORT || '7777', 10);
let wss: WebSocketServer;

// Global state for test server
declare global {
    var worktreesEnabled: boolean;
}
global.worktreesEnabled = false;

async function startTestServer() {
    console.log('Starting E2E test server...');

    // Create HTTP server first
    const httpServer = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy', wsPort: PORT }));
        } else if (req.url === '/dashboard') {
            const dashboardPath = path.join(__dirname, '../../../webview/dashboard.html');
            if (fs.existsSync(dashboardPath)) {
                const content = fs.readFileSync(dashboardPath, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><div id="dashboard">Test Dashboard</div></body></html>');
            }
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    // Create WebSocket server attached to HTTP server
    wss = new WebSocketServer({ server: httpServer });

    // Simple WebSocket handling for tests
    wss.on('connection', ws => {
        console.log('WebSocket client connected');
        let messageCount = 0;
        let lastMessageTime = Date.now();

        // Send connection established message
        ws.send(
            JSON.stringify({
                type: 'connection_established',
                payload: { timestamp: Date.now() }
            })
        );

        ws.on('message', data => {
            // Simple rate limiting for tests
            messageCount++;
            const now = Date.now();
            if (now - lastMessageTime < 1000 && messageCount > 50) {
                ws.send(
                    JSON.stringify({
                        type: 'rate_limit_warning',
                        payload: {
                            message: 'Rate limit exceeded',
                            timestamp: now
                        }
                    })
                );
                return;
            }
            if (now - lastMessageTime > 1000) {
                messageCount = 0;
                lastMessageTime = now;
            }
            try {
                const message = JSON.parse(data.toString());
                console.log('Received message:', message.type);

                // Check for invalid message format
                if (!message.type) {
                    ws.send(
                        JSON.stringify({
                            type: 'system_error',
                            payload: {
                                error: 'Invalid message format',
                                timestamp: Date.now()
                            }
                        })
                    );
                    return;
                }

                // Echo back for testing
                if (message.type === 'heartbeat') {
                    ws.send(
                        JSON.stringify({
                            type: 'heartbeat',
                            payload: { timestamp: Date.now() }
                        })
                    );
                }

                // Handle other message types as needed for tests
                handleTestMessage(ws, message);
            } catch (error) {
                console.error('Error handling message:', error);
                // Send error for invalid JSON
                ws.send(
                    JSON.stringify({
                        type: 'system_error',
                        payload: {
                            error: 'Invalid message format',
                            timestamp: Date.now()
                        }
                    })
                );
            }
        });

        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
    });

    httpServer.listen(PORT, () => {
        console.log(`E2E test server running on http://localhost:${PORT}`);
        console.log(`WebSocket server running on ws://localhost:${PORT}`);
    });

    process.on('SIGTERM', () => {
        console.log('Shutting down test server...');
        wss.close();
        httpServer.close();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('Shutting down test server...');
        wss.close();
        httpServer.close();
        process.exit(0);
    });
}

function handleTestMessage(ws: any, message: any) {
    // Handle specific test message types
    switch (message.type) {
        case 'conductor_register':
        case 'agent_register':
            // Registration acknowledged
            ws.send(
                JSON.stringify({
                    type: 'system_ack',
                    payload: {
                        id: message.payload.id,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'spawn_agent':
            const agentId = 'agent-' + Date.now();
            ws.send(
                JSON.stringify({
                    type: 'agent_ready',
                    payload: {
                        agentId: agentId,
                        name: message.payload.name,
                        timestamp: Date.now()
                    }
                })
            );
            // If worktrees are enabled, send worktree created message
            if (global.worktreesEnabled) {
                setTimeout(() => {
                    ws.send(
                        JSON.stringify({
                            type: 'worktree_created',
                            payload: {
                                agentId: agentId,
                                path: `/mock/.nofx-worktrees/${agentId}`,
                                branch: `agent-${message.payload.name}-${Date.now()}`,
                                success: true,
                                timestamp: Date.now()
                            }
                        })
                    );
                }, 100);
            }
            break;
        case 'assign_task':
            ws.send(
                JSON.stringify({
                    type: 'task_progress',
                    payload: {
                        agentId: message.payload.agentId,
                        taskId: message.payload.taskId || 'task-' + Date.now(),
                        status: 'in_progress',
                        timestamp: Date.now()
                    }
                })
            );
            // Simulate task completion after delay
            setTimeout(() => {
                ws.send(
                    JSON.stringify({
                        type: 'task_complete',
                        payload: {
                            agentId: message.payload.agentId,
                            taskId: message.payload.taskId || 'task-' + Date.now(),
                            success: true,
                            timestamp: Date.now()
                        }
                    })
                );
            }, 1000);
            break;
        case 'agent_reconnect':
            ws.send(
                JSON.stringify({
                    type: 'reconnect_ack',
                    payload: {
                        agentId: message.payload.id,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'broadcast':
            // Echo broadcast to all (simplified for testing)
            ws.send(JSON.stringify(message));
            break;
        case 'create_task':
            ws.send(
                JSON.stringify({
                    type: 'task_created',
                    payload: {
                        taskId: message.payload.taskId,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'data_transfer':
            ws.send(
                JSON.stringify({
                    type: 'data_received',
                    payload: {
                        id: message.payload.id,
                        size: message.payload.size,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'query_status':
            ws.send(
                JSON.stringify({
                    type: 'agent_status',
                    payload: {
                        agentId: message.payload.agentId,
                        status: 'idle',
                        name: 'Test Agent',
                        type: 'testing-specialist',
                        taskCount: 1,
                        completedTasks: 1,
                        failedTasks: 0,
                        cancelledTasks: 0,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'auto_assign_task':
            // Mock auto-assignment
            ws.send(
                JSON.stringify({
                    type: 'task_progress',
                    payload: {
                        agentId: 'agent-auto',
                        taskId: 'task-' + Date.now(),
                        status: 'in_progress',
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'queue_task':
            // Acknowledge queued task
            ws.send(
                JSON.stringify({
                    type: 'system_ack',
                    payload: {
                        taskId: message.payload.taskId,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'process_queue':
            // Start processing queued tasks
            ws.send(
                JSON.stringify({
                    type: 'task_progress',
                    payload: {
                        agentId: message.payload.agentId,
                        status: 'processing_queue',
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'cancel_task':
            ws.send(
                JSON.stringify({
                    type: 'task_cancelled',
                    payload: {
                        taskId: message.payload.taskId,
                        rollbackComplete: true,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'get_task_result':
            ws.send(
                JSON.stringify({
                    type: 'task_result',
                    payload: {
                        taskId: message.payload.taskId,
                        result: { success: true },
                        input: {},
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'get_agent_metrics':
            ws.send(
                JSON.stringify({
                    type: 'agent_metrics',
                    payload: {
                        agentId: message.payload.agentId,
                        totalTasks: 3,
                        completedTasks: 3,
                        averageCompletionTime: 1000,
                        successRate: 100,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'update_agent_template':
            ws.send(
                JSON.stringify({
                    type: 'agent_template_updated',
                    payload: {
                        agentId: message.payload.agentId,
                        version: message.payload.templateUpdate?.version || '2.1.0',
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'enable_worktrees':
            global.worktreesEnabled = true;
            ws.send(
                JSON.stringify({
                    type: 'system_ack',
                    payload: {
                        enabled: true,
                        workspace: message.payload.workspace,
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'terminate_agent':
            // Send worktree removed if enabled
            if (global.worktreesEnabled) {
                ws.send(
                    JSON.stringify({
                        type: 'worktree_removed',
                        payload: {
                            agentId: message.payload.agentId,
                            timestamp: Date.now()
                        }
                    })
                );
            }
            break;
        case 'merge_agent_work':
            ws.send(
                JSON.stringify({
                    type: 'worktree_merged',
                    payload: {
                        success: true,
                        filesChanged: 'feature.js',
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'get_worktree_metrics':
            ws.send(
                JSON.stringify({
                    type: 'worktree_metrics',
                    payload: {
                        totalWorktrees: 3,
                        activeWorktrees: 3,
                        diskUsage: 1024000,
                        branches: ['agent-1', 'agent-2', 'agent-3'],
                        timestamp: Date.now()
                    }
                })
            );
            break;
        case 'create_task_chain':
            // Acknowledge task chain creation
            message.payload.tasks.forEach((task: any) => {
                ws.send(
                    JSON.stringify({
                        type: 'task_created',
                        payload: {
                            taskId: task.id,
                            timestamp: Date.now()
                        }
                    })
                );
            });
            // Simulate completion in order
            setTimeout(() => {
                message.payload.tasks.forEach((task: any, index: number) => {
                    setTimeout(
                        () => {
                            ws.send(
                                JSON.stringify({
                                    type: 'task_complete',
                                    payload: {
                                        taskId: task.id,
                                        success: true,
                                        timestamp: Date.now()
                                    }
                                })
                            );
                        },
                        (index + 1) * 500
                    );
                });
            }, 1000);
            break;
        default:
            // Echo unknown messages back with system_error for validation tests
            if (!['heartbeat', 'connection_established'].includes(message.type)) {
                ws.send(
                    JSON.stringify({
                        type: 'system_error',
                        payload: {
                            error: `Unknown message type: ${message.type}`,
                            timestamp: Date.now()
                        }
                    })
                );
            }
    }
}

startTestServer().catch(error => {
    console.error('Failed to start test server:', error);
    process.exit(1);
});
