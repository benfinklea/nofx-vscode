#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Extract commands
const commands = packageJson.contributes?.commands || [];

console.log('NofX Extension Commands');
console.log('=======================\n');

// Group commands by category
const categories = {
    'Core': [],
    'Agent Management': [],
    'Task Management': [],
    'Templates': [],
    'Metrics': [],
    'Worktrees': [],
    'Debug': [],
    'Other': []
};

commands.forEach(cmd => {
    const cmdInfo = `${cmd.command} - ${cmd.title}`;
    
    if (cmd.command.includes('debug')) {
        categories['Debug'].push(cmdInfo);
    } else if (cmd.command.includes('agent') || cmd.command.includes('Agent')) {
        categories['Agent Management'].push(cmdInfo);
    } else if (cmd.command.includes('task') || cmd.command.includes('Task')) {
        categories['Task Management'].push(cmdInfo);
    } else if (cmd.command.includes('template') || cmd.command.includes('Template')) {
        categories['Templates'].push(cmdInfo);
    } else if (cmd.command.includes('metric') || cmd.command.includes('Metrics')) {
        categories['Metrics'].push(cmdInfo);
    } else if (cmd.command.includes('worktree') || cmd.command.includes('merge')) {
        categories['Worktrees'].push(cmdInfo);
    } else if (cmd.command.includes('start') || cmd.command.includes('conductor') || cmd.command.includes('reset')) {
        categories['Core'].push(cmdInfo);
    } else {
        categories['Other'].push(cmdInfo);
    }
});

// Print categorized commands
Object.entries(categories).forEach(([category, cmds]) => {
    if (cmds.length > 0) {
        console.log(`### ${category}`);
        cmds.forEach(cmd => console.log(`  - ${cmd}`));
        console.log();
    }
});

console.log(`Total commands: ${commands.length}`);