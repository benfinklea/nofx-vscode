# Git Hooks for NofX VS Code Extension

This directory contains Git hooks managed by Husky to ensure code quality and prevent broken builds.

## Installed Hooks

### Pre-commit Hook
Runs before each commit to validate:
- TypeScript compilation succeeds
- Build output is valid
- Command registration tests pass (if available)
- No console.log statements in source code

### Pre-push Hook
Runs before pushing to remote to validate:
- Full build succeeds
- All tests pass
- Code coverage meets thresholds
- VSIX package can be created
- Linting passes (if configured)
- Final build validation passes

## Usage

### Normal Operation
Hooks run automatically when you commit or push. No action required.

### Bypassing Hooks (Emergency Only)
If you need to bypass hooks in an emergency:

```bash
# Bypass pre-commit hook
git commit --no-verify -m "Emergency fix"

# Bypass pre-push hook  
git push --no-verify
```

⚠️ **Warning**: Only bypass hooks in genuine emergencies. Bypassing validation can lead to broken builds.

### Troubleshooting

#### Hook Not Running
1. Ensure Husky is installed: `npm install`
2. Reinstall hooks: `npx husky install`
3. Check hook permissions: `ls -la .husky/`

#### Hook Failing
1. Read the error message carefully
2. Fix the reported issue
3. Try the operation again

#### Slow Hook Execution
Pre-push hooks intentionally run comprehensive validation and may take 1-2 minutes.
For faster feedback, rely on pre-commit hooks and run tests manually.

### Uninstalling Hooks
To temporarily disable hooks:
```bash
git config --unset core.hooksPath
```

To permanently remove hooks:
```bash
rm -rf .husky
npm uninstall husky
```

## Contributing
When modifying hooks:
1. Edit the hook file in `.husky/`
2. Test the hook manually
3. Commit your changes
4. Document any new validations

For questions or issues, please contact the development team.
