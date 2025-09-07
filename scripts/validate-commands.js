#!/usr/bin/env node

/**
 * Command validation script for NofX VS Code Extension
 * Validates that all commands declared in package.json are implemented in the compiled output
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

function validateCommands() {
    console.log(`${BLUE}[VALIDATE]${NC} Checking command implementations...`);
    
    // Read package.json
    const packagePath = path.join(__dirname, '..', 'package.json');
    if (!fs.existsSync(packagePath)) {
        console.error(`${RED}[ERROR]${NC} package.json not found!`);
        process.exit(1);
    }
    
    const pkg = require(packagePath);
    const declaredCommands = pkg.contributes?.commands || [];
    
    if (declaredCommands.length === 0) {
        console.error(`${RED}[ERROR]${NC} No commands declared in package.json!`);
        process.exit(1);
    }
    
    console.log(`${BLUE}[INFO]${NC} Found ${declaredCommands.length} commands in package.json`);
    
    // Read compiled extension.js and CommandService.js
    const extensionPath = path.join(__dirname, '..', 'out', 'extension.js');
    if (!fs.existsSync(extensionPath)) {
        console.error(`${RED}[ERROR]${NC} Compiled extension.js not found!`);
        console.error(`${YELLOW}[HINT]${NC} Run 'npm run compile' first`);
        process.exit(1);
    }
    
    // Also check CommandService.js since commands may be registered there
    const commandServicePath = path.join(__dirname, '..', 'out', 'services', 'CommandService.js');
    
    let extensionContent = fs.readFileSync(extensionPath, 'utf8');
    if (fs.existsSync(commandServicePath)) {
        extensionContent += '\n' + fs.readFileSync(commandServicePath, 'utf8');
    }
    
    // Also check all command files in commands directory
    const commandsDir = path.join(__dirname, '..', 'out', 'commands');
    if (fs.existsSync(commandsDir)) {
        const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsDir, file);
            extensionContent += '\n' + fs.readFileSync(filePath, 'utf8');
        }
    }
    
    // Check each command
    const missingCommands = [];
    const foundCommands = [];
    
    for (const cmd of declaredCommands) {
        const commandId = cmd.command;
        
        // Check for command registration patterns
        // Pattern 1: vscode.commands.registerCommand('commandId'
        // Pattern 2: registerCommand('commandId'
        // Pattern 3: commands.registerCommand('commandId'
        // Pattern 4: commandService.register('commandId'
        // Pattern 5: this.commandService.register('commandId'
        const patterns = [
            `registerCommand\\(['"\`]${commandId}['"\`]`,
            `registerCommand\\(\\s*['"\`]${commandId}['"\`]`,
            `commands\\.registerCommand\\(['"\`]${commandId}['"\`]`,
            `commandService\\.register\\(['"\`]${commandId}['"\`]`,
            `this\\.commandService\\.register\\(['"\`]${commandId}['"\`]`
        ];
        
        const isImplemented = patterns.some(pattern => {
            const regex = new RegExp(pattern);
            return regex.test(extensionContent);
        });
        
        if (isImplemented) {
            foundCommands.push(commandId);
        } else {
            missingCommands.push(commandId);
        }
    }
    
    // Report results
    console.log(`${GREEN}[SUCCESS]${NC} Found ${foundCommands.length} implemented commands`);
    
    if (missingCommands.length > 0) {
        console.error(`${RED}[ERROR]${NC} Missing ${missingCommands.length} command implementations:`);
        missingCommands.forEach(cmd => {
            console.error(`  ${RED}✗${NC} ${cmd}`);
        });
        process.exit(1);
    }
    
    // Additional validation: check for orphaned commands (implemented but not declared)
    const commandPattern = /registerCommand\(['"`]([^'"`]+)['"`]/g;
    const implementedCommands = new Set();
    let match;
    
    while ((match = commandPattern.exec(extensionContent)) !== null) {
        implementedCommands.add(match[1]);
    }
    
    const declaredCommandIds = new Set(declaredCommands.map(c => c.command));
    const orphanedCommands = Array.from(implementedCommands).filter(
        cmd => !declaredCommandIds.has(cmd) && cmd.startsWith('nofx.')
    );
    
    if (orphanedCommands.length > 0) {
        console.warn(`${YELLOW}[WARNING]${NC} Found ${orphanedCommands.length} orphaned commands (implemented but not declared):`);
        orphanedCommands.forEach(cmd => {
            console.warn(`  ${YELLOW}?${NC} ${cmd}`);
        });
    }
    
    console.log(`${GREEN}[SUCCESS]${NC} All declared commands are implemented!`);
    return 0;
}

// Run validation
try {
    const exitCode = validateCommands();
    process.exit(exitCode);
} catch (error) {
    console.error(`${RED}[ERROR]${NC} Validation failed:`, error.message);
    process.exit(1);
}