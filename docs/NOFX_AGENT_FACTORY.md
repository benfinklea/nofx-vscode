# NofX Agent Factory Documentation

**The Unified Agent Creation System for NofX VS Code Extension**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Agent Types](#core-agent-types)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Specializations](#specializations)
7. [Dynamic Prompt Generation](#dynamic-prompt-generation)
8. [Project Context Analysis](#project-context-analysis)
9. [Natural Language Processing](#natural-language-processing)
10. [Integration Guide](#integration-guide)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The **NofX Agent Factory** is the **single, unified system** for creating AI agents in the NofX VS Code extension. It replaces all previous template systems (AgentTemplateManager, SmartTemplateSystem, etc.) and provides a consistent, powerful interface for agent creation.

### Key Features

- ✅ **5 Core Agent Types** with specialized capabilities
- ✅ **Dynamic Prompt Generation** based on project context
- ✅ **Specializations** for deep expertise areas
- ✅ **Natural Language Parsing** for user-friendly agent creation
- ✅ **Project-Aware Context** analysis
- ✅ **Singleton Pattern** for consistency
- ✅ **Backward Compatibility** with existing systems

### Design Philosophy

> **"One Factory to Rule Them All"**
> 
> Instead of multiple competing template systems, NofX uses a single, powerful factory that can create any type of agent through composition and specialization.

---

## Architecture

### Class Structure

```typescript
export class NofxAgentFactory {
    private static instance: NofxAgentFactory;
    private workspacePath: string;
    private coreAgentTypes: CoreAgentType[];
    
    // Singleton access
    static getInstance(workspacePath?: string): NofxAgentFactory
    
    // Core API
    createAgent(request: AgentCreationRequest): AgentTemplate
    createAgentFromDescription(description: string): Promise<AgentTemplate>
    getCoreAgentTypes(): CoreAgentType[]
    getSpecializations(coreTypeId: string): AgentSpecialization[]
}
```

### Core Interfaces

```typescript
interface CoreAgentType {
    id: string;                    // 'frontend', 'backend', etc.
    name: string;                  // Human-readable name
    icon: string;                  // Emoji icon
    terminalIcon: string;          // VS Code icon
    color: string;                 // Hex color
    basePrompt: string;            // Base system prompt
    coreSkills: string[];          // Primary technologies
    primaryDomains: string[];      // Work areas
    specializations: AgentSpecialization[];
}

interface AgentCreationRequest {
    coreType: string;              // Required: which core type
    specialization?: string;       // Optional: specific specialization
    customName?: string;           // Optional: custom agent name
    projectContext?: string;       // Optional: project-specific context
    customInstructions?: string;   // Optional: additional instructions
    additionalSkills?: string[];   // Optional: extra skills
}

interface AgentTemplate {
    id: string;                    // Unique identifier
    name: string;                  // Agent display name
    icon: string;                  // Display icon
    systemPrompt: string;          // Complete system prompt
    capabilities: {                // Agent capabilities
        languages: {
            primary: string[];
            secondary: string[];
        };
    };
    taskPreferences: {             // Task preferences
        preferred: string[];
        avoid: string[];
        priority: string;
        complexity: string;
    };
}
```

---

## Core Agent Types

The factory provides **5 core agent types**, each with distinct capabilities and specializations:

### 1. Frontend Developer (`frontend`)

**Purpose**: Modern web development, responsive design, exceptional user experiences

**Core Skills**: `react`, `typescript`, `css`, `html`, `javascript`

**Primary Domains**: `ui`, `frontend`, `web`, `mobile-web`

**Specializations**:
- **React Specialist**: React ecosystem expert
- **Vue.js Specialist**: Vue.js and progressive web apps
- **UI/UX Specialist**: Interface design and user experience

### 2. Backend Developer (`backend`)

**Purpose**: Server architecture, APIs, distributed systems, scalable infrastructure

**Core Skills**: `node.js`, `typescript`, `python`, `sql`, `api-design`

**Primary Domains**: `api`, `backend`, `server`, `database`, `microservices`

**Specializations**:
- **API Development Specialist**: RESTful and GraphQL APIs
- **Database Specialist**: Database architecture and optimization
- **Microservices Specialist**: Distributed systems and orchestration

### 3. Fullstack Developer (`fullstack`)

**Purpose**: End-to-end application development, system integration, complete features

**Core Skills**: `react`, `node.js`, `typescript`, `python`, `sql`, `api-design`

**Primary Domains**: `fullstack`, `web-apps`, `integration`, `features`

**Specializations**:
- **MERN Stack Specialist**: MongoDB, Express, React, Node.js
- **JAMstack Specialist**: JavaScript, APIs, and Markup architecture

### 4. Testing Specialist (`testing`)

**Purpose**: Quality assurance, test automation, comprehensive testing strategies

**Core Skills**: `jest`, `cypress`, `playwright`, `testing-library`, `quality-assurance`

**Primary Domains**: `testing`, `quality-assurance`, `automation`, `performance`

**Specializations**:
- **E2E Testing Specialist**: End-to-end testing and automation
- **Performance Testing Specialist**: Performance testing and optimization

### 5. DevOps Engineer (`devops`)

**Purpose**: CI/CD, infrastructure automation, deployment strategies

**Core Skills**: `docker`, `kubernetes`, `aws`, `terraform`, `ci-cd`

**Primary Domains**: `devops`, `infrastructure`, `deployment`, `automation`, `monitoring`

**Specializations**:
- **AWS Cloud Specialist**: Amazon Web Services and cloud infrastructure
- **Kubernetes Specialist**: Container orchestration and Kubernetes

---

## API Reference

### Basic Usage

```typescript
import { NofxAgentFactory } from './agents/NofxAgentFactory';

// Get factory instance
const factory = NofxAgentFactory.getInstance();

// Create a basic frontend agent
const frontendAgent = factory.createAgent({
    coreType: 'frontend',
    customName: 'UI Expert'
});

// Create a specialized backend agent
const apiAgent = factory.createAgent({
    coreType: 'backend',
    specialization: 'api-specialist',
    customName: 'API Developer',
    customInstructions: 'Focus on GraphQL APIs'
});
```

### Natural Language Creation

```typescript
// Create agent from natural language description
const agent = await factory.createAgentFromDescription(
    "I need a React specialist who can help with performance optimization"
);
// Returns: Frontend agent with React specialization
```

### Advanced Usage

```typescript
// Get all available core types
const coreTypes = factory.getCoreAgentTypes();

// Get specializations for a specific type
const frontendSpecs = factory.getSpecializations('frontend');

// Create with full context
const contextualAgent = factory.createAgent({
    coreType: 'fullstack',
    specialization: 'mern-specialist',
    customName: 'MERN Expert',
    projectContext: 'E-commerce platform with React frontend',
    customInstructions: 'Focus on scalable architecture',
    additionalSkills: ['redis', 'elasticsearch']
});
```

---

## Usage Examples

### Example 1: Basic Agent Creation

```typescript
// Create a simple frontend developer
const factory = NofxAgentFactory.getInstance();
const agent = factory.createAgent({
    coreType: 'frontend',
    customName: 'Frontend Dev'
});

console.log(agent.name);         // "Frontend Dev"
console.log(agent.icon);         // "🎨"
console.log(agent.systemPrompt); // Full system prompt
```

### Example 2: Specialized Agent

```typescript
// Create a specialized API developer
const apiDeveloper = factory.createAgent({
    coreType: 'backend',
    specialization: 'api-specialist',
    customName: 'API Expert',
    customInstructions: 'Focus on GraphQL and real-time APIs'
});

// The agent will have:
// - Base backend prompt
// - API specialization details
// - Custom instructions
// - Additional API-specific skills
```

### Example 3: Project-Aware Agent

```typescript
// Create agent with project context
const projectAgent = factory.createAgent({
    coreType: 'fullstack',
    customName: 'E-commerce Developer',
    projectContext: 'Project: nofx-vscode | Tech Stack: TypeScript, VS Code Extension',
    customInstructions: 'Expert in VS Code extension development'
});

// System prompt will include:
// - Base fullstack prompt
// - Project context about VS Code extensions
// - TypeScript specialization
// - Custom instructions
```

### Example 4: Natural Language Creation

```typescript
// Various natural language inputs
const examples = [
    "Create a React developer who knows TypeScript",
    "I need help with backend APIs and databases", 
    "Testing specialist for end-to-end automation",
    "DevOps engineer with AWS experience",
    "Fullstack developer for MERN stack projects"
];

for (const description of examples) {
    const agent = await factory.createAgentFromDescription(description);
    console.log(`Created: ${agent.name} (${agent.description})`);
}
```

---

## Specializations

Each core agent type includes specialized variants for deep expertise:

### Frontend Specializations

```typescript
// React Specialist
const reactDev = factory.createAgent({
    coreType: 'frontend',
    specialization: 'react-specialist'
});
// Additional skills: next.js, react-router, redux, context-api
// Preferred tasks: react-components, state-management, routing
// Avoids: backend-apis, database-design

// Vue.js Specialist  
const vueDev = factory.createAgent({
    coreType: 'frontend',
    specialization: 'vue-specialist'  
});
// Additional skills: vuex, vue-router, nuxt.js, composition-api
// Preferred tasks: vue-components, spa-development

// UI/UX Specialist
const uiDev = factory.createAgent({
    coreType: 'frontend',
    specialization: 'ui-specialist'
});
// Additional skills: figma, design-systems, animation, accessibility
// Preferred tasks: ui-components, styling, animations, responsive-design
```

### Backend Specializations

```typescript
// API Development Specialist
const apiDev = factory.createAgent({
    coreType: 'backend',
    specialization: 'api-specialist'
});
// Additional skills: openapi, swagger, graphql, postman
// Preferred tasks: api-design, endpoint-development, api-documentation

// Database Specialist
const dbDev = factory.createAgent({
    coreType: 'backend', 
    specialization: 'database-specialist'
});
// Additional skills: postgresql, mongodb, redis, elasticsearch
// Preferred tasks: schema-design, query-optimization, performance-tuning

// Microservices Specialist
const microDev = factory.createAgent({
    coreType: 'backend',
    specialization: 'microservices-specialist' 
});
// Additional skills: docker, kubernetes, service-mesh, message-queues
// Preferred tasks: service-design, distributed-architecture, scalability
```

---

## Dynamic Prompt Generation

The factory generates system prompts dynamically by combining:

### 1. Base Prompt (Core Type)
Each core type has a comprehensive base prompt covering:
- Core expertise areas
- Development methodology  
- Best practices
- Expected deliverables

### 2. Specialization Details (Optional)
When a specialization is specified:
- Additional skills are added
- Specialized description included
- Preferred/avoided tasks specified

### 3. Project Context (Auto-detected)
The factory analyzes the current project:
- Reads `package.json` for framework detection
- Analyzes directory structure
- Detects technology stack
- Adds relevant context to prompt

### 4. Custom Instructions (User-provided)
Additional user instructions are appended:
- Specific requirements
- Custom focus areas
- Project-specific needs

### Example Generated Prompt

```
You are a Frontend Development Specialist expert in modern web development...

## Core Expertise
- Modern JavaScript/TypeScript: ES6+, type safety, async patterns
- React Ecosystem: Components, hooks, state management
...

## Specialization
You specialize in: **React Specialist**
Expert in React ecosystem and modern frontend development

## Additional Skills
- next.js
- react-router
- redux
- context-api

## Project Context
Project: nofx-vscode | Tech Stack: TypeScript, VS Code Extension | Has src/ | Has tests/

## Custom Instructions
Focus on VS Code extension development patterns

Part of NofX.dev team. IMPORTANT: First, run 'git status' and 'ls -la' to understand the current project structure and state, then await further instructions.
```

---

## Project Context Analysis

The factory automatically analyzes the current workspace to provide relevant context:

### Framework Detection

```typescript
// Detected from package.json dependencies
const frameworks = [];
if (deps.react) frameworks.push('React');
if (deps.vue) frameworks.push('Vue');
if (deps.angular) frameworks.push('Angular');
if (deps.express) frameworks.push('Express');
if (deps.next) frameworks.push('Next.js');
if (deps.typescript) frameworks.push('TypeScript');
if (deps.vscode) frameworks.push('VS Code Extension');
```

### File Structure Analysis

```typescript
// Detected from directory structure
if (directories.includes('src')) context += ' | Has src/';
if (directories.includes('test')) context += ' | Has tests/';
if (directories.includes('docs')) context += ' | Has docs/';
if (directories.includes('scripts')) context += ' | Has scripts/';
```

### Context Examples

```typescript
// Example contexts generated:
"Project: my-app | Tech Stack: React, TypeScript, Testing | Has src/ | Has tests/"
"Project: api-server | Tech Stack: Express, TypeScript | Has src/ | Has docs/"
"Project: nofx-vscode | Tech Stack: TypeScript, VS Code Extension | Has src/ | Has tests/ | Has scripts/"
```

---

## Natural Language Processing

The factory includes built-in natural language processing for user-friendly agent creation:

### Keyword Detection

```typescript
const parseDescription = (description: string) => {
    const lowerDesc = description.toLowerCase();
    let coreType = 'fullstack'; // default
    
    if (lowerDesc.includes('frontend') || lowerDesc.includes('ui') || lowerDesc.includes('react')) {
        coreType = 'frontend';
    } else if (lowerDesc.includes('backend') || lowerDesc.includes('api') || lowerDesc.includes('server')) {
        coreType = 'backend'; 
    } else if (lowerDesc.includes('test') || lowerDesc.includes('qa')) {
        coreType = 'testing';
    } else if (lowerDesc.includes('devops') || lowerDesc.includes('deploy')) {
        coreType = 'devops';
    }
    
    return coreType;
};
```

### Natural Language Examples

| Input Description | Detected Type | Reasoning |
|-------------------|---------------|-----------|
| "React developer with TypeScript" | `frontend` | Contains "react" |
| "API developer for microservices" | `backend` | Contains "api" |
| "End-to-end testing automation" | `testing` | Contains "test" |
| "Kubernetes deployment expert" | `devops` | Contains "deploy" |
| "Full-stack MERN developer" | `fullstack` | Default (no specific keywords) |

---

## Integration Guide

### With AgentManager

```typescript
// AgentManager automatically uses NofxAgentFactory
import { AgentManager } from './agents/AgentManager';

const agentManager = new AgentManager(context);

// This internally uses NofxAgentFactory
await agentManager.spawnAgent({
    name: 'Frontend Expert',
    type: 'frontend-specialist',
    customInstructions: 'Focus on React performance'
});
```

### With ConductorCommands

```typescript
// ConductorCommands uses factory for team creation
import { NofxAgentFactory } from '../agents/NofxAgentFactory';

const factory = NofxAgentFactory.getInstance();
const template = factory.createAgent({
    coreType: 'fullstack',
    customName: 'Team Lead'
});

await this.agentManager.spawnAgent({
    name: template.name,
    type: template.id,
    template: template
});
```

### Custom Integration

```typescript
// Custom service using the factory
export class CustomAgentService {
    private factory: NofxAgentFactory;
    
    constructor() {
        this.factory = NofxAgentFactory.getInstance();
    }
    
    async createSpecializedTeam(projectType: string) {
        const agents = [];
        
        switch (projectType) {
            case 'web-app':
                agents.push(this.factory.createAgent({
                    coreType: 'frontend',
                    specialization: 'react-specialist'
                }));
                agents.push(this.factory.createAgent({
                    coreType: 'backend', 
                    specialization: 'api-specialist'
                }));
                break;
                
            case 'microservices':
                agents.push(this.factory.createAgent({
                    coreType: 'backend',
                    specialization: 'microservices-specialist'
                }));
                agents.push(this.factory.createAgent({
                    coreType: 'devops',
                    specialization: 'kubernetes-specialist'
                }));
                break;
        }
        
        return agents;
    }
}
```

---

## Best Practices

### 1. Use Singleton Pattern

```typescript
// ✅ Correct - use singleton
const factory = NofxAgentFactory.getInstance();

// ❌ Incorrect - don't create new instances
const factory = new NofxAgentFactory('/path'); 
```

### 2. Specify Workspace Path

```typescript
// ✅ Correct - provide workspace path for context analysis
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
const factory = NofxAgentFactory.getInstance(workspaceFolder?.uri.fsPath);

// ❌ Less optimal - no workspace context
const factory = NofxAgentFactory.getInstance();
```

### 3. Use Appropriate Core Types

```typescript
// ✅ Correct - specific core type for focused work
const uiAgent = factory.createAgent({
    coreType: 'frontend',
    specialization: 'ui-specialist'
});

// ❌ Less optimal - too generic for specialized work
const genericAgent = factory.createAgent({
    coreType: 'fullstack'
});
```

### 4. Provide Context

```typescript
// ✅ Correct - rich context
const agent = factory.createAgent({
    coreType: 'backend',
    customName: 'API Developer',
    projectContext: 'E-commerce platform requiring scalable APIs',
    customInstructions: 'Focus on performance and security'
});

// ❌ Minimal - works but less effective
const agent = factory.createAgent({
    coreType: 'backend'
});
```

### 5. Handle Errors Gracefully

```typescript
// ✅ Correct - handle errors
try {
    const agent = factory.createAgent({
        coreType: 'unknown-type' // This will throw
    });
} catch (error) {
    console.error('Failed to create agent:', error.message);
    // Fallback to default
    const agent = factory.createAgent({
        coreType: 'fullstack'
    });
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Unknown core agent type" Error

```typescript
// Error: Unknown core agent type: frontend-developer
const agent = factory.createAgent({
    coreType: 'frontend-developer' // ❌ Wrong
});

// Fix: Use correct core type ID
const agent = factory.createAgent({
    coreType: 'frontend' // ✅ Correct
});
```

**Valid core types**: `frontend`, `backend`, `fullstack`, `testing`, `devops`

#### 2. "Cannot find module" Error

```typescript
// Error: Cannot find module './NofxAgentFactory'
import { NofxAgentFactory } from './NofxAgentFactory';

// Fix: Check import path
import { NofxAgentFactory } from '../agents/NofxAgentFactory';
```

#### 3. Missing Specialization

```typescript
// Warning: Specialization 'react-expert' not found
const agent = factory.createAgent({
    coreType: 'frontend',
    specialization: 'react-expert' // ❌ Wrong
});

// Fix: Use correct specialization ID  
const agent = factory.createAgent({
    coreType: 'frontend',
    specialization: 'react-specialist' // ✅ Correct
});
```

**Available specializations**: Check with `factory.getSpecializations(coreType)`

#### 4. Workspace Context Issues

```typescript
// Issue: No project context detected
// Reason: No workspace folder open

// Fix: Ensure workspace is open or provide fallback
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
if (!workspaceFolder) {
    console.warn('No workspace open - limited context available');
}
const factory = NofxAgentFactory.getInstance(workspaceFolder?.uri.fsPath);
```

### Debug Methods

```typescript
// Get available core types
const coreTypes = factory.getCoreAgentTypes();
console.log('Available core types:', coreTypes.map(t => t.id));

// Get specializations for a type
const frontendSpecs = factory.getSpecializations('frontend');
console.log('Frontend specializations:', frontendSpecs.map(s => s.id));

// Test natural language parsing
const testDesc = "React developer with TypeScript";
const agent = await factory.createAgentFromDescription(testDesc);
console.log('Created agent:', agent.name, agent.description);
```

### Performance Considerations

#### 1. Factory Initialization

```typescript
// ✅ Good - initialize once, reuse
const factory = NofxAgentFactory.getInstance();
// Use factory multiple times...

// ❌ Bad - multiple initializations
for (let i = 0; i < 10; i++) {
    const factory = NofxAgentFactory.getInstance(); // Wasteful
}
```

#### 2. Bulk Agent Creation

```typescript
// ✅ Efficient - batch creation
const factory = NofxAgentFactory.getInstance();
const configs = [/* multiple configs */];
const agents = configs.map(config => factory.createAgent(config));

// ❌ Inefficient - repeated factory access
const agents = configs.map(config => {
    const factory = NofxAgentFactory.getInstance(); // Redundant
    return factory.createAgent(config);
});
```

---

## Migration Guide

### From AgentTemplateManager

```typescript
// OLD - AgentTemplateManager
const templateManager = new AgentTemplateManager(workspacePath);
const template = await templateManager.getTemplate('frontend-specialist');

// NEW - NofxAgentFactory  
const factory = NofxAgentFactory.getInstance(workspacePath);
const template = factory.createAgent({
    coreType: 'frontend',
    customName: 'Frontend Specialist'
});
```

### From SmartTemplateSystem

```typescript
// OLD - SmartTemplateSystem
const template = SmartTemplateFactory.createTemplate({
    category: 'developer',
    primaryDomain: 'frontend'
});

// NEW - NofxAgentFactory
const factory = NofxAgentFactory.getInstance();
const template = factory.createAgent({
    coreType: 'frontend'
});
```

### From Natural Language Resolver

```typescript
// OLD - NaturalLanguageTemplateResolver
const parseResult = NaturalLanguageTemplateResolver.parseNaturalLanguageRequest(request);
const template = SmartTemplateFactory.createTemplate(parseResult.parsedIntent);

// NEW - NofxAgentFactory
const factory = NofxAgentFactory.getInstance();
const template = await factory.createAgentFromDescription(request);
```

---

## Conclusion

The **NofX Agent Factory** provides a powerful, unified system for creating AI agents with:

- **Consistency**: One system, one API, predictable behavior
- **Flexibility**: 5 core types, multiple specializations, custom configuration
- **Intelligence**: Project-aware context, natural language processing
- **Simplicity**: Clean API, comprehensive documentation, easy integration

By consolidating all template systems into a single factory, NofX achieves better maintainability, consistency, and developer experience while providing more powerful agent creation capabilities.

---

**For Support**: Check the [troubleshooting section](#troubleshooting) or file an issue in the NofX repository.

**For Contributing**: See the integration guide and best practices before adding new features to the factory.