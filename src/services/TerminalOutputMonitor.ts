import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export interface TerminalPattern {
    completion: RegExp;
    permission: RegExp;
    waiting: RegExp;
    error: RegExp;
    thinking: RegExp;
}

export interface TerminalActivity {
    agentId: string;
    terminal: vscode.Terminal;
    pattern: keyof TerminalPattern;
    match: string;
    timestamp: Date;
}

export class TerminalOutputMonitor extends EventEmitter {
    private patterns: TerminalPattern = {
        completion: /task complete|finished|done|completed successfully|successfully completed|all tests pass/i,
        permission:
            /would you like|permission to|may i|should i|can i proceed|waiting for approval|need permission|confirm|approve/i,
        waiting: /press enter|\[y\/n\]|continue\?|waiting for|please respond|awaiting input|your choice/i,
        error: /error:|failed:|exception:|permission denied|cannot|unable to|failure|crash/i,
        thinking: /analyzing|processing|thinking|calculating|searching|looking|examining|reviewing/i
    };

    private terminalWriteEmitters: Map<vscode.Terminal, vscode.EventEmitter<string>> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        super();
    }

    /**
     * Start monitoring a terminal for output patterns
     */
    public monitorTerminal(terminal: vscode.Terminal, agentId: string): void {
        // VS Code doesn't directly expose terminal output, so we use a pseudo-terminal approach
        // This creates a write emitter that intercepts terminal output

        const writeEmitter = new vscode.EventEmitter<string>();
        this.terminalWriteEmitters.set(terminal, writeEmitter);

        // Create a pseudo-terminal that wraps the real terminal
        const pty = this.createPseudoTerminal(terminal, agentId, writeEmitter);

        // Monitor the terminal output through the write emitter
        const disposable = writeEmitter.event((data: string) => {
            this.processTerminalOutput(data, terminal, agentId);
        });

        this.disposables.push(disposable);
    }

    /**
     * Create a pseudo-terminal to intercept output
     */
    private createPseudoTerminal(
        terminal: vscode.Terminal,
        agentId: string,
        writeEmitter: vscode.EventEmitter<string>
    ): vscode.Pseudoterminal {
        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            open: () => {
                // Initial setup if needed
            },
            close: () => {
                // Cleanup
                this.terminalWriteEmitters.delete(terminal);
            },
            handleInput: (data: string) => {
                // Pass through user input
                terminal.sendText(data, false);
            }
        };

        return pty;
    }

    /**
     * Process terminal output and check against patterns
     */
    private processTerminalOutput(output: string, terminal: vscode.Terminal, agentId: string): void {
        const lines = output.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            // Check each pattern
            for (const [patternName, pattern] of Object.entries(this.patterns)) {
                if (pattern.test(line)) {
                    const activity: TerminalActivity = {
                        agentId,
                        terminal,
                        pattern: patternName as keyof TerminalPattern,
                        match: line,
                        timestamp: new Date()
                    };

                    // Emit specific events based on pattern type
                    this.emit(`pattern:${patternName}`, activity);
                    this.emit('activity', activity);

                    // Log for debugging
                    console.log(`[TerminalMonitor] Detected ${patternName} pattern for agent ${agentId}: ${line}`);
                }
            }
        }
    }

    /**
     * Stop monitoring a specific terminal
     */
    public stopMonitoring(terminal: vscode.Terminal): void {
        const emitter = this.terminalWriteEmitters.get(terminal);
        if (emitter) {
            emitter.dispose();
            this.terminalWriteEmitters.delete(terminal);
        }
    }

    /**
     * Add custom pattern
     */
    public addPattern(name: string, pattern: RegExp): void {
        (this.patterns as any)[name] = pattern;
    }

    /**
     * Get current patterns
     */
    public getPatterns(): TerminalPattern {
        return { ...this.patterns };
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.terminalWriteEmitters.forEach(emitter => emitter.dispose());
        this.terminalWriteEmitters.clear();
        this.removeAllListeners();
    }
}
