/**
 * Regression Test: Terminal Output Verification
 *
 * This test verifies that the compiled TerminalManager output:
 * 1. Does NOT contain echo commands for agent initialization
 * 2. DOES contain the correct Claude command
 * 3. Does NOT automatically inject detailed prompts
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Output Regression Tests', () => {
    const terminalManagerPath = path.join(__dirname, '../../../out/services/TerminalManager.js');
    let terminalManagerContent: string;

    beforeAll(() => {
        // Read the compiled TerminalManager.js file
        if (fs.existsSync(terminalManagerPath)) {
            terminalManagerContent = fs.readFileSync(terminalManagerPath, 'utf-8');
        } else {
            // Try alternative path if running from different location
            const altPath = path.join(process.cwd(), 'out/services/TerminalManager.js');
            if (fs.existsSync(altPath)) {
                terminalManagerContent = fs.readFileSync(altPath, 'utf-8');
            } else {
                throw new Error('Could not find compiled TerminalManager.js');
            }
        }
    });

    it('should NOT contain echo commands for agent initialization', () => {
        // These echo commands should NOT exist in the compiled output
        const forbiddenPatterns = [
            'echo "🤖 Initializing',
            'echo "Agent ID:',
            'echo "Starting AI provider',
            'echo "Starting.*with specialized prompt',
            'echo "Command:'
        ];

        forbiddenPatterns.forEach(pattern => {
            const regex = new RegExp(pattern);
            const matches = terminalManagerContent.match(regex);

            expect(matches).toBeNull();
            if (matches) {
                console.error(`Found forbidden pattern "${pattern}" in compiled output`);
            }
        });
    });

    it('should contain the hardcoded Claude command', () => {
        // The exact Claude command that should be in the file
        const expectedCommand = `claude --dangerously-skip-permissions --append-system-prompt 'You are an expert in testing specialist. You are part of a NofX.dev coding team. Please wait for instructions.'`;

        expect(terminalManagerContent).toContain(expectedCommand);
    });

    it('should have disabled automatic detailed prompt injection', () => {
        // The detailed prompt injection should be disabled with false condition
        // Looking for the pattern: if (false && agent.template.detailedPrompt)
        const disabledPattern = /if\s*\(\s*false\s*&&.*detailedPrompt/;

        const hasDisabledInjection = disabledPattern.test(terminalManagerContent);

        expect(hasDisabledInjection).toBe(true);

        if (!hasDisabledInjection) {
            // Check if the old pattern still exists
            const oldPattern = /ALWAYS inject the detailed prompt/;
            if (oldPattern.test(terminalManagerContent)) {
                console.error('Detailed prompt injection is NOT disabled - found old pattern');
            }
        }
    });

    it('should not have duplicate services directory in output', () => {
        // Check that there's no duplicate services/services directory
        const duplicatePath = path.join(process.cwd(), 'out/services/services');

        expect(fs.existsSync(duplicatePath)).toBe(false);

        if (fs.existsSync(duplicatePath)) {
            console.error('Found duplicate services/services directory that should not exist');
        }
    });

    it('should have correct initialization comment', () => {
        // Should have the new comment instead of old echo commands
        expect(terminalManagerContent).toContain('Agent initialization - no echo commands');
    });

    it('should not send multiple commands before Claude launch', () => {
        // Count how many sendText calls exist in the performAgentInitialization section
        // There should be minimal sendText calls before the Claude command

        // Extract the performAgentInitialization function
        const funcStart = terminalManagerContent.indexOf('performAgentInitialization');
        const funcEnd = terminalManagerContent.indexOf('catch (error)', funcStart) + 500; // Get a bit past the catch
        const functionBody = terminalManagerContent.substring(funcStart, funcEnd);

        // Count sendText occurrences before the Claude command
        const claudeCommandIndex = functionBody.indexOf('claude --dangerously-skip-permissions');
        if (claudeCommandIndex > -1) {
            const beforeClaude = functionBody.substring(0, claudeCommandIndex);
            const sendTextMatches = beforeClaude.match(/terminal\.sendText/g) || [];

            // Should have at most 2-3 sendText calls (empty line, cd command if needed)
            expect(sendTextMatches.length).toBeLessThanOrEqual(3);

            if (sendTextMatches.length > 3) {
                console.error(
                    `Found ${sendTextMatches.length} sendText calls before Claude command - should be minimal`
                );
            }
        }
    });
});
