/**
 * NofxAgentFactory - Unified agent creation system
 * Consolidates SmartTemplateSystem, AgentTemplateManager, DynamicPromptWriter, and NaturalLanguageTemplateResolver
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Core interfaces
export interface CoreAgentType {
    id: string;
    name: string;
    icon: string;
    terminalIcon: string;
    color: string;
    basePrompt: string;
    coreSkills: string[];
    primaryDomains: string[];
    specializations: AgentSpecialization[];
}

export interface AgentSpecialization {
    id: string;
    name: string;
    description: string;
    additionalSkills: string[];
    preferredTasks: string[];
    avoidTasks: string[];
}

export interface AgentCreationRequest {
    coreType: string;
    specialization?: string;
    customName?: string;
    projectContext?: string;
    customInstructions?: string;
    additionalSkills?: string[];
}

export interface AgentTemplate {
    id: string;
    name: string;
    icon: string;
    terminalIcon: string;
    color: string;
    description: string;
    version: string;
    systemPrompt: string;
    detailedPrompt: string;
    capabilities: {
        languages: {
            primary: string[];
            secondary: string[];
        };
    };
    taskPreferences: {
        preferred: string[];
        avoid: string[];
        priority: string;
        complexity: string;
    };
}

// ===== UNIFIED AGENT FACTORY =====
export class NofxAgentFactory {
    private static instance: NofxAgentFactory;
    private workspacePath: string;
    private coreAgentTypes: CoreAgentType[];

    constructor(workspacePath: string) {
        this.coreAgentTypes = [
            {
                id: 'frontend',
                name: 'Frontend Developer',
                icon: '🎨',
                terminalIcon: 'browser',
                color: '#61DAFB',
                basePrompt: NofxAgentFactory.generateFrontendPrompt(),
                coreSkills: ['react', 'typescript', 'css', 'html', 'javascript'],
                primaryDomains: ['ui', 'frontend', 'web', 'mobile-web'],
                specializations: [
                    {
                        id: 'react-specialist',
                        name: 'React Specialist',
                        description: 'Expert in React ecosystem and modern frontend development',
                        additionalSkills: ['next.js', 'react-router', 'redux', 'context-api', 'react-query'],
                        preferredTasks: ['react-components', 'state-management', 'routing', 'performance-optimization'],
                        avoidTasks: ['backend-apis', 'database-design', 'server-configuration']
                    },
                    {
                        id: 'vue-specialist',
                        name: 'Vue.js Specialist',
                        description: 'Expert in Vue.js ecosystem and progressive web apps',
                        additionalSkills: ['vuex', 'vue-router', 'nuxt.js', 'composition-api', 'pinia'],
                        preferredTasks: ['vue-components', 'state-management', 'spa-development'],
                        avoidTasks: ['backend-logic', 'database-operations', 'server-deployment']
                    },
                    {
                        id: 'ui-specialist',
                        name: 'UI/UX Specialist',
                        description: 'Expert in user interface design and user experience',
                        additionalSkills: ['figma', 'design-systems', 'animation', 'accessibility', 'responsive-design'],
                        preferredTasks: ['ui-components', 'styling', 'animations', 'responsive-design', 'accessibility'],
                        avoidTasks: ['backend-logic', 'database-operations', 'api-development']
                    }
                ]
            },
            {
                id: 'backend',
                name: 'Backend Developer',
                icon: '⚙️',
                terminalIcon: 'server',
                color: '#68A063',
                basePrompt: NofxAgentFactory.generateBackendPrompt(),
                coreSkills: ['node.js', 'typescript', 'python', 'sql', 'api-design'],
                primaryDomains: ['api', 'backend', 'server', 'database', 'microservices'],
                specializations: [
                    {
                        id: 'api-specialist',
                        name: 'API Development Specialist',
                        description: 'Expert in RESTful and GraphQL API development',
                        additionalSkills: ['openapi', 'swagger', 'graphql', 'postman', 'api-testing'],
                        preferredTasks: ['api-design', 'endpoint-development', 'api-documentation', 'api-testing'],
                        avoidTasks: ['ui-design', 'frontend-styling', 'user-interfaces']
                    },
                    {
                        id: 'database-specialist',
                        name: 'Database Specialist',
                        description: 'Expert in database architecture and optimization',
                        additionalSkills: ['postgresql', 'mongodb', 'redis', 'elasticsearch', 'database-optimization'],
                        preferredTasks: ['schema-design', 'query-optimization', 'database-migrations', 'performance-tuning'],
                        avoidTasks: ['ui-components', 'styling', 'frontend-frameworks']
                    },
                    {
                        id: 'microservices-specialist',
                        name: 'Microservices Specialist',
                        description: 'Expert in distributed systems and microservices architecture',
                        additionalSkills: ['docker', 'kubernetes', 'service-mesh', 'distributed-systems', 'message-queues'],
                        preferredTasks: ['service-design', 'inter-service-communication', 'scalability', 'distributed-architecture'],
                        avoidTasks: ['frontend-components', 'ui-styling', 'client-side-logic']
                    }
                ]
            },
            {
                id: 'fullstack',
                name: 'Fullstack Developer',
                icon: '🚀',
                terminalIcon: 'layers',
                color: '#E74C3C',
                basePrompt: NofxAgentFactory.generateFullstackPrompt(),
                coreSkills: ['react', 'node.js', 'typescript', 'python', 'sql', 'api-design'],
                primaryDomains: ['fullstack', 'web-apps', 'integration', 'features'],
                specializations: [
                    {
                        id: 'mern-specialist',
                        name: 'MERN Stack Specialist',
                        description: 'Expert in MongoDB, Express, React, Node.js stack',
                        additionalSkills: ['mongodb', 'express', 'react', 'node.js', 'jwt'],
                        preferredTasks: ['full-stack-features', 'mern-development', 'authentication', 'crud-operations'],
                        avoidTasks: ['devops-deployment', 'infrastructure-setup']
                    },
                    {
                        id: 'jamstack-specialist',
                        name: 'JAMstack Specialist',
                        description: 'Expert in JavaScript, APIs, and Markup architecture',
                        additionalSkills: ['gatsby', 'next.js', 'netlify', 'vercel', 'headless-cms'],
                        preferredTasks: ['static-sites', 'jamstack-development', 'headless-architecture'],
                        avoidTasks: ['server-administration', 'database-administration']
                    }
                ]
            },
            {
                id: 'testing',
                name: 'Testing Specialist',
                icon: '🧪',
                terminalIcon: 'beaker',
                color: '#2ECC71',
                basePrompt: NofxAgentFactory.generateTestingPrompt(),
                coreSkills: ['jest', 'cypress', 'playwright', 'testing-library', 'quality-assurance'],
                primaryDomains: ['testing', 'quality-assurance', 'automation', 'performance'],
                specializations: [
                    {
                        id: 'e2e-specialist',
                        name: 'E2E Testing Specialist',
                        description: 'Expert in end-to-end testing and automation',
                        additionalSkills: ['cypress', 'playwright', 'selenium', 'test-automation'],
                        preferredTasks: ['e2e-testing', 'test-automation', 'user-journey-testing'],
                        avoidTasks: ['backend-development', 'database-design']
                    },
                    {
                        id: 'performance-testing-specialist',
                        name: 'Performance Testing Specialist',
                        description: 'Expert in performance testing and optimization',
                        additionalSkills: ['lighthouse', 'web-vitals', 'load-testing', 'performance-monitoring'],
                        preferredTasks: ['performance-testing', 'load-testing', 'optimization'],
                        avoidTasks: ['ui-design', 'frontend-styling']
                    }
                ]
            },
            {
                id: 'devops',
                name: 'DevOps Engineer',
                icon: '🔧',
                terminalIcon: 'tools',
                color: '#FF6B35',
                basePrompt: NofxAgentFactory.generateDevOpsPrompt(),
                coreSkills: ['docker', 'kubernetes', 'aws', 'terraform', 'ci-cd'],
                primaryDomains: ['devops', 'infrastructure', 'deployment', 'automation', 'monitoring'],
                specializations: [
                    {
                        id: 'aws-specialist',
                        name: 'AWS Cloud Specialist',
                        description: 'Expert in Amazon Web Services and cloud infrastructure',
                        additionalSkills: ['cloudformation', 'lambda', 'ecs', 'rds', 'cloudwatch'],
                        preferredTasks: ['aws-deployment', 'cloud-architecture', 'serverless', 'cloud-migration'],
                        avoidTasks: ['frontend-development', 'ui-design', 'client-side-logic']
                    },
                    {
                        id: 'kubernetes-specialist',
                        name: 'Kubernetes Specialist',
                        description: 'Expert in container orchestration and Kubernetes',
                        additionalSkills: ['helm', 'istio', 'prometheus', 'grafana', 'kubectl'],
                        preferredTasks: ['container-orchestration', 'cluster-management', 'monitoring', 'scaling'],
                        avoidTasks: ['frontend-styling', 'ui-components', 'client-applications']
                    }
                ]
            }
        ];

        this.workspacePath = workspacePath;
    }

    static getInstance(workspacePath?: string): NofxAgentFactory {
        if (!NofxAgentFactory.instance) {
            const wsPath = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            NofxAgentFactory.instance = new NofxAgentFactory(wsPath);
        }
        return NofxAgentFactory.instance;
    }

    // ===== PUBLIC API =====

    /**
     * Get all available core agent types
     */
    getCoreAgentTypes(): CoreAgentType[] {
        return [...this.coreAgentTypes];
    }

    /**
     * Get a specific core agent type
     */
    getCoreAgentType(id: string): CoreAgentType | undefined {
        return this.coreAgentTypes.find(type => type.id === id);
    }

    /**
     * Get all specializations for a core agent type
     */
    getSpecializations(coreTypeId: string): AgentSpecialization[] {
        const coreType = this.getCoreAgentType(coreTypeId);
        return coreType?.specializations || [];
    }

    /**
     * Create agent from natural language description
     */
    async createAgentFromDescription(description: string): Promise<AgentTemplate> {
        // Simple NL parsing - can be enhanced later
        const lowerDesc = description.toLowerCase();
        let coreType = 'fullstack'; // default

        if (lowerDesc.includes('frontend') || lowerDesc.includes('ui') || lowerDesc.includes('react')) {
            coreType = 'frontend';
        } else if (lowerDesc.includes('backend') || lowerDesc.includes('api') || lowerDesc.includes('server')) {
            coreType = 'backend';
        } else if (lowerDesc.includes('test') || lowerDesc.includes('qa')) {
            coreType = 'testing';
        } else if (lowerDesc.includes('devops') || lowerDesc.includes('deploy') || lowerDesc.includes('infrastructure')) {
            coreType = 'devops';
        }

        return this.createAgent({
            coreType,
            customName: this.extractNameFromDescription(description),
            projectContext: description,
            customInstructions: `Based on this description: "${description}"`
        });
    }

    /**
     * Create agent with specific configuration
     */
    createAgent(request: AgentCreationRequest): AgentTemplate {
        const coreType = this.getCoreAgentType(request.coreType);
        if (!coreType) {
            throw new Error(`Unknown core agent type: ${request.coreType}`);
        }

        const specialization = request.specialization ? 
            coreType.specializations.find(s => s.id === request.specialization) : 
            undefined;

        const systemPrompt = this.generateSystemPrompt(coreType, specialization, request);
        const agentName = request.customName || 
            (specialization ? specialization.name : coreType.name);

        return {
            id: `${request.coreType}-${Date.now()}`,
            name: agentName,
            icon: coreType.icon,
            terminalIcon: coreType.terminalIcon,
            color: coreType.color,
            description: specialization?.description || `${coreType.name} specialist`,
            version: '3.0.0',
            systemPrompt,
            detailedPrompt: '',
            capabilities: {
                languages: {
                    primary: coreType.coreSkills,
                    secondary: [
                        ...(specialization?.additionalSkills || []),
                        ...(request.additionalSkills || [])
                    ]
                }
            },
            taskPreferences: {
                preferred: specialization?.preferredTasks || coreType.primaryDomains,
                avoid: specialization?.avoidTasks || [],
                priority: 'high',
                complexity: 'medium'
            }
        };
    }

    /**
     * Load legacy JSON templates for backward compatibility
     */
    async loadLegacyTemplates(): Promise<AgentTemplate[]> {
        const templatesPath = path.join(this.workspacePath, 'src', 'agents', 'templates');
        if (!fs.existsSync(templatesPath)) {
            return [];
        }

        const templates: AgentTemplate[] = [];
        const files = fs.readdirSync(templatesPath);

        for (const file of files) {
            if (file.endsWith('.json') && !file.includes('archived')) {
                try {
                    const filePath = path.join(templatesPath, file);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const template = JSON.parse(content);
                    templates.push(template);
                } catch (error) {
                    console.warn(`Failed to load template ${file}:`, error);
                }
            }
        }

        return templates;
    }

    // ===== PRIVATE PROMPT GENERATION =====

    private generateSystemPrompt(
        coreType: CoreAgentType, 
        specialization: AgentSpecialization | undefined, 
        request: AgentCreationRequest
    ): string {
        let prompt = coreType.basePrompt;

        // Add specialization details
        if (specialization) {
            prompt += `\n\n## Specialization\nYou specialize in: **${specialization.name}**\n${specialization.description}`;
            
            if (specialization.additionalSkills.length > 0) {
                prompt += `\n\n## Additional Skills\n${specialization.additionalSkills.map(skill => `- ${skill}`).join('\n')}`;
            }
        }

        // Add custom project context
        if (request?.projectContext) {
            prompt += `\n\n## Project Context\n${request.projectContext}`;
        }

        // Add custom instructions
        if (request?.customInstructions) {
            prompt += `\n\n## Custom Instructions\n${request.customInstructions}`;
        }

        // Add team context and final instructions
        prompt += `\n\nPart of NofX.dev team. IMPORTANT: First, run 'git status' and 'ls -la' to understand the current project structure and state, then await further instructions.`;

        return prompt;
    }

    private extractNameFromDescription(description: string): string {
        // Simple name extraction - can be enhanced
        if (description.includes('specialist')) {
            return description.substring(0, description.indexOf('specialist') + 10).trim();
        }
        return description.substring(0, 50).trim() + ' Agent';
    }

    // ===== STATIC PROMPT TEMPLATES =====

    private static generateFrontendPrompt(): string {
        return `You are a Frontend Development Specialist expert in modern web development, responsive design, and exceptional user experiences.

## Core Expertise
- **Modern JavaScript/TypeScript**: ES6+, type safety, async patterns
- **React Ecosystem**: Components, hooks, state management, performance optimization
- **CSS Mastery**: Flexbox, Grid, animations, responsive design, CSS-in-JS
- **UI/UX Implementation**: Accessibility (WCAG/ARIA), mobile-first design, cross-browser compatibility
- **Performance**: Bundle optimization, lazy loading, code splitting, Core Web Vitals
- **Testing**: Component testing, E2E testing, accessibility testing

## Development Methodology
- **User-Centric Design**: Prioritize user experience and accessibility
- **Performance-First**: Optimize for speed, efficiency, and responsiveness
- **Component Architecture**: Reusable, maintainable, well-documented components
- **Modern Tooling**: Webpack, Vite, ESLint, Prettier, testing frameworks

## Best Practices
- Semantic HTML and proper ARIA labels
- Progressive enhancement and graceful degradation
- Security considerations (XSS/CSRF prevention)
- SEO optimization and meta tag management
- Clean, readable, maintainable code with TypeScript

## Deliverables
Always provide production-ready code with proper error handling, loading states, and comprehensive documentation.`;
    }

    private static generateBackendPrompt(): string {
        return `You are a Backend Development Specialist expert in server architecture, APIs, distributed systems, and scalable infrastructure.

## Core Expertise
- **Server Architecture**: Microservices, monoliths, serverless, event-driven systems
- **API Development**: RESTful APIs, GraphQL, WebSocket, API versioning, documentation
- **Database Systems**: SQL/NoSQL design, optimization, migrations, connection pooling
- **Distributed Systems**: Load balancing, caching, message queues, circuit breakers
- **Performance**: Query optimization, caching strategies, horizontal scaling
- **Security**: Authentication, authorization, data protection, security best practices

## Development Methodology
- **Domain-Driven Design**: Clear boundaries, entities, aggregates, repositories
- **Clean Architecture**: Separation of concerns, dependency injection, testable code
- **Error Handling**: Comprehensive error management, logging, monitoring
- **API Design**: Consistent, well-documented, versioned APIs

## Best Practices
- Production-ready code with proper error handling
- Comprehensive logging and monitoring integration
- Database optimization and proper indexing
- Security-first approach with input validation
- Scalable, maintainable, well-tested code

## Deliverables
Provide robust, scalable backend solutions with proper documentation, error handling, and monitoring capabilities.`;
    }

    private static generateFullstackPrompt(): string {
        return `You are a Fullstack Development Specialist expert in end-to-end application development, system integration, and complete feature delivery.

## Core Expertise
- **Frontend Mastery**: React, Vue, Angular, modern CSS, responsive design
- **Backend Systems**: Node.js, Python, APIs, databases, server architecture
- **System Integration**: Frontend-backend communication, authentication, data flow
- **DevOps Understanding**: CI/CD, deployment, containerization, cloud platforms
- **Database Skills**: Design, optimization, migrations, both SQL and NoSQL
- **Testing**: Unit, integration, E2E testing across the full stack

## Development Methodology
- **End-to-End Thinking**: Consider full user journey from UI to data persistence
- **System Design**: Architect complete solutions with proper separation of concerns
- **Integration Focus**: Seamless communication between frontend and backend
- **Performance Optimization**: Full-stack performance considerations

## Best Practices
- Consistent data models across frontend and backend
- Proper error handling and user feedback throughout the stack
- Security considerations at every layer
- Scalable architecture that grows with requirements
- Clean, maintainable code with comprehensive testing

## Deliverables
Complete, integrated features that work seamlessly across the entire application stack with proper documentation and testing.`;
    }

    private static generateTestingPrompt(): string {
        return `You are a Testing Specialist expert in quality assurance, test automation, and comprehensive testing strategies.

## Core Expertise
- **Test Strategy**: Test planning, coverage analysis, risk assessment
- **Automated Testing**: Unit tests, integration tests, E2E testing frameworks
- **Quality Assurance**: Code review, testing best practices, quality metrics
- **Test Frameworks**: Jest, Cypress, Playwright, testing libraries
- **Performance Testing**: Load testing, stress testing, performance benchmarks
- **Security Testing**: Vulnerability assessment, penetration testing basics

## Development Methodology
- **Test-Driven Development**: Write tests first, ensure comprehensive coverage
- **Risk-Based Testing**: Focus on critical paths and high-risk areas
- **Continuous Testing**: Integrate testing into CI/CD pipelines
- **Quality Gates**: Establish clear criteria for release readiness

## Best Practices
- Comprehensive test coverage with meaningful assertions
- Clear, maintainable test code with good documentation
- Automated regression testing and continuous monitoring
- Performance and security testing integration
- Proper test data management and environment setup

## Deliverables
Robust testing suites, comprehensive test plans, and quality assurance processes that ensure reliable, high-quality software.`;
    }

    private static generateDevOpsPrompt(): string {
        return `You are a DevOps Engineering Specialist expert in CI/CD, infrastructure automation, and deployment strategies.

## Core Expertise
- **CI/CD Pipelines**: GitHub Actions, Jenkins, automated testing and deployment
- **Containerization**: Docker, Kubernetes, container orchestration
- **Cloud Platforms**: AWS, GCP, Azure, serverless architectures
- **Infrastructure as Code**: Terraform, CloudFormation, Ansible
- **Monitoring**: Logging, metrics, alerting, observability
- **Security**: DevSecOps, container security, secrets management

## Development Methodology
- **Infrastructure as Code**: Version-controlled, reproducible infrastructure
- **Automated Everything**: Minimize manual processes, maximize automation
- **Monitoring-First**: Build observability into every system
- **Security Integration**: Security throughout the development lifecycle

## Best Practices
- Immutable infrastructure and blue-green deployments
- Comprehensive monitoring and alerting
- Automated backup and disaster recovery
- Security scanning and compliance automation
- Cost optimization and resource management

## Deliverables
Robust, automated infrastructure solutions with comprehensive monitoring, security, and scalability built-in.`;
    }
}

export default NofxAgentFactory;