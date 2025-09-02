import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import { 
    OrchestratorMessage, 
    MessageType, 
    ClientConnection,
    createMessage,
    isValidMessage,
    generateMessageId
} from './MessageProtocol';

export class OrchestrationServer {
    private wss: WebSocketServer | undefined;
    private connections: Map<string, WebSocket> = new Map();
    private clients: Map<string, ClientConnection> = new Map();
    private messageHistory: OrchestratorMessage[] = [];
    private port: number;
    private actualPort: number = 0;
    private outputChannel: vscode.OutputChannel;
    private dashboardCallback?: (message: OrchestratorMessage) => void;
    private maxHistorySize = 1000;
    private heartbeatInterval: NodeJS.Timeout | undefined;
    private isRunning = false;
    
    constructor(port: number = 7777) {
        this.port = port;
        this.outputChannel = vscode.window.createOutputChannel('NofX Orchestration');
    }
    
    /**
     * Start the WebSocket server
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            this.log('Server already running on port ' + this.actualPort);
            return;
        }
        
        // Try multiple ports if default is taken
        const portsToTry = [this.port, 7778, 7779, 7780, 8888, 8889, 9999];
        let started = false;
        
        for (const port of portsToTry) {
            try {
                await this.tryStartOnPort(port);
                this.actualPort = port;
                started = true;
                break;
            } catch (error: any) {
                if (error.code === 'EADDRINUSE') {
                    this.log(`Port ${port} in use, trying next...`, 'warn');
                    continue;
                }
                // Other errors, stop trying
                this.log(`Failed to start on port ${port}: ${error.message}`, 'error');
                throw error;
            }
        }
        
        if (!started) {
            const errorMsg = 'Could not find available port for orchestration server';
            this.log(errorMsg, 'error');
            vscode.window.showErrorMessage(errorMsg);
            throw new Error(errorMsg);
        }
        
        this.isRunning = true;
        
        // Start heartbeat checking
        this.startHeartbeatMonitor();
        
        this.log(`🚀 Orchestration server started on ws://localhost:${this.actualPort}`);
        this.outputChannel.show();
        
        // Send system message
        this.broadcastSystemMessage('Orchestration server online');
    }
    
    /**
     * Try to start server on specific port
     */
    private async tryStartOnPort(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.wss = new WebSocketServer({ 
                    port: port,
                    host: 'localhost'
                });
                
                this.wss.on('connection', (ws: WebSocket, req) => {
                    this.handleConnection(ws, req);
                });
                
                this.wss.on('error', (error: any) => {
                    // Only show error if not EADDRINUSE (we handle that silently)
                    if (error.code !== 'EADDRINUSE') {
                        this.log(`Server error on port ${port}: ${error.message}`, 'error');
                    }
                    this.wss?.close();
                    this.wss = undefined;
                    reject(error);
                });
                
                this.wss.on('listening', () => {
                    resolve();
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Stop the WebSocket server
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        
        // Close all connections
        this.connections.forEach((ws, id) => {
            try {
                ws.close(1000, 'Server shutting down');
            } catch (e) {
                // Ignore errors during shutdown
            }
        });
        
        if (this.wss) {
            this.wss.close(() => {
                this.log('Server stopped');
            });
            this.wss = undefined;
        }
        
        this.connections.clear();
        this.clients.clear();
        this.isRunning = false;
        this.actualPort = 0;
    }
    
    /**
     * Get the actual port the server is running on
     */
    getPort(): number {
        return this.actualPort;
    }
    
    /**
     * Handle new WebSocket connection
     */
    private handleConnection(ws: WebSocket, req: any): void {
        const clientId = generateMessageId();
        const clientIp = req.socket.remoteAddress;
        
        this.log(`New connection from ${clientIp} (assigned ID: ${clientId})`);
        
        // Store connection
        this.connections.set(clientId, ws);
        
        // Send welcome message with client ID
        const welcomeMessage = createMessage(
            'system',
            clientId,
            MessageType.CONNECTION_ESTABLISHED,
            { 
                clientId,
                serverTime: new Date().toISOString(),
                orchestrationPort: this.actualPort
            }
        );
        
        ws.send(JSON.stringify(welcomeMessage));
        
        // Handle messages from this client
        ws.on('message', (data: Buffer) => {
            this.handleMessage(clientId, data.toString());
        });
        
        // Handle client disconnect
        ws.on('close', () => {
            this.handleDisconnect(clientId);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            this.log(`Client ${clientId} error: ${error.message}`, 'error');
        });
        
        // Handle pong for heartbeat
        ws.on('pong', () => {
            const client = this.clients.get(clientId);
            if (client) {
                client.lastHeartbeat = new Date().toISOString();
            }
        });
    }
    
    /**
     * Handle incoming message from a client
     */
    private handleMessage(clientId: string, data: string): void {
        try {
            const message = JSON.parse(data);
            
            // Handle client registration
            if (message.type === 'register') {
                this.registerClient(clientId, message);
                return;
            }
            
            // Validate message format
            if (!isValidMessage(message)) {
                this.sendError(clientId, 'Invalid message format');
                return;
            }
            
            // Update message with server timestamp
            message.timestamp = new Date().toISOString();
            
            // Log the message
            this.log(`Message from ${message.from}: ${message.type}`);
            
            // Store in history
            this.addToHistory(message);
            
            // Route the message
            this.routeMessage(message);
            
            // Send to dashboard if connected
            if (this.dashboardCallback) {
                this.dashboardCallback(message);
            }
            
            // Send acknowledgment if required
            if (message.requiresAck) {
                this.sendAcknowledgment(clientId, message.id);
            }
            
        } catch (error: any) {
            this.log(`Error processing message from ${clientId}: ${error.message}`, 'error');
            this.sendError(clientId, 'Failed to process message');
        }
    }
    
    /**
     * Register a client (conductor, agent, or dashboard)
     */
    private registerClient(tempId: string, registration: any): void {
        const { id, clientType, name, role } = registration;
        const type = clientType || registration.type; // Support both fields
        
        // Remove temp connection
        const ws = this.connections.get(tempId);
        if (!ws) return;
        
        this.connections.delete(tempId);
        this.connections.set(id, ws);
        
        // Store client info
        const client: ClientConnection = {
            id,
            type,
            name,
            connectedAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
            messageCount: 0,
            role,
            status: 'connected'
        };
        
        this.clients.set(id, client);
        
        this.log(`Client registered: ${name} (${id}) as ${type}`);
        
        // Notify others about new client
        this.broadcastSystemMessage(`${name} has joined`, [id]);
        
        // Send current state to new client
        if (type === 'conductor' || type === 'dashboard') {
            this.sendCurrentState(id);
        }
    }
    
    /**
     * Route message to appropriate recipient(s)
     */
    private routeMessage(message: OrchestratorMessage): void {
        const { to } = message;
        
        if (to === 'broadcast') {
            // Send to all except sender
            this.broadcast(message, [message.from]);
        } else if (to === 'dashboard') {
            // Special handling for dashboard
            if (this.dashboardCallback) {
                this.dashboardCallback(message);
            }
        } else if (to.startsWith('agent-') || to === 'conductor') {
            // Direct message to specific client
            this.sendToClient(to, message);
        } else if (to === 'all-agents') {
            // Send to all agents
            this.clients.forEach((client, id) => {
                if (client.type === 'agent') {
                    this.sendToClient(id, message);
                }
            });
        }
        
        // Update message count
        const sender = this.clients.get(message.from);
        if (sender) {
            sender.messageCount++;
        }
    }
    
    /**
     * Send message to specific client
     */
    private sendToClient(clientId: string, message: OrchestratorMessage): void {
        const ws = this.connections.get(clientId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        } else {
            this.log(`Cannot send to ${clientId}: not connected`, 'warn');
        }
    }
    
    /**
     * Broadcast message to all clients except excluded ones
     */
    private broadcast(message: OrchestratorMessage, exclude: string[] = []): void {
        const messageStr = JSON.stringify(message);
        
        this.connections.forEach((ws, id) => {
            if (!exclude.includes(id) && ws.readyState === WebSocket.OPEN) {
                ws.send(messageStr);
            }
        });
    }
    
    /**
     * Send system message
     */
    private broadcastSystemMessage(text: string, exclude: string[] = []): void {
        const message = createMessage(
            'system',
            'broadcast',
            MessageType.BROADCAST,
            { message: text }
        );
        
        this.broadcast(message, exclude);
        this.addToHistory(message);
    }
    
    /**
     * Handle client disconnect
     */
    private handleDisconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            this.log(`Client disconnected: ${client.name} (${clientId})`);
            this.broadcastSystemMessage(`${client.name} has disconnected`);
        }
        
        this.connections.delete(clientId);
        this.clients.delete(clientId);
    }
    
    /**
     * Send current state to a client
     */
    private sendCurrentState(clientId: string): void {
        const agents = Array.from(this.clients.values())
            .filter(c => c.type === 'agent')
            .map(c => ({
                id: c.id,
                name: c.name,
                role: c.role,
                status: c.status,
                connectedAt: c.connectedAt
            }));
        
        const stateMessage = createMessage(
            'system',
            clientId,
            MessageType.BROADCAST,
            {
                type: 'state_update',
                agents,
                messageHistory: this.messageHistory.slice(-50) // Last 50 messages
            }
        );
        
        this.sendToClient(clientId, stateMessage);
    }
    
    /**
     * Send error message to client
     */
    private sendError(clientId: string, error: string): void {
        const errorMessage = createMessage(
            'system',
            clientId,
            MessageType.SYSTEM_ERROR,
            { error }
        );
        
        this.sendToClient(clientId, errorMessage);
    }
    
    /**
     * Send acknowledgment
     */
    private sendAcknowledgment(clientId: string, messageId: string): void {
        const ack = {
            type: 'ack',
            messageId,
            timestamp: new Date().toISOString()
        };
        
        const ws = this.connections.get(clientId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(ack));
        }
    }
    
    /**
     * Monitor client heartbeats
     */
    private startHeartbeatMonitor(): void {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeout = 30000; // 30 seconds
            
            this.connections.forEach((ws, id) => {
                const client = this.clients.get(id);
                if (client) {
                    const lastBeat = new Date(client.lastHeartbeat).getTime();
                    if (now - lastBeat > timeout) {
                        this.log(`Client ${id} timed out`, 'warn');
                        ws.terminate();
                        this.handleDisconnect(id);
                    } else {
                        // Send ping
                        ws.ping();
                    }
                }
            });
        }, 10000); // Check every 10 seconds
    }
    
    /**
     * Add message to history
     */
    private addToHistory(message: OrchestratorMessage): void {
        this.messageHistory.push(message);
        
        // Trim history if too large
        if (this.messageHistory.length > this.maxHistorySize) {
            this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
        }
    }
    
    /**
     * Set dashboard callback for receiving messages
     */
    setDashboardCallback(callback: (message: OrchestratorMessage) => void): void {
        this.dashboardCallback = callback;
    }
    
    /**
     * Get current connections
     */
    getConnections(): ClientConnection[] {
        return Array.from(this.clients.values());
    }
    
    /**
     * Get message history
     */
    getMessageHistory(): OrchestratorMessage[] {
        return [...this.messageHistory];
    }
    
    /**
     * Log message to output channel
     */
    private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📡';
        this.outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);
    }
}