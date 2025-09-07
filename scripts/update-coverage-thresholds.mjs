#!/usr/bin/env node

/**
 * Update Coverage Thresholds Script
 * Updates jest.config.js with recommended coverage thresholds
 * This is a separate script that requires explicit user action
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const BASELINE_FILE = path.join(projectRoot, '.nofx', 'coverage-baseline.json');
const JEST_CONFIG = path.join(projectRoot, 'jest.config.js');

// Colors for output
const colors = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

/**
 * Read baseline data
 */
async function readBaseline() {
  try {
    const content = await fs.readFile(BASELINE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Could not read baseline file. Run 'node scripts/coverage-baseline.mjs' first.`);
  }
}

/**
 * Generate recommended thresholds from baseline
 */
function calculateThresholds(baseline, buffer = 5) {
  return {
    branches: Math.max(0, Math.floor(baseline.baseline.branches - buffer)),
    functions: Math.max(0, Math.floor(baseline.baseline.functions - buffer)),
    lines: Math.max(0, Math.floor(baseline.baseline.lines - buffer)),
    statements: Math.max(0, Math.floor(baseline.baseline.statements - buffer))
  };
}

/**
 * Update jest.config.js with new thresholds
 */
async function updateJestConfig(thresholds) {
  const { RED, GREEN, YELLOW, BLUE, RESET } = colors;
  
  try {
    // Read current config
    const configContent = await fs.readFile(JEST_CONFIG, 'utf-8');
    
    // Backup original
    const backupPath = `${JEST_CONFIG}.backup.${Date.now()}`;
    await fs.writeFile(backupPath, configContent);
    console.log(`${GREEN}✓ Created backup: ${path.relative(projectRoot, backupPath)}${RESET}`);
    
    // Update thresholds in the config
    let updatedContent = configContent;
    
    // Update branches
    updatedContent = updatedContent.replace(
      /branches:\s*\d+,?\s*(\/\/[^\n]*)?/g,
      `branches: ${thresholds.branches}, // Updated from coverage baseline`
    );
    
    // Update functions
    updatedContent = updatedContent.replace(
      /functions:\s*\d+,?\s*(\/\/[^\n]*)?/g,
      `functions: ${thresholds.functions}, // Updated from coverage baseline`
    );
    
    // Update lines
    updatedContent = updatedContent.replace(
      /lines:\s*\d+,?\s*(\/\/[^\n]*)?/g,
      `lines: ${thresholds.lines}, // Updated from coverage baseline`
    );
    
    // Update statements
    updatedContent = updatedContent.replace(
      /statements:\s*\d+\s*(\/\/[^\n]*)?/g,
      `statements: ${thresholds.statements} // Updated from coverage baseline`
    );
    
    // Write updated config
    await fs.writeFile(JEST_CONFIG, updatedContent);
    
    console.log(`${GREEN}✓ Updated jest.config.js with new thresholds:${RESET}`);
    console.log(`  branches: ${thresholds.branches}%`);
    console.log(`  functions: ${thresholds.functions}%`);
    console.log(`  lines: ${thresholds.lines}%`);
    console.log(`  statements: ${thresholds.statements}%`);
    
    return true;
  } catch (error) {
    console.error(`${RED}✗ Failed to update jest.config.js: ${error.message}${RESET}`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  const { RED, GREEN, YELLOW, BLUE, RESET } = colors;
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const buffer = args.includes('--buffer') ? 
      parseInt(args[args.indexOf('--buffer') + 1]) || 5 : 5;
    
    console.log(`\n${BLUE}⚙️  Coverage Threshold Updater${RESET}`);
    console.log('============================\n');
    
    // Check if jest.config.js exists
    try {
      await fs.access(JEST_CONFIG);
    } catch {
      console.error(`${RED}✗ jest.config.js not found${RESET}`);
      process.exit(1);
    }
    
    // Read baseline
    console.log(`${YELLOW}Reading baseline data...${RESET}`);
    const baseline = await readBaseline();
    
    // Calculate thresholds
    const thresholds = calculateThresholds(baseline, buffer);
    
    console.log(`\n${BLUE}Current Coverage:${RESET}`);
    console.log(`  branches: ${baseline.baseline.branches.toFixed(2)}%`);
    console.log(`  functions: ${baseline.baseline.functions.toFixed(2)}%`);
    console.log(`  lines: ${baseline.baseline.lines.toFixed(2)}%`);
    console.log(`  statements: ${baseline.baseline.statements.toFixed(2)}%`);
    
    console.log(`\n${BLUE}Recommended Thresholds (with ${buffer}% buffer):${RESET}`);
    console.log(`  branches: ${thresholds.branches}%`);
    console.log(`  functions: ${thresholds.functions}%`);
    console.log(`  lines: ${thresholds.lines}%`);
    console.log(`  statements: ${thresholds.statements}%`);
    
    // Confirm with user unless --force flag is used
    if (!force) {
      console.log(`\n${YELLOW}⚠️  This will update jest.config.js${RESET}`);
      console.log('A backup will be created before making changes.');
      console.log('\nTo proceed, run with --force flag:');
      console.log(`  ${GREEN}node scripts/update-coverage-thresholds.mjs --force${RESET}`);
      console.log('\nTo use a different buffer (default 5%), add --buffer:');
      console.log(`  ${GREEN}node scripts/update-coverage-thresholds.mjs --force --buffer 10${RESET}\n`);
      process.exit(0);
    }
    
    // Update the config
    console.log(`\n${YELLOW}Updating jest.config.js...${RESET}`);
    const success = await updateJestConfig(thresholds);
    
    if (success) {
      console.log(`\n${GREEN}✅ Successfully updated coverage thresholds!${RESET}`);
      console.log('\nNext steps:');
      console.log('1. Run tests to verify thresholds: npm test');
      console.log('2. Commit the changes if tests pass');
      console.log('3. Continue improving test coverage\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`${RED}❌ Error: ${error.message}${RESET}`);
    process.exit(1);
  }
}

// Run the script
main();