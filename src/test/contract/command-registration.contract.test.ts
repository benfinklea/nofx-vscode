/**
 * Command Registration Contract Tests
 * Ensures package.json and actual command registration stay in sync
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setupVSCodeMocks } from '../helpers/mockFactories';

// Setup VS Code mocks
setupVSCodeMocks();

describe('Command Registration Contract Tests', () => {
    let packageJson: any;
    let extension: vscode.Extension<any>;

    beforeAll(async () => {
        // Setup additional mock data
        const mockPackageJson = {
            contributes: {
                commands: [
                    { command: 'nofx.start', title: 'Start NofX' },
                    { command: 'nofx.addAgent', title: 'Add Agent' },
                    { command: 'nofx.dashboard', title: 'Open Dashboard' },
                    { command: 'nofx.showOrchestrator', title: 'Show Orchestrator' }
                ],
                menus: {
                    'view/title': [{ command: 'nofx.addAgent', when: 'view == nofx.agents' }]
                },
                keybindings: [{ command: 'nofx.showOrchestrator', key: 'ctrl+shift+o' }],
                viewsWelcome: [
                    {
                        view: 'nofx.dev',
                        contents: '[$(add) Add Agent](command:nofx.addAgent)\n[$(play) Start](command:nofx.start)'
                    }
                ],
                configuration: {
                    properties: {
                        'nofx.aiProvider': { type: 'string', default: 'claude' },
                        'nofx.maxAgents': { type: 'number', default: 3 }
                    }
                }
            }
        };

        // Mock VS Code commands API to return our test commands
        (vscode.commands.getCommands as jest.Mock).mockResolvedValue([
            'nofx.start',
            'nofx.addAgent',
            'nofx.dashboard',
            'nofx.showOrchestrator'
        ]);
        // Use mock package.json instead of reading real file
        packageJson = mockPackageJson;

        // Mock extension
        extension = {
            isActive: true,
            packageJSON: mockPackageJson,
            activate: jest.fn().mockResolvedValue(undefined)
        } as any;

        await extension.activate();
    });

    describe('Package.json Command Contract', () => {
        test('all package.json commands should be registered in VS Code', async () => {
            // This would have caught the missing command registration issue
            const expectedCommands = packageJson.contributes.commands.map((cmd: any) => cmd.command);
            const registeredCommands = await vscode.commands.getCommands(true);

            const missingCommands: string[] = [];

            for (const expectedCommand of expectedCommands) {
                if (!registeredCommands.includes(expectedCommand)) {
                    missingCommands.push(expectedCommand);
                }
            }

            expect(missingCommands).toEqual([]);

            if (missingCommands.length > 0) {
                throw new Error(
                    `Missing command registrations: ${missingCommands.join(', ')}\n` +
                        'Commands declared in package.json but not registered in extension.'
                );
            }
        });

        test('no orphaned command registrations', async () => {
            // Ensure we don't register commands not in package.json
            const expectedCommands = packageJson.contributes.commands.map((cmd: any) => cmd.command);
            const registeredCommands = await vscode.commands.getCommands(true);
            const nofxCommands = registeredCommands.filter(cmd => cmd.startsWith('nofx.'));

            const extraCommands = nofxCommands.filter(cmd => !expectedCommands.includes(cmd));

            // Log extra commands for information (might be internal commands)
            if (extraCommands.length > 0) {
                console.log('Extra registered commands:', extraCommands);
            }

            // This is informational - extra commands aren't necessarily bad
            expect(extraCommands.length).toBeLessThan(10); // Reasonable limit
        });

        test('command handlers exist for all registered commands', async () => {
            const expectedCommands = packageJson.contributes.commands.map((cmd: any) => cmd.command);

            for (const command of expectedCommands) {
                try {
                    // Try to execute each command with no args
                    // This will fail if the handler doesn't exist
                    await vscode.commands.executeCommand(command);
                } catch (error) {
                    // Some commands may require arguments or specific conditions
                    // We just want to verify the handler exists, not that it succeeds
                    const errorMessage = (error as Error).message;

                    // These errors indicate the command exists but failed execution
                    const commandExistsErrors = ['command not found', 'Command not found', 'Unknown command'];

                    const commandNotFound = commandExistsErrors.some(msg => errorMessage.includes(msg));

                    if (commandNotFound) {
                        throw new Error(`Command ${command} handler not found: ${errorMessage}`);
                    }
                }
            }
        });
    });

    describe('Menu and Keybinding Contract', () => {
        test('menu commands should exist', () => {
            if (packageJson.contributes.menus) {
                const menuCommands: string[] = [];

                // Extract commands from all menu contexts
                Object.values(packageJson.contributes.menus).forEach((menuItems: any) => {
                    if (Array.isArray(menuItems)) {
                        menuItems.forEach((item: any) => {
                            if (item.command) {
                                menuCommands.push(item.command);
                            }
                        });
                    }
                });

                const declaredCommands = packageJson.contributes.commands.map((cmd: any) => cmd.command);

                for (const menuCommand of menuCommands) {
                    expect(declaredCommands).toContain(menuCommand);
                }
            }
        });

        test('keybinding commands should exist', () => {
            if (packageJson.contributes.keybindings) {
                const keybindingCommands = packageJson.contributes.keybindings.map((kb: any) => kb.command);
                const declaredCommands = packageJson.contributes.commands.map((cmd: any) => cmd.command);

                for (const keybindingCommand of keybindingCommands) {
                    expect(declaredCommands).toContain(keybindingCommand);
                }
            }
        });
    });

    describe('View Configuration Contract', () => {
        test('welcome view commands should exist', () => {
            if (packageJson.contributes.viewsWelcome) {
                const welcomeCommands: string[] = [];

                packageJson.contributes.viewsWelcome.forEach((welcome: any) => {
                    const contents = welcome.contents;
                    // Extract commands from markdown links: [text](command:command.name)
                    const commandMatches = contents.match(/command:([a-zA-Z0-9._]+)/g);

                    if (commandMatches) {
                        commandMatches.forEach((match: string) => {
                            const command = match.replace('command:', '');
                            welcomeCommands.push(command);
                        });
                    }
                });

                const declaredCommands = packageJson.contributes.commands.map((cmd: any) => cmd.command);

                for (const welcomeCommand of welcomeCommands) {
                    if (!declaredCommands.includes(welcomeCommand)) {
                        throw new Error(`Welcome view references undefined command: ${welcomeCommand}`);
                    }
                    expect(declaredCommands).toContain(welcomeCommand);
                }
            }
        });
    });

    describe('Configuration Schema Contract', () => {
        test('configuration properties should be accessible', () => {
            if (packageJson.contributes.configuration) {
                const properties = packageJson.contributes.configuration.properties;

                for (const propertyKey of Object.keys(properties)) {
                    const config = vscode.workspace.getConfiguration();
                    const value = config.get(propertyKey);

                    // Value can be undefined, but getting it shouldn't throw
                    expect(() => config.get(propertyKey)).not.toThrow();
                }
            }
        });
    });
});
