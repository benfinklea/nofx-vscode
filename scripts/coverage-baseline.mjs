#!/usr/bin/env node

/**
 * Coverage Baseline Script
 * Analyzes test coverage and provides recommendations without modifying files
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { createReadStream } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Configuration
const BASELINE_FILE = path.join(projectRoot, '.nofx', 'coverage-baseline.json');
const COVERAGE_DIR = path.join(projectRoot, 'coverage');
const LCOV_FILE = path.join(COVERAGE_DIR, 'lcov.info');
const JEST_CONFIG = path.join(projectRoot, 'jest.config.js');

// Colors for output (ANSI codes)
const colors = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

/**
 * Parse LCOV file to extract coverage data
 */
async function parseLcovFile(lcovPath) {
  try {
    await fs.access(lcovPath);
  } catch {
    throw new Error(`Coverage file not found: ${lcovPath}\nRun 'npm test:coverage' first.`);
  }

  const fileStream = createReadStream(lcovPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const totals = {
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0
  };

  const fileStats = new Map();
  let currentFile = null;

  for await (const line of rl) {
    if (line.startsWith('SF:')) {
      currentFile = line.substring(3);
      fileStats.set(currentFile, {
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0
      });
    } else if (currentFile) {
      const stats = fileStats.get(currentFile);
      if (line.startsWith('LF:')) {
        const value = parseInt(line.substring(3));
        stats.linesFound = value;
        totals.linesFound += value;
      } else if (line.startsWith('LH:')) {
        const value = parseInt(line.substring(3));
        stats.linesHit = value;
        totals.linesHit += value;
      } else if (line.startsWith('FNF:')) {
        const value = parseInt(line.substring(4));
        stats.functionsFound = value;
        totals.functionsFound += value;
      } else if (line.startsWith('FNH:')) {
        const value = parseInt(line.substring(4));
        stats.functionsHit = value;
        totals.functionsHit += value;
      } else if (line.startsWith('BRF:')) {
        const value = parseInt(line.substring(4));
        stats.branchesFound = value;
        totals.branchesFound += value;
      } else if (line.startsWith('BRH:')) {
        const value = parseInt(line.substring(4));
        stats.branchesHit = value;
        totals.branchesHit += value;
      }
    }
  }

  // Calculate percentages
  const coverage = {
    lines: totals.linesFound > 0 ? (totals.linesHit / totals.linesFound) * 100 : 0,
    functions: totals.functionsFound > 0 ? (totals.functionsHit / totals.functionsFound) * 100 : 0,
    branches: totals.branchesFound > 0 ? (totals.branchesHit / totals.branchesFound) * 100 : 0,
    statements: totals.linesFound > 0 ? (totals.linesHit / totals.linesFound) * 100 : 0 // Approximate
  };

  // Find files with lowest coverage
  const fileCoverages = Array.from(fileStats.entries()).map(([file, stats]) => ({
    file: path.relative(projectRoot, file),
    lines: stats.linesFound > 0 ? (stats.linesHit / stats.linesFound) * 100 : 100,
    functions: stats.functionsFound > 0 ? (stats.functionsHit / stats.functionsFound) * 100 : 100,
    branches: stats.branchesFound > 0 ? (stats.branchesHit / stats.branchesFound) * 100 : 100
  }));

  // Sort by lowest line coverage
  fileCoverages.sort((a, b) => a.lines - b.lines);

  return {
    coverage,
    totals,
    fileStats: fileCoverages,
    totalFiles: fileStats.size
  };
}

/**
 * Save baseline data
 */
async function saveBaseline(data) {
  const baseline = {
    timestamp: new Date().toISOString(),
    baseline: data.coverage,
    targets: {
      lines: Math.min(data.coverage.lines + 10, 100),
      functions: Math.min(data.coverage.functions + 10, 100),
      branches: Math.min(data.coverage.branches + 10, 100),
      statements: Math.min(data.coverage.statements + 10, 100)
    },
    progress: {
      lines: 0,
      functions: 0,
      branches: 0,
      statements: 0
    }
  };

  // Ensure .nofx directory exists
  await fs.mkdir(path.dirname(BASELINE_FILE), { recursive: true });
  await fs.writeFile(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  
  return baseline;
}

/**
 * Generate recommended thresholds
 */
function generateRecommendedThresholds(coverage) {
  // Set thresholds 5% below current coverage to allow some flexibility
  const buffer = 5;
  return {
    branches: Math.max(0, Math.floor(coverage.branches - buffer)),
    functions: Math.max(0, Math.floor(coverage.functions - buffer)),
    lines: Math.max(0, Math.floor(coverage.lines - buffer)),
    statements: Math.max(0, Math.floor(coverage.statements - buffer))
  };
}

/**
 * Display progress report
 */
function displayReport(data, baseline) {
  const { coverage, fileStats, totalFiles } = data;
  const { RED, GREEN, YELLOW, BLUE, RESET } = colors;

  console.log(`\n${BLUE}🎯 NofX Coverage Baseline Analysis${RESET}`);
  console.log('==================================\n');

  console.log(`${BLUE}📈 Coverage Report${RESET}`);
  console.log('==================');
  console.log(`Timestamp: ${GREEN}${new Date().toLocaleString()}${RESET}`);
  console.log(`Total files analyzed: ${GREEN}${totalFiles}${RESET}\n`);

  // Coverage table
  console.log('Category     Current    Target    Progress');
  console.log('-------------------------------------------');
  
  ['lines', 'functions', 'branches', 'statements'].forEach(metric => {
    const current = coverage[metric].toFixed(2);
    const target = baseline.targets[metric].toFixed(2);
    const progress = baseline.progress[metric].toFixed(1);
    console.log(
      `${metric.padEnd(12)} ${current.padStart(7)}%  ${target.padStart(7)}%  ${progress.padStart(7)}%`
    );
  });

  // Areas for improvement
  console.log(`\n${BLUE}🎯 Areas for Improvement${RESET}`);
  console.log('========================');
  
  ['lines', 'functions', 'branches'].forEach(metric => {
    const value = coverage[metric];
    if (value < 50) {
      console.log(`${RED}🔴 ${metric} coverage is below 50% - Priority: HIGH${RESET}`);
    } else if (value < 70) {
      console.log(`${YELLOW}🟡 ${metric} coverage is below 70% - Priority: MEDIUM${RESET}`);
    } else {
      console.log(`${GREEN}🟢 ${metric} coverage is above 70% - Good!${RESET}`);
    }
  });

  // Files with lowest coverage
  console.log(`\n${BLUE}📁 Files with Lowest Coverage${RESET}`);
  console.log('=============================');
  
  const lowestFiles = fileStats.slice(0, 5);
  lowestFiles.forEach(file => {
    const color = file.lines < 50 ? RED : file.lines < 70 ? YELLOW : GREEN;
    console.log(`  ${color}• ${file.file} (${file.lines.toFixed(1)}%)${RESET}`);
  });

  // Recommended thresholds
  const thresholds = generateRecommendedThresholds(coverage);
  console.log(`\n${BLUE}⚙️  Recommended Jest Thresholds${RESET}`);
  console.log('==============================');
  console.log('Add or update these in your jest.config.js:\n');
  console.log('```javascript');
  console.log('coverageThreshold: {');
  console.log('  global: {');
  console.log(`    branches: ${thresholds.branches},`);
  console.log(`    functions: ${thresholds.functions},`);
  console.log(`    lines: ${thresholds.lines},`);
  console.log(`    statements: ${thresholds.statements}`);
  console.log('  }');
  console.log('}');
  console.log('```');

  // Next steps
  console.log(`\n${BLUE}Next Steps:${RESET}`);
  console.log('1. Review the HTML coverage report for detailed gaps');
  console.log('2. Add tests for the lowest-covered files');
  console.log('3. Focus on error handling and edge cases');
  console.log('4. Update jest.config.js with recommended thresholds');
  console.log('5. Run this script again to track progress\n');

  console.log(`${GREEN}✅ Coverage analysis complete!${RESET}`);
  console.log(`📊 Baseline saved to: ${BLUE}${path.relative(projectRoot, BASELINE_FILE)}${RESET}`);
  console.log(`📊 HTML report: ${BLUE}coverage/lcov-report/index.html${RESET}\n`);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const updateThresholds = args.includes('--update-thresholds');
    
    // Check if coverage data exists
    try {
      await fs.access(LCOV_FILE);
    } catch {
      console.error(`${colors.YELLOW}⚠️  No coverage data found.${colors.RESET}`);
      console.error(`Run 'npm run test:coverage' first to generate coverage data.\n`);
      // Exit with 0 as this is not a genuine error
      process.exit(0);
    }

    // Parse coverage data
    console.log(`${colors.YELLOW}📊 Parsing coverage data...${colors.RESET}`);
    const data = await parseLcovFile(LCOV_FILE);
    
    // Save baseline
    const baseline = await saveBaseline(data);
    
    // Display report
    displayReport(data, baseline);

    // Optionally update jest.config.js
    if (updateThresholds) {
      console.log(`\n${colors.YELLOW}⚠️  To update thresholds, run:${colors.RESET}`);
      console.log(`node scripts/update-coverage-thresholds.mjs\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error(`${colors.RED}❌ Error: ${error.message}${colors.RESET}`);
    // Only exit with non-zero for genuine errors
    if (error.code === 'ENOENT' || error.message.includes('not found')) {
      process.exit(0);
    }
    process.exit(1);
  }
}

// Run the script
main();