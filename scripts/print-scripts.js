#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get and sort scripts
const scripts = packageJson.scripts;
const sortedScripts = Object.keys(scripts).sort();

// Group scripts by category
const categories = {
  'Build & Compile': ['compile', 'build', 'build:clean', 'build:validate', 'build:ci', 'watch', 'vscode:prepublish', 'postcompile', 'prepackage', 'package'],
  'Testing': ['test', 'test:unit', 'test:integration', 'test:functional', 'test:smoke', 'test:e2e', 'test:persistence', 'test:all', 'test:ci', 'test:manual', 'test:watch', 'test:coverage', 'test:build', 'test:commands', 'test:services', 'pretest'],
  'Validation': ['validate:build', 'validate:commands', 'validate:services', 'validate:all', 'lint'],
  'Development Tools': ['dev:setup', 'dev:validate', 'dev:clean', 'dev:reset'],
  'Git Hooks': ['hooks:install', 'hooks:uninstall', 'hooks:test', 'hooks:verify', 'hooks:verify:fix', 'prepare'],
  'Quality Assurance': ['qa:full', 'qa:quick', 'qa:pre-commit'],
  'Utilities': ['print:commands']
};

console.log('# NPM Scripts Reference\n');
console.log('*Generated from package.json*\n');

// Print scripts by category
for (const [category, categoryScripts] of Object.entries(categories)) {
  const availableScripts = categoryScripts.filter(s => scripts[s]);
  if (availableScripts.length > 0) {
    console.log(`## ${category}\n`);
    availableScripts.forEach(scriptName => {
      const command = scripts[scriptName];
      console.log(`- \`npm run ${scriptName}\` - ${command}`);
    });
    console.log();
  }
}

// Print any uncategorized scripts
const allCategorized = Object.values(categories).flat();
const uncategorized = sortedScripts.filter(s => !allCategorized.includes(s));

if (uncategorized.length > 0) {
  console.log('## Other Scripts\n');
  uncategorized.forEach(scriptName => {
    const command = scripts[scriptName];
    console.log(`- \`npm run ${scriptName}\` - ${command}`);
  });
  console.log();
}

console.log('## Common Fallback Commands\n');
console.log('For functionality not exposed as npm scripts:\n');
console.log('- **Auto-fix lint issues**: `npx eslint src --ext ts --fix`');
console.log('- **Format code**: `npx prettier . --write` (if prettier is configured)');
console.log('- **Clean all**: `npx rimraf out coverage nofx-*.vsix node_modules`');
console.log('- **Install specific package**: `code --install-extension nofx-*.vsix --force`');
console.log('- **List VSIX contents**: `npx vsce ls`');