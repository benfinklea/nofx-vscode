# Custom Template Save Locations

## Overview

The NofX extension supports two locations for saving custom agent templates, each with different use cases and implications.

## Template Locations

### 1. Default: `.nofx/templates/custom/` (Recommended)

**Location**: Workspace root `.nofx/templates/custom/`
**Use Case**: User-generated custom templates for runtime use
**Advantages**:
- ✅ Templates persist across extension updates
- ✅ Workspace-specific templates
- ✅ No write permissions to extension source required
- ✅ Templates are discoverable at runtime
- ✅ Safe for production use

**Usage**:
```typescript
// Default behavior - saves to .nofx/templates/custom/
await agentTemplateManager.saveTemplate(template, true);
```

### 2. Alternative: `src/agents/templates/` (Development Only)

**Location**: Extension source `src/agents/templates/`
**Use Case**: Development and testing of built-in templates
**Advantages**:
- ✅ Templates become part of the extension package
- ✅ Available to all users of the extension
- ✅ Version controlled with the extension

**Disadvantages**:
- ❌ Templates may be lost on extension updates
- ❌ Requires write permissions to extension source
- ❌ Not suitable for user-generated content
- ❌ Modifies extension source code

**Usage**:
```typescript
// Save to built-in templates directory
await agentTemplateManager.saveBuiltInLikeTemplate(template);
```

## Configuration

You can control the default save location using VS Code settings:

```json
{
  "nofx.saveCustomTemplatesToBuiltIn": false  // Default: false (saves to .nofx/templates/custom/)
}
```

Set to `true` to save custom templates to `src/agents/templates/` instead.

## Recommendations

### For End Users
- **Use default location** (`.nofx/templates/custom/`)
- Templates will persist and be available across extension updates
- Safe and recommended for production use

### For Extension Developers
- **Use built-in location** (`src/agents/templates/`) only for:
  - Adding new built-in templates to the extension
  - Development and testing purposes
- **Use custom location** (`.nofx/templates/custom/`) for:
  - User-generated templates
  - Runtime template creation

## Implementation Details

The `AgentTemplateManager` provides two methods:

1. `saveTemplate(template, isCustom)` - Saves to custom templates directory
2. `saveBuiltInLikeTemplate(template)` - Saves to built-in templates directory

The `SuperSmartConductor` automatically chooses the appropriate location based on configuration and use case.

## File Structure

```
workspace/
├── .nofx/
│   └── templates/
│       └── custom/           # User custom templates (default)
│           ├── custom-agent-1.json
│           └── custom-agent-2.json
└── src/
    └── agents/
        └── templates/        # Built-in templates
            ├── frontend-specialist.json
            ├── backend-specialist.json
            └── ...
```






















