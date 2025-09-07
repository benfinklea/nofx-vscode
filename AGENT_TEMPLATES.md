# 🤖 NofX Agent Templates Guide

## Overview

Agent Templates are JSON-based configurations that define specialized AI agents with specific capabilities, behaviors, and preferences. They make it easy to create, share, and reuse agent types.

## Quick Start

### Using Built-in Templates

1. **Browse Templates**: `Cmd+Shift+P` → "NofX: Browse Agent Templates"
2. **Select a Template**: Choose from built-in templates like Frontend Specialist, Backend Expert, etc.
3. **Spawn Agent**: Click "Spawn Agent" and give it a name

### Creating Custom Templates

1. **Open Editor**: `Cmd+Shift+P` → "NofX: Create Agent Template"
2. **Fill in Details**: Use the visual editor to configure your agent
3. **Save**: Your template is saved to `.nofx/templates/custom/`

## Template Structure

```json
{
  "id": "unique-identifier",
  "name": "Display Name",
  "icon": "🎨",
  "description": "What this agent specializes in",
  "tags": ["frontend", "react", "typescript"],
  
  "capabilities": {
    "languages": ["typescript", "javascript"],
    "frameworks": ["react", "next.js"],
    "tools": ["webpack", "vite"],
    "testing": ["jest", "cypress"],
    "specialties": ["responsive-design", "performance"]
  },
  
  "systemPrompt": "Detailed instructions for the agent...",
  
  "taskPreferences": {
    "preferred": ["ui-component", "styling"],
    "avoid": ["database", "backend"],
    "priority": "high"
  }
}
```

## File Locations

```
workspace/
├── .nofx/
│   └── templates/
│       ├── frontend.json       # Built-in templates
│       ├── backend.json
│       ├── devops.json
│       └── custom/             # Your custom templates
│           └── my-agent.json
```

## Template Features

### 1. Smart Task Assignment
Templates include `taskPreferences` that help the conductor automatically assign the right tasks to the right agents.

### 2. System Prompts
Each template has a detailed `systemPrompt` that defines the agent's expertise, working principles, and quality standards.

### 3. File Patterns
Templates can specify which files they should watch or ignore:
```json
"filePatterns": {
  "watch": ["*.tsx", "components/**"],
  "ignore": ["*.sql", "backend/**"]
}
```

### 4. Custom Commands
Define shortcuts for common operations:
```json
"commands": {
  "test": "npm test",
  "build": "npm run build",
  "lint": "eslint ."
}
```

### 5. Code Snippets
Include helpful code snippets the agent can use:
```json
"snippets": {
  "component": "React component template...",
  "hook": "Custom hook template..."
}
```

## Managing Templates

### Edit Existing Template
1. `Cmd+Shift+P` → "NofX: Edit Agent Template"
2. Select the template to edit
3. The JSON file opens in the editor

### Import Template
1. `Cmd+Shift+P` → "NofX: Import Agent Template"
2. Select a JSON file to import
3. Template is added to your custom templates

### Export Template
1. Browse templates and select one
2. Choose "Export Template"
3. Save the JSON file to share with others

### Duplicate Template
1. Browse templates and select one
2. Choose "Duplicate Template"
3. Give it a new name
4. Edit the copy as needed

## Best Practices

### 1. Specific System Prompts
Be detailed in your system prompts. Include:
- Core responsibilities
- Technical expertise
- Working principles
- Quality standards
- Common patterns to follow

### 2. Meaningful Tags
Use tags that help identify when this agent should be used:
- Technology tags: `react`, `nodejs`, `python`
- Domain tags: `frontend`, `backend`, `database`
- Skill tags: `optimization`, `security`, `testing`

### 3. Task Preferences
Configure preferences to help with automatic task assignment:
- **Preferred**: Tasks this agent excels at
- **Avoid**: Tasks better suited for other agents
- **Priority**: How important this agent's tasks typically are

### 4. Version Your Templates
Include version numbers to track changes:
```json
"version": "1.2.0",
"author": "Your Name"
```

## Example Templates

### Frontend Specialist
- **Focus**: React, TypeScript, UI/UX
- **Preferred Tasks**: Component development, styling, responsive design
- **Avoids**: Backend logic, database operations

### Backend Engineer
- **Focus**: Node.js, APIs, Databases
- **Preferred Tasks**: API development, data modeling, authentication
- **Avoids**: UI styling, animations

### DevOps Expert
- **Focus**: CI/CD, Infrastructure, Deployment
- **Preferred Tasks**: Pipeline setup, containerization, monitoring
- **Avoids**: Business logic, UI development

### AI/ML Specialist
- **Focus**: Machine Learning, Data Science
- **Preferred Tasks**: Model training, data analysis, optimization
- **Avoids**: Frontend, infrastructure

## Sharing Templates

### Within Team
1. Export template to JSON file
2. Commit to repository in `.nofx/templates/`
3. Team members get it automatically

### Community Sharing (Coming Soon)
- Upload to NofX Template Gallery
- Browse community templates
- Rate and review templates
- Fork and improve existing templates

## Advanced Features

### Dynamic Templates
Templates can include variables that get replaced at spawn time:
```json
"systemPrompt": "You are working on the ${PROJECT_NAME} project..."
```

### Template Inheritance (Planned)
```json
"extends": "backend-specialist",
"overrides": {
  "capabilities": {
    "frameworks": ["fastify"]
  }
}
```

### Conditional Capabilities (Planned)
```json
"conditionalCapabilities": {
  "if": "project.type === 'react'",
  "then": {
    "frameworks": ["react", "redux"]
  }
}
```

## Troubleshooting

### Template Not Loading
- Check JSON syntax is valid
- Ensure required fields (id, name, systemPrompt) are present
- Look for errors in Output panel

### Agent Not Using Template
- Verify template was selected during spawn
- Check agent's terminal shows correct system prompt
- Ensure template ID matches

### Task Assignment Issues
- Review taskPreferences configuration
- Check if tags match task descriptions
- Verify priority settings

## Tips

1. **Start Simple**: Begin with basic templates and add complexity as needed
2. **Test Thoroughly**: Spawn test agents to verify behavior
3. **Document Well**: Include clear descriptions and examples
4. **Share Knowledge**: Export successful templates for team use
5. **Iterate**: Refine templates based on agent performance

## Command Reference

- `NofX: Browse Agent Templates` - Open template browser
- `NofX: Create Agent Template` - Open template editor
- `NofX: Edit Agent Template` - Modify existing template
- `NofX: Import Agent Template` - Load template from file

---

*Happy Agent Crafting! 🚀*