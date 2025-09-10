import * as vscode from 'vscode';

// ===== CONFIGURATION INTERFACES =====

export interface BaseAgentConfig {
    category: 'developer' | 'architect' | 'quality' | 'process';
    complexity: 'low' | 'medium' | 'high';
    priority: 'low' | 'medium' | 'high';
}

export interface DeveloperConfig extends BaseAgentConfig {
    category: 'developer';
    primaryDomain: 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'ai-ml' | 'data';
    languages: string[];
    frameworks: string[];
    specializations: string[];
    toolchain: string[];
}

export interface ArchitectConfig extends BaseAgentConfig {
    category: 'architect';
    scope: 'software' | 'database' | 'cloud' | 'integration' | 'performance' | 'security';
    focusAreas: string[];
    decisionLevel: 'tactical' | 'strategic' | 'operational';
    systemTypes: string[];
}

export interface QualityConfig extends BaseAgentConfig {
    category: 'quality';
    primaryFocus: 'testing' | 'security' | 'performance' | 'accessibility' | 'audit';
    testingTypes: string[];
    securityScope: string[];
    auditAreas: string[];
    toolchain: string[];
}

export interface ProcessConfig extends BaseAgentConfig {
    category: 'process';
    role: 'product-manager' | 'scrum-master' | 'release-manager' | 'technical-writer' | 'designer';
    methodologies: string[];
    stakeholders: string[];
    deliverables: string[];
    communicationStyle: 'technical' | 'business' | 'user-focused';
}

export type AgentConfig = DeveloperConfig | ArchitectConfig | QualityConfig | ProcessConfig;

// ===== SMART TEMPLATE INTERFACE =====

export interface SmartAgentTemplate {
    id: string;
    name: string;
    icon: string;
    terminalIcon: string;
    color: string;
    description: string;
    version: string;
    tags?: string[];
    config: AgentConfig;

    // Generated dynamically
    systemPrompt: string;
    detailedPrompt: string;
    capabilities: object;
    taskPreferences: {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity: string;
    };
    filePatterns: {
        watch: string[];
        ignore: string[];
    };
    commands: object;
    workflow: object;
    bestPractices: object;
    riskMitigation: object;
    metrics: object;
    documentation: object;
}

// ===== CAPABILITY DATABASES =====

export class CapabilityDatabase {
    static readonly LANGUAGES = {
        frontend: ['typescript', 'javascript', 'html', 'css', 'scss', 'jsx', 'tsx'],
        backend: ['python', 'java', 'c#', 'go', 'rust', 'php', 'ruby', 'scala', 'kotlin', 'elixir'],
        fullstack: ['typescript', 'javascript', 'python', 'html', 'css', 'scss', 'jsx', 'tsx', 'sql'],
        mobile: ['swift', 'kotlin', 'java', 'dart', 'typescript', 'javascript'],
        data: ['python', 'r', 'sql', 'scala', 'julia'],
        'ai-ml': ['python', 'javascript', 'typescript', 'r'],
        ai: ['python', 'javascript', 'typescript', 'r'],
        devops: ['bash', 'python', 'yaml', 'hcl', 'go'],
        security: ['python', 'go', 'rust', 'c', 'bash'],
        architecture: ['python', 'java', 'c#', 'go', 'typescript'],
        quality: ['typescript', 'javascript', 'python', 'java'],
        process: []
    };

    static readonly FRAMEWORKS = {
        'frontend-react': ['react', 'next.js', 'gatsby', 'remix'],
        'frontend-vue': ['vue', 'nuxt.js', 'quasar'],
        'frontend-angular': ['angular', 'ionic-angular'],
        'backend-node': ['express', 'nestjs', 'fastify', 'koa'],
        'backend-python': ['django', 'flask', 'fastapi', 'tornado'],
        'backend-java': ['spring', 'spring-boot', 'quarkus'],
        'mobile-react-native': ['react-native', 'expo'],
        'mobile-flutter': ['flutter', 'flame'],
        'mobile-native-ios': ['swiftui', 'uikit'],
        'mobile-native-android': ['jetpack-compose', 'android-sdk'],
        'ai-ml': ['tensorflow', 'pytorch', 'langchain', 'huggingface'],
        data: ['pandas', 'numpy', 'spark', 'dbt'],
        testing: ['jest', 'pytest', 'junit', 'cypress', 'playwright'],
        security: ['owasp', 'burp-suite', 'metasploit'],
        devops: ['docker', 'kubernetes', 'terraform', 'ansible']
    };

    static readonly SPECIALIZATIONS = {
        developer: [
            'api-design',
            'database-design',
            'ui-ux',
            'performance-optimization',
            'security-implementation',
            'testing',
            'deployment',
            'microservices',
            'responsive-design',
            'accessibility',
            'pwa',
            'real-time',
            'authentication'
        ],
        architect: [
            'system-design',
            'scalability',
            'distributed-systems',
            'microservices',
            'domain-driven-design',
            'event-sourcing',
            'cqrs',
            'performance-architecture',
            'security-architecture',
            'cloud-architecture',
            'data-architecture'
        ],
        quality: [
            'unit-testing',
            'integration-testing',
            'e2e-testing',
            'performance-testing',
            'security-testing',
            'accessibility-testing',
            'visual-regression',
            'penetration-testing',
            'vulnerability-assessment',
            'compliance-auditing'
        ],
        process: [
            'agile',
            'scrum',
            'kanban',
            'lean',
            'devops',
            'continuous-delivery',
            'stakeholder-management',
            'technical-writing',
            'documentation',
            'user-research',
            'product-strategy'
        ]
    };

    static readonly TOOLS = {
        development: ['vscode', 'git', 'github', 'docker', 'npm', 'webpack', 'vite'],
        testing: ['jest', 'cypress', 'playwright', 'postman', 'k6'],
        security: ['owasp-zap', 'burp-suite', 'snyk', 'trivy', 'vault'],
        devops: ['kubernetes', 'terraform', 'jenkins', 'github-actions', 'prometheus'],
        design: ['figma', 'sketch', 'adobe-xd', 'storybook'],
        data: ['jupyter', 'pandas', 'spark', 'airflow', 'dbt']
    };
}

// ===== BASE TEMPLATE CLASSES =====

abstract class BaseSmartTemplate {
    protected config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
    }

    abstract generateSystemPrompt(): string;
    abstract generateDetailedPrompt(): string;
    abstract generateCapabilities(): object;
    abstract generateTaskPreferences(): {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity: string;
    };

    generateFilePatterns(): { watch: string[]; ignore: string[] } {
        const base = {
            ignore: ['node_modules/**', 'dist/**', 'build/**', '*.log', '*.tmp', '*.cache', 'coverage/**', '.git/**']
        };

        return {
            ...base,
            watch: this.getWatchPatterns()
        };
    }

    protected abstract getWatchPatterns(): string[];

    generateCommands(): object {
        return {
            development: {
                start: 'npm start || python main.py || go run .',
                dev: 'npm run dev || python -m uvicorn main:app --reload',
                build: 'npm run build || python -m build || go build',
                test: 'npm test || pytest || go test ./...'
            },
            quality: {
                lint: 'npm run lint || flake8 || golangci-lint run',
                format: 'npm run format || black . || gofmt -w .',
                'type-check': 'npm run type-check || mypy . || go vet ./...'
            }
        };
    }

    generateWorkflow(): object {
        return {
            phases: this.getWorkflowPhases(),
            checkpoints: this.getWorkflowCheckpoints()
        };
    }

    protected abstract getWorkflowPhases(): object[];
    protected abstract getWorkflowCheckpoints(): string[];

    generateBestPractices(): object {
        return {
            general: [
                'Write clean, maintainable, and well-documented code',
                'Follow established patterns and conventions',
                'Implement proper error handling and logging',
                'Write comprehensive tests for critical functionality',
                'Use version control effectively with meaningful commits'
            ],
            ...this.getSpecificBestPractices()
        };
    }

    protected abstract getSpecificBestPractices(): object;

    generateTemplate(): SmartAgentTemplate {
        return {
            id: this.generateId(),
            name: this.generateName(),
            icon: this.generateIcon(),
            terminalIcon: this.generateTerminalIcon(),
            color: this.generateColor(),
            description: this.generateDescription(),
            version: '3.0.0',
            config: this.config,
            systemPrompt: this.generateSystemPrompt(),
            detailedPrompt: this.generateDetailedPrompt(),
            capabilities: this.generateCapabilities(),
            taskPreferences: this.generateTaskPreferences(),
            filePatterns: this.generateFilePatterns(),
            commands: this.generateCommands(),
            workflow: this.generateWorkflow(),
            bestPractices: this.generateBestPractices(),
            riskMitigation: this.generateRiskMitigation(),
            metrics: this.generateMetrics(),
            documentation: this.generateDocumentation()
        };
    }

    protected abstract generateId(): string;
    protected abstract generateName(): string;
    protected abstract generateIcon(): string;
    protected abstract generateTerminalIcon(): string;
    protected abstract generateColor(): string;
    protected abstract generateDescription(): string;
    protected abstract generateRiskMitigation(): object;
    protected abstract generateMetrics(): object;
    protected abstract generateDocumentation(): object;
}

// ===== DEVELOPER TEMPLATE =====

export class DeveloperSmartTemplate extends BaseSmartTemplate {
    protected config: DeveloperConfig;

    constructor(config: DeveloperConfig) {
        super(config);
        this.config = config;
    }

    generateSystemPrompt(): string {
        // Now we generate the full comprehensive prompt here since we're not using detailedPrompt separately
        // This ensures we stay under the 4096 character limit for Claude CLI
        const domain = this.config.primaryDomain;
        const languages = this.config.languages.join(', ');
        const frameworks = this.config.frameworks.join(', ');
        const specializations = this.config.specializations.join(', ');
        const toolchain = this.config.toolchain.slice(0, 3).join(', '); // Limit toolchain items

        // Generate comprehensive Anthropic-style prompt (target ~3500-4000 chars)
        const domainSpecificContent = this.getDomainSpecificContent();
        
        return `You are an expert ${this.capitalize(domain)} Developer with deep expertise in building scalable, secure, and maintainable applications. Your comprehensive skill set spans ${languages} with production experience in ${frameworks}.

## Core Expertise

### Technical Mastery
- Advanced ${languages} development with focus on ${specializations}
- Production-grade ${frameworks} implementation with best practices
- ${toolchain} for efficient development workflows
- ${domainSpecificContent.technicalFocus}

### Development Philosophy
- Write clean, self-documenting code that follows SOLID principles
- Implement comprehensive testing strategies (unit, integration, e2e)
- Design for scalability, maintainability, and performance from day one
- Practice defensive programming with robust error handling

${domainSpecificContent.expertise}

## Development Methodology

### 1. Project Analysis
- First run: git status, git log --oneline -10, ls -la
- Review package.json/requirements for dependencies and architecture
- Analyze existing code patterns and conventions
- Identify technical debt and improvement opportunities

### 2. Implementation Strategy
- Break down complex problems into manageable components
- Design interfaces and contracts before implementation
- Write tests first when appropriate (TDD/BDD)
- Implement incrementally with continuous validation

### 3. Quality Assurance
- Comprehensive test coverage (aim for 80%+ meaningful coverage)
- Performance profiling and optimization
- Security auditing and vulnerability scanning
- Documentation as first-class deliverable

${domainSpecificContent.methodology}

## Best Practices

### Code Quality
- Follow established style guides and linting rules
- Use TypeScript/type hints for type safety
- Implement proper error boundaries and fallbacks
- Maintain comprehensive documentation

### Architecture
- Design loosely coupled, highly cohesive modules
- Implement proper separation of concerns
- Use dependency injection for testability
- Consider future extensibility without overengineering

### Security
- Never trust user input - validate and sanitize everything
- Keep dependencies updated and monitor for vulnerabilities
- Follow OWASP guidelines and security best practices

${domainSpecificContent.bestPractices}

## Deliverables

For each task, provide:

1. **Technical Design** - Architecture overview and component design
2. **Implementation** - Clean, well-structured code following conventions
3. **Testing** - Unit tests, integration tests, and validation
4. **Documentation** - Setup instructions, API docs, and troubleshooting

${domainSpecificContent.deliverables}

Part of NofX.dev team. Focus on delivering high-quality, production-ready code that solves real problems effectively.`;
    }

    generateDetailedPrompt(): string {
        // Return empty string since we're now including everything in systemPrompt
        // This is to stay under the 4096 character CLI limit
        return '';
    }

    private getDomainSpecificContent() {
        const domainContent = {
            frontend: {
                technicalFocus: 'Modern CSS, responsive design, accessibility (WCAG), and performance optimization',
                expertise: `### Frontend Specialization
- Component-based architecture with reusable UI components
- State management patterns (Redux, Context, Zustand)
- Progressive Web App (PWA) implementation
- Cross-browser compatibility and responsive design
- Accessibility standards (WCAG 2.1 AA/AAA)
- Performance optimization (Core Web Vitals, lazy loading)`,
                methodology: `### 4. UI/UX Excellence
- Design mobile-first, responsive interfaces
- Implement smooth animations and transitions
- Ensure keyboard navigation and screen reader support
- Optimize for Core Web Vitals and SEO
- Create intuitive user experiences`,
                bestPractices: `### Frontend Excellence
- Component composition over inheritance
- Semantic HTML and modern CSS features
- Optimize bundle sizes and load times
- Implement proper loading and error states
- Use React.memo and useMemo judiciously`,
                deliverables: `5. **Frontend Specifics**
   - Component library documentation
   - Accessibility audit report
   - Performance metrics and optimization notes
   - Cross-browser testing results`
            },
            backend: {
                technicalFocus: 'RESTful APIs, microservices, database design, and distributed systems',
                expertise: `### Backend Specialization
- RESTful and GraphQL API design
- Microservices architecture and patterns
- Database design and optimization (SQL/NoSQL)
- Message queuing and event-driven systems
- Authentication and authorization (JWT, OAuth)
- Caching strategies and performance tuning`,
                methodology: `### 4. API Design
- Design resource-oriented REST endpoints
- Implement proper HTTP methods and status codes
- Version APIs appropriately
- Document with OpenAPI/Swagger
- Handle errors consistently`,
                bestPractices: `### Backend Excellence
- Design stateless, scalable services
- Implement circuit breakers and retries
- Use connection pooling effectively
- Monitor and log appropriately
- Handle concurrent requests safely`,
                deliverables: `5. **Backend Specifics**
   - API documentation and Postman collection
   - Database migration scripts
   - Performance benchmarks
   - Security audit and penetration test results`
            },
            fullstack: {
                technicalFocus: 'End-to-end feature development, system integration, and full application lifecycle',
                expertise: `### Fullstack Specialization
- End-to-end feature implementation
- Frontend-backend integration patterns
- Real-time features (WebSockets, SSE)
- Full application deployment pipeline
- Cross-functional collaboration
- System-wide performance optimization`,
                methodology: `### 4. Integration Excellence
- Design cohesive frontend-backend contracts
- Implement end-to-end type safety
- Optimize data fetching strategies
- Handle state synchronization
- Ensure consistent user experience`,
                bestPractices: `### Fullstack Excellence
- Maintain consistency across stack
- Share code and types when possible
- Optimize network requests
- Implement proper caching layers
- Design for horizontal scaling`,
                deliverables: `5. **Fullstack Specifics**
   - End-to-end feature documentation
   - Integration test suite
   - Deployment configuration
   - Full system architecture diagram`
            },
            mobile: {
                technicalFocus: 'Native and cross-platform mobile development, performance optimization, and platform-specific features',
                expertise: `### Mobile Specialization
- Native iOS (Swift) and Android (Kotlin) development
- Cross-platform frameworks (React Native, Flutter)
- Mobile UI/UX best practices
- Device API integration (camera, location, etc.)
- Offline-first architecture
- App store optimization and deployment`,
                methodology: `### 4. Mobile Excellence
- Design for touch interfaces
- Optimize for battery and data usage
- Handle various screen sizes and orientations
- Implement proper navigation patterns
- Test on real devices`,
                bestPractices: `### Mobile Excellence
- Follow platform-specific guidelines
- Optimize app size and startup time
- Implement proper state restoration
- Handle background tasks appropriately
- Design for intermittent connectivity`,
                deliverables: `5. **Mobile Specifics**
   - Platform-specific build configurations
   - App store submission checklist
   - Device compatibility matrix
   - Performance profiling results`
            },
            'ai-ml': {
                technicalFocus: 'Machine learning models, data pipelines, AI integration, and MLOps practices',
                expertise: `### AI/ML Specialization
- Machine learning model development and training
- Deep learning frameworks (TensorFlow, PyTorch)
- Natural language processing and computer vision
- Data preprocessing and feature engineering
- Model deployment and serving
- MLOps and experiment tracking`,
                methodology: `### 4. ML Pipeline
- Design data ingestion pipelines
- Implement feature engineering
- Train and validate models
- Deploy with proper monitoring
- Implement A/B testing`,
                bestPractices: `### AI/ML Excellence
- Version datasets and models
- Track experiments systematically
- Monitor model drift
- Implement explainable AI
- Ensure ethical AI practices`,
                deliverables: `5. **AI/ML Specifics**
   - Model performance metrics
   - Data pipeline documentation
   - Experiment tracking reports
   - Model deployment guide`
            },
            data: {
                technicalFocus: 'Data engineering, ETL pipelines, analytics, and big data processing',
                expertise: `### Data Engineering Specialization
- ETL/ELT pipeline design and implementation
- Big data processing (Spark, Hadoop)
- Data warehouse and lake architectures
- Stream processing and real-time analytics
- Data quality and governance
- Business intelligence and reporting`,
                methodology: `### 4. Data Pipeline
- Design scalable data architectures
- Implement data quality checks
- Optimize query performance
- Ensure data consistency
- Monitor pipeline health`,
                bestPractices: `### Data Excellence
- Implement data versioning
- Design for fault tolerance
- Optimize storage costs
- Ensure data privacy
- Document data lineage`,
                deliverables: `5. **Data Specifics**
   - Data flow diagrams
   - Schema documentation
   - Data quality reports
   - Pipeline monitoring dashboard`
            }
        };

        return domainContent[this.config.primaryDomain] || domainContent.fullstack;
    }

    generateCapabilities(): object {
        const domainLanguages = CapabilityDatabase.LANGUAGES[this.config.primaryDomain] || [];
        const allLanguages = Array.from(new Set([...this.config.languages, ...domainLanguages]));

        return {
            languages: {
                primary: this.config.languages,
                secondary: domainLanguages.filter(lang => !this.config.languages.includes(lang)),
                all: allLanguages
            },
            frameworks: this.config.frameworks,
            specializations: this.config.specializations,
            tools: this.config.toolchain,
            domain: this.config.primaryDomain
        };
    }

    generateTaskPreferences(): {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity: string;
    } {
        const domainPreferences = this.getDomainTaskPreferences();
        const specializationPreferences = this.config.specializations;

        return {
            preferred: [...domainPreferences.preferred, ...specializationPreferences],
            avoid: domainPreferences.avoid,
            priority: this.config.priority,
            complexity: this.config.complexity
        };
    }

    private getDomainTaskPreferences() {
        const preferences = {
            frontend: {
                preferred: ['ui-components', 'responsive-design', 'user-experience', 'styling', 'accessibility'],
                avoid: ['pure-backend', 'database-administration', 'infrastructure-only']
            },
            backend: {
                preferred: ['api-design', 'database-design', 'authentication', 'microservices', 'performance'],
                avoid: ['pure-ui', 'styling-only', 'design-work']
            },
            fullstack: {
                preferred: ['end-to-end-features', 'system-integration', 'api-design', 'full-features'],
                avoid: ['deep-specialization', 'infrastructure-only']
            },
            mobile: {
                preferred: ['mobile-apps', 'cross-platform', 'native-development', 'mobile-ui'],
                avoid: ['pure-backend', 'web-only', 'server-infrastructure']
            },
            'ai-ml': {
                preferred: ['machine-learning', 'data-analysis', 'model-training', 'ai-integration'],
                avoid: ['pure-ui', 'styling', 'manual-processes']
            },
            data: {
                preferred: ['data-processing', 'analytics', 'etl-pipelines', 'data-modeling'],
                avoid: ['ui-design', 'styling', 'manual-testing']
            }
        };

        return preferences[this.config.primaryDomain] || { preferred: [], avoid: [] };
    }

    protected getWatchPatterns(): string[] {
        const base = ['src/**', 'app/**', 'lib/**', 'package.json', '*.json', '*.md'];
        const domainPatterns = {
            frontend: ['*.tsx', '*.jsx', '*.ts', '*.js', '*.html', '*.css', '*.scss', 'components/**', 'pages/**'],
            backend: ['*.py', '*.java', '*.go', '*.rs', '*.cs', 'api/**', 'routes/**', 'models/**', 'services/**'],
            fullstack: [
                '*.tsx',
                '*.jsx',
                '*.ts',
                '*.js',
                '*.py',
                '*.java',
                '*.html',
                '*.css',
                'api/**',
                'components/**'
            ],
            mobile: ['*.swift', '*.kt', '*.dart', '*.tsx', '*.jsx', 'ios/**', 'android/**', 'lib/**'],
            'ai-ml': ['*.py', '*.ipynb', '*.json', 'models/**', 'data/**', 'notebooks/**'],
            data: ['*.py', '*.sql', '*.json', '*.csv', 'data/**', 'etl/**', 'pipelines/**']
        };

        return [...base, ...(domainPatterns[this.config.primaryDomain] || [])];
    }

    protected getWorkflowPhases(): object[] {
        return [
            {
                name: 'Analysis & Planning',
                activities: ['requirements-analysis', 'technical-planning', 'architecture-design']
            },
            {
                name: 'Development',
                activities: ['implementation', 'testing', 'code-review']
            },
            {
                name: 'Integration & Testing',
                activities: ['integration-testing', 'performance-testing', 'security-testing']
            },
            {
                name: 'Deployment',
                activities: ['deployment', 'monitoring', 'documentation']
            }
        ];
    }

    protected getWorkflowCheckpoints(): string[] {
        return [
            'requirements-understood',
            'architecture-approved',
            'implementation-complete',
            'tests-passing',
            'code-reviewed',
            'deployment-successful'
        ];
    }

    protected getSpecificBestPractices(): object {
        return {
            development: [
                'Use consistent coding standards and linting',
                'Implement comprehensive testing strategies',
                'Write self-documenting code with clear variable names',
                'Use appropriate design patterns for the problem domain',
                'Optimize for readability and maintainability'
            ],
            security: [
                'Validate all inputs and sanitize outputs',
                'Use parameterized queries to prevent injection attacks',
                'Implement proper authentication and authorization',
                'Keep dependencies up to date',
                'Follow security best practices for the technology stack'
            ]
        };
    }

    protected generateId(): string {
        return `${this.config.primaryDomain}-developer`;
    }

    protected generateName(): string {
        return `${this.capitalize(this.config.primaryDomain)} Developer`;
    }

    protected generateIcon(): string {
        const icons = {
            frontend: '🎨',
            backend: '⚙️',
            fullstack: '🚀',
            mobile: '📱',
            'ai-ml': '🤖',
            data: '📊'
        };
        return icons[this.config.primaryDomain] || '💻';
    }

    protected generateTerminalIcon(): string {
        const icons = {
            frontend: 'browser',
            backend: 'server',
            fullstack: 'layers',
            mobile: 'device-mobile',
            'ai-ml': 'robot',
            data: 'graph'
        };
        return icons[this.config.primaryDomain] || 'code';
    }

    protected generateColor(): string {
        const colors = {
            frontend: '#61DAFB',
            backend: '#68A063',
            fullstack: '#FF6B6B',
            mobile: '#3498DB',
            'ai-ml': '#E74C3C',
            data: '#9B59B6'
        };
        return colors[this.config.primaryDomain] || '#34495E';
    }

    protected generateDescription(): string {
        const domain = this.config.primaryDomain;
        const specializations = this.config.specializations.slice(0, 3).join(', ');

        return `Expert ${domain} developer specializing in ${specializations} and modern development practices across any project domain`;
    }

    protected generateRiskMitigation(): object {
        return {
            technical: ['code-review', 'testing', 'documentation', 'version-control'],
            security: ['input-validation', 'authentication', 'authorization', 'dependency-updates'],
            performance: ['profiling', 'optimization', 'monitoring', 'caching'],
            quality: ['linting', 'testing-coverage', 'code-standards', 'peer-review']
        };
    }

    protected generateMetrics(): object {
        return {
            development: ['code-quality', 'test-coverage', 'build-time', 'deployment-frequency'],
            performance: ['response-time', 'throughput', 'error-rate', 'resource-usage'],
            quality: ['bug-density', 'technical-debt', 'code-review-time', 'maintainability']
        };
    }

    protected generateDocumentation(): object {
        return {
            required: ['readme', 'api-docs', 'setup-guide', 'architecture-overview'],
            recommended: ['code-comments', 'examples', 'troubleshooting', 'contributing-guide']
        };
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// ===== ARCHITECT TEMPLATE =====

export class ArchitectSmartTemplate extends BaseSmartTemplate {
    protected config: ArchitectConfig;

    constructor(config: ArchitectConfig) {
        super(config);
        this.config = config;
    }

    generateSystemPrompt(): string {
        return `You are a ${this.capitalize(this.config.scope)} Architect. Expert in system design, architectural patterns, and ${this.config.focusAreas.join(', ')}. Part of a NofX.dev coding team.`;
    }

    generateDetailedPrompt(): string {
        const scope = this.config.scope;
        const focusAreas = this.config.focusAreas.join(', ');
        const decisionLevel = this.config.decisionLevel;

        return `You are an expert ${this.capitalize(scope)} Architect with deep expertise in system design and architectural patterns. You excel at ${decisionLevel} decision-making and specialize in ${focusAreas}.

Core Principles: Design for scalability, maintainability, and reliability. Consider both current needs and future growth. Balance trade-offs between complexity, performance, and maintainability. Document architectural decisions with clear rationale.

Architectural Excellence: Design distributed systems and microservices architectures. Define clear system boundaries and integration points. Create comprehensive technical specifications. Establish coding standards and architectural guidelines. Plan for reliability, availability, and fault tolerance.

Always Consider: Business requirements and technical constraints, scalability and performance implications, security and compliance requirements, operational and maintenance costs, integration with existing systems, technology selection and trade-offs.

Communication Style: Explain complex technical concepts clearly, provide detailed implementation guidance, justify architectural decisions with rationale, facilitate architecture reviews and decision-making.`;
    }

    generateCapabilities(): object {
        return {
            scope: this.config.scope,
            focusAreas: this.config.focusAreas,
            decisionLevel: this.config.decisionLevel,
            systemTypes: this.config.systemTypes,
            patterns: this.getArchitecturalPatterns(),
            methodologies: this.getArchitecturalMethodologies()
        };
    }

    generateTaskPreferences(): {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity: string;
    } {
        const scopePreferences = this.getScopeTaskPreferences();

        return {
            preferred: [...scopePreferences.preferred, ...this.config.focusAreas],
            avoid: scopePreferences.avoid,
            priority: this.config.priority,
            complexity: this.config.complexity
        };
    }

    private getScopeTaskPreferences() {
        const preferences = {
            software: {
                preferred: ['system-design', 'architecture-planning', 'technical-specifications', 'design-patterns'],
                avoid: ['detailed-implementation', 'ui-styling', 'manual-testing']
            },
            database: {
                preferred: ['data-modeling', 'schema-design', 'query-optimization', 'data-architecture'],
                avoid: ['frontend-ui', 'styling', 'manual-processes']
            },
            cloud: {
                preferred: ['cloud-architecture', 'infrastructure-design', 'scalability-planning', 'cost-optimization'],
                avoid: ['ui-design', 'styling', 'manual-testing']
            },
            integration: {
                preferred: ['api-design', 'integration-patterns', 'message-queues', 'event-driven-architecture'],
                avoid: ['ui-components', 'styling', 'manual-processes']
            },
            performance: {
                preferred: [
                    'performance-architecture',
                    'scalability-planning',
                    'optimization-strategies',
                    'load-testing'
                ],
                avoid: ['ui-design', 'styling', 'content-creation']
            },
            security: {
                preferred: ['security-architecture', 'threat-modeling', 'compliance-design', 'security-patterns'],
                avoid: ['ui-design', 'styling', 'manual-processes']
            }
        };

        return preferences[this.config.scope] || { preferred: [], avoid: [] };
    }

    private getArchitecturalPatterns(): string[] {
        const patterns = {
            software: ['microservices', 'event-driven', 'clean-architecture', 'domain-driven-design'],
            database: ['data-modeling', 'normalization', 'partitioning', 'replication'],
            cloud: ['multi-cloud', 'serverless', 'containerization', 'infrastructure-as-code'],
            integration: ['api-gateway', 'message-queues', 'event-sourcing', 'saga-pattern'],
            performance: ['caching', 'load-balancing', 'horizontal-scaling', 'optimization'],
            security: ['zero-trust', 'defense-in-depth', 'secure-by-design', 'threat-modeling']
        };

        return patterns[this.config.scope] || [];
    }

    private getArchitecturalMethodologies(): string[] {
        return ['togaf', 'zachman', 'archimate', 'c4-model', 'adr'];
    }

    protected getWatchPatterns(): string[] {
        return [
            '*.md',
            '*.yaml',
            '*.yml',
            '*.json',
            'architecture/**',
            'docs/**',
            'design/**',
            'specs/**',
            'diagrams/**',
            'docker-compose.*',
            'Dockerfile*',
            '*.config.*',
            'infrastructure/**',
            'terraform/**',
            'k8s/**',
            'kubernetes/**',
            '.github/workflows/**'
        ];
    }

    protected getWorkflowPhases(): object[] {
        return [
            {
                name: 'Requirements Analysis',
                activities: ['stakeholder-interviews', 'requirement-gathering', 'constraint-identification']
            },
            {
                name: 'Architecture Design',
                activities: ['system-decomposition', 'component-design', 'integration-planning']
            },
            {
                name: 'Technical Planning',
                activities: ['technology-selection', 'implementation-roadmap', 'risk-mitigation']
            },
            {
                name: 'Documentation',
                activities: ['architecture-documentation', 'decision-records', 'deployment-guide']
            },
            {
                name: 'Validation & Review',
                activities: ['architecture-review', 'proof-of-concept', 'stakeholder-approval']
            }
        ];
    }

    protected getWorkflowCheckpoints(): string[] {
        return [
            'requirements-validated',
            'architecture-approved',
            'poc-successful',
            'documentation-complete',
            'review-passed',
            'stakeholder-signoff'
        ];
    }

    protected getSpecificBestPractices(): object {
        return {
            design: [
                'Start with clear understanding of business requirements',
                'Design for change and future modifications',
                'Apply SOLID principles and design patterns',
                'Define clear boundaries between system components'
            ],
            planning: [
                'Create incremental delivery plan with clear milestones',
                'Identify and address high-risk items early',
                'Include time for refactoring and optimization'
            ],
            documentation: [
                'Maintain up-to-date architecture diagrams',
                'Document assumptions, constraints, and trade-offs',
                'Create clear API contracts and interface specifications'
            ]
        };
    }

    protected generateId(): string {
        return `${this.config.scope}-architect`;
    }

    protected generateName(): string {
        return `${this.capitalize(this.config.scope)} Architect`;
    }

    protected generateIcon(): string {
        const icons = {
            software: '🏗️',
            database: '🗄️',
            cloud: '☁️',
            integration: '🔗',
            performance: '⚡',
            security: '🔒'
        };
        return icons[this.config.scope] || '📐';
    }

    protected generateTerminalIcon(): string {
        const icons = {
            software: 'layers',
            database: 'database',
            cloud: 'cloud',
            integration: 'link',
            performance: 'zap',
            security: 'shield'
        };
        return icons[this.config.scope] || 'layers';
    }

    protected generateColor(): string {
        const colors = {
            software: '#7B68EE',
            database: '#E74C3C',
            cloud: '#3498DB',
            integration: '#2ECC71',
            performance: '#F39C12',
            security: '#95A5A6'
        };
        return colors[this.config.scope] || '#34495E';
    }

    protected generateDescription(): string {
        const scope = this.config.scope;
        const focusAreas = this.config.focusAreas.slice(0, 3).join(', ');

        return `Expert ${scope} architect specializing in ${focusAreas} and scalable system design across any project domain`;
    }

    protected generateRiskMitigation(): object {
        return {
            technical: ['proof-of-concept', 'performance-testing', 'scalability-testing'],
            organizational: ['skill-gap-analysis', 'training-planning', 'knowledge-transfer'],
            operational: ['deployment-strategy', 'rollback-planning', 'monitoring-strategy'],
            compliance: ['regulatory-requirements', 'audit-trails', 'certification-planning']
        };
    }

    protected generateMetrics(): object {
        return {
            architecture: ['coupling-cohesion', 'technical-debt-ratio', 'dependency-metrics'],
            performance: ['response-time', 'throughput', 'scalability-factor', 'resource-utilization'],
            reliability: ['availability-percentage', 'mtbf', 'mttr', 'error-rate'],
            delivery: ['velocity', 'lead-time', 'deployment-frequency', 'change-failure-rate']
        };
    }

    protected generateDocumentation(): object {
        return {
            required: ['system-overview', 'architecture-diagrams', 'component-specifications', 'api-documentation'],
            recommended: ['architecture-decision-records', 'trade-off-analysis', 'technology-radar', 'cost-analysis']
        };
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// ===== QUALITY TEMPLATE =====

export class QualitySmartTemplate extends BaseSmartTemplate {
    protected config: QualityConfig;

    constructor(config: QualityConfig) {
        super(config);
        this.config = config;
    }

    generateSystemPrompt(): string {
        return `You are a ${this.capitalize(this.config.primaryFocus)} Specialist. Expert in quality assurance, ${this.config.primaryFocus}, and ${this.config.toolchain.slice(0, 3).join(', ')}. Part of a NofX.dev coding team.`;
    }

    generateDetailedPrompt(): string {
        const focus = this.config.primaryFocus;
        const testingTypes = this.config.testingTypes.join(', ');
        const toolchain = this.config.toolchain.join(', ');

        return `You are an expert ${this.capitalize(focus)} Specialist with comprehensive expertise in quality assurance and ${focus}. You excel at ${testingTypes} using ${toolchain}.

Core Philosophy: Quality is everyone's responsibility, but you are the expert guide. Shift quality left in the development process. Focus on prevention rather than detection. Implement comprehensive testing strategies that provide confidence and fast feedback.

Technical Excellence: Design and implement comprehensive testing strategies. Create robust test automation frameworks. Implement security testing and vulnerability assessments. Ensure accessibility and usability standards. Provide clear quality metrics and reporting.

Always Consider: Risk-based testing approaches, automation opportunities, test data management, cross-browser and cross-platform compatibility, performance and security implications, compliance and regulatory requirements.

Communication Style: Provide clear quality assessments, create actionable test reports, explain testing strategies to stakeholders, recommend quality improvements, document test procedures and findings.`;
    }

    generateCapabilities(): object {
        return {
            primaryFocus: this.config.primaryFocus,
            testingTypes: this.config.testingTypes,
            securityScope: this.config.securityScope,
            auditAreas: this.config.auditAreas,
            toolchain: this.config.toolchain,
            methodologies: this.getQualityMethodologies()
        };
    }

    generateTaskPreferences(): {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity: string;
    } {
        const focusPreferences = this.getFocusTaskPreferences();

        return {
            preferred: [...focusPreferences.preferred, ...this.config.testingTypes],
            avoid: focusPreferences.avoid,
            priority: this.config.priority,
            complexity: this.config.complexity
        };
    }

    private getFocusTaskPreferences() {
        const preferences = {
            testing: {
                preferred: ['test-implementation', 'test-strategy', 'automation', 'coverage-improvement'],
                avoid: ['ui-design', 'styling', 'infrastructure-provisioning']
            },
            security: {
                preferred: ['security-testing', 'vulnerability-assessment', 'penetration-testing', 'security-audit'],
                avoid: ['ui-design', 'styling', 'marketing-copy']
            },
            performance: {
                preferred: ['performance-testing', 'load-testing', 'optimization', 'monitoring'],
                avoid: ['ui-design', 'content-creation', 'manual-processes']
            },
            accessibility: {
                preferred: ['accessibility-testing', 'wcag-compliance', 'inclusive-design', 'usability'],
                avoid: ['backend-only', 'infrastructure-only', 'data-processing']
            },
            audit: {
                preferred: ['compliance-auditing', 'quality-assessment', 'process-improvement', 'documentation'],
                avoid: ['implementation-details', 'coding-tasks', 'ui-styling']
            }
        };

        return preferences[this.config.primaryFocus] || { preferred: [], avoid: [] };
    }

    private getQualityMethodologies(): string[] {
        return ['tdd', 'bdd', 'shift-left', 'risk-based-testing', 'continuous-testing'];
    }

    protected getWatchPatterns(): string[] {
        const base = ['test/**', 'tests/**', 'spec/**', '__tests__/**', '*.test.*', '*.spec.*'];
        const focusPatterns = {
            testing: ['cypress/**', 'playwright/**', 'e2e/**', 'integration/**'],
            security: ['security/**', '**/*auth*', '**/*security*', '*.pem', '*.key'],
            performance: ['perf/**', 'performance/**', 'load-tests/**', 'benchmarks/**'],
            accessibility: ['a11y/**', 'accessibility/**', 'wcag/**'],
            audit: ['audit/**', 'compliance/**', 'reports/**', 'docs/**']
        };

        return [...base, ...(focusPatterns[this.config.primaryFocus] || [])];
    }

    protected getWorkflowPhases(): object[] {
        return [
            {
                name: 'Planning & Strategy',
                activities: ['test-planning', 'risk-analysis', 'strategy-development']
            },
            {
                name: 'Implementation',
                activities: ['test-development', 'automation-setup', 'environment-preparation']
            },
            {
                name: 'Execution',
                activities: ['test-execution', 'results-analysis', 'defect-tracking']
            },
            {
                name: 'Reporting & Improvement',
                activities: ['report-generation', 'metrics-analysis', 'process-improvement']
            }
        ];
    }

    protected getWorkflowCheckpoints(): string[] {
        return [
            'test-strategy-approved',
            'test-environment-ready',
            'tests-implemented',
            'execution-complete',
            'results-analyzed',
            'quality-gate-passed'
        ];
    }

    protected getSpecificBestPractices(): object {
        return {
            testing: [
                'Follow the test pyramid strategy',
                'Write maintainable and reliable tests',
                'Use appropriate test data management',
                'Implement continuous testing in CI/CD',
                'Focus on risk-based testing approaches'
            ],
            security: [
                'Implement security testing throughout SDLC',
                'Use both static and dynamic analysis',
                'Follow OWASP guidelines and best practices',
                'Conduct regular security assessments',
                'Maintain updated threat models'
            ],
            performance: [
                'Establish performance baselines',
                'Test under realistic load conditions',
                'Monitor key performance indicators',
                'Implement performance testing in CI/CD',
                'Focus on user experience metrics'
            ]
        };
    }

    protected generateId(): string {
        return `${this.config.primaryFocus}-specialist`;
    }

    protected generateName(): string {
        return `${this.capitalize(this.config.primaryFocus)} Specialist`;
    }

    protected generateIcon(): string {
        const icons = {
            testing: '🧪',
            security: '🔒',
            performance: '⚡',
            accessibility: '♿',
            audit: '📋'
        };
        return icons[this.config.primaryFocus] || '✅';
    }

    protected generateTerminalIcon(): string {
        const icons = {
            testing: 'beaker',
            security: 'shield',
            performance: 'zap',
            accessibility: 'accessibility',
            audit: 'checklist'
        };
        return icons[this.config.primaryFocus] || 'check';
    }

    protected generateColor(): string {
        const colors = {
            testing: '#27AE60',
            security: '#95A5A6',
            performance: '#F39C12',
            accessibility: '#9B59B6',
            audit: '#E67E22'
        };
        return colors[this.config.primaryFocus] || '#2ECC71';
    }

    protected generateDescription(): string {
        const focus = this.config.primaryFocus;
        const areas = this.config.testingTypes.slice(0, 3).join(', ');

        return `Comprehensive ${focus} specialist focusing on ${areas} and quality assurance across any project domain`;
    }

    protected generateRiskMitigation(): object {
        return {
            quality: ['test-coverage', 'code-review', 'continuous-testing', 'quality-gates'],
            security: ['security-testing', 'vulnerability-scanning', 'compliance-checking'],
            performance: ['performance-testing', 'monitoring', 'capacity-planning', 'optimization'],
            process: ['documentation', 'training', 'knowledge-sharing', 'tool-standardization']
        };
    }

    protected generateMetrics(): object {
        return {
            quality: ['test-coverage', 'defect-density', 'test-execution-rate', 'quality-score'],
            security: ['vulnerabilities-found', 'security-score', 'compliance-rate', 'incident-count'],
            performance: ['response-time', 'throughput', 'error-rate', 'resource-utilization'],
            process: ['automation-rate', 'test-maintenance-time', 'feedback-time', 'efficiency']
        };
    }

    protected generateDocumentation(): object {
        return {
            required: ['test-strategy', 'test-plans', 'test-results', 'quality-reports'],
            recommended: ['test-procedures', 'automation-guide', 'quality-metrics', 'improvement-plans']
        };
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// ===== PROCESS TEMPLATE =====

export class ProcessSmartTemplate extends BaseSmartTemplate {
    protected config: ProcessConfig;

    constructor(config: ProcessConfig) {
        super(config);
        this.config = config;
    }

    generateSystemPrompt(): string {
        return `You are a ${this.capitalize(this.config.role).replace('-', ' ')}. Expert in ${this.config.methodologies.join(', ')} and ${this.config.communicationStyle} communication. Part of a NofX.dev coding team.`;
    }

    generateDetailedPrompt(): string {
        const role = this.config.role.replace('-', ' ');
        const methodologies = this.config.methodologies.join(', ');
        const stakeholders = this.config.stakeholders.join(', ');

        return `You are an expert ${this.capitalize(role)} with comprehensive expertise in ${methodologies}. You excel at working with ${stakeholders} and delivering ${this.config.deliverables.join(', ')}.

Core Principles: Focus on value delivery and stakeholder satisfaction. Facilitate effective communication and collaboration. Implement processes that enable rather than hinder. Continuously improve based on feedback and metrics.

Excellence Areas: ${this.getExcellenceAreas().join(', ')}. Always consider team dynamics, project constraints, and business objectives.

Communication Style: ${this.getCommunicationStyle()}.`;
    }

    generateCapabilities(): object {
        return {
            role: this.config.role,
            methodologies: this.config.methodologies,
            stakeholders: this.config.stakeholders,
            deliverables: this.config.deliverables,
            communicationStyle: this.config.communicationStyle,
            processAreas: this.getProcessAreas()
        };
    }

    generateTaskPreferences(): {
        preferred: string[];
        avoid: string[];
        priority: 'high' | 'medium' | 'low';
        complexity: string;
    } {
        const rolePreferences = this.getRoleTaskPreferences();

        return {
            preferred: [...rolePreferences.preferred, ...this.config.deliverables],
            avoid: rolePreferences.avoid,
            priority: this.config.priority,
            complexity: this.config.complexity
        };
    }

    private getRoleTaskPreferences() {
        const preferences = {
            'product-manager': {
                preferred: ['product-strategy', 'requirements-gathering', 'roadmap-planning', 'stakeholder-management'],
                avoid: ['detailed-implementation', 'code-review', 'technical-debugging']
            },
            'scrum-master': {
                preferred: ['process-facilitation', 'team-coaching', 'impediment-removal', 'metrics-tracking'],
                avoid: ['technical-implementation', 'detailed-coding', 'infrastructure-setup']
            },
            'release-manager': {
                preferred: ['release-planning', 'deployment-coordination', 'risk-management', 'communication'],
                avoid: ['feature-development', 'ui-design', 'testing-implementation']
            },
            'technical-writer': {
                preferred: ['documentation', 'content-creation', 'information-architecture', 'user-guides'],
                avoid: ['feature-implementation', 'debugging', 'infrastructure-setup']
            },
            designer: {
                preferred: ['ui-design', 'user-experience', 'prototyping', 'design-systems'],
                avoid: ['backend-implementation', 'database-design', 'server-configuration']
            }
        };

        return preferences[this.config.role] || { preferred: [], avoid: [] };
    }

    private getExcellenceAreas(): string[] {
        const areas = {
            'product-manager': ['product-strategy', 'market-analysis', 'user-research', 'roadmap-planning'],
            'scrum-master': ['team-facilitation', 'process-improvement', 'impediment-removal', 'metrics-analysis'],
            'release-manager': ['release-planning', 'risk-management', 'coordination', 'communication'],
            'technical-writer': ['technical-documentation', 'content-strategy', 'information-design', 'user-education'],
            designer: ['user-experience', 'visual-design', 'interaction-design', 'design-systems']
        };

        return areas[this.config.role] || [];
    }

    private getCommunicationStyle(): string {
        const styles = {
            technical:
                'Use precise technical language, provide detailed specifications, focus on implementation details',
            business:
                'Translate technical concepts to business terms, focus on value and ROI, align with business objectives',
            'user-focused': 'Prioritize user needs and experience, use empathetic communication, focus on user outcomes'
        };

        return styles[this.config.communicationStyle] || 'Clear, concise, and stakeholder-appropriate communication';
    }

    private getProcessAreas(): string[] {
        return ['project-management', 'stakeholder-communication', 'process-improvement', 'quality-assurance'];
    }

    protected getWatchPatterns(): string[] {
        const base = ['*.md', '*.json', 'docs/**', 'requirements/**'];
        const rolePatterns = {
            'product-manager': ['roadmap/**', 'requirements/**', 'user-stories/**', 'specifications/**'],
            'scrum-master': ['sprints/**', 'retrospectives/**', 'metrics/**', 'process/**'],
            'release-manager': ['releases/**', 'deployment/**', 'changelog/**', 'announcements/**'],
            'technical-writer': ['docs/**', 'guides/**', 'tutorials/**', 'api-docs/**'],
            designer: ['designs/**', 'mockups/**', 'prototypes/**', '*.sketch', '*.fig']
        };

        return [...base, ...(rolePatterns[this.config.role] || [])];
    }

    protected getWorkflowPhases(): object[] {
        const phases = {
            'product-manager': [
                { name: 'Discovery', activities: ['market-research', 'user-research', 'competitive-analysis'] },
                { name: 'Strategy', activities: ['product-strategy', 'roadmap-planning', 'requirement-definition'] },
                { name: 'Execution', activities: ['feature-prioritization', 'team-coordination', 'progress-tracking'] },
                { name: 'Delivery', activities: ['release-planning', 'stakeholder-communication', 'metrics-analysis'] }
            ],
            'scrum-master': [
                { name: 'Planning', activities: ['sprint-planning', 'backlog-refinement', 'capacity-planning'] },
                { name: 'Execution', activities: ['daily-standups', 'impediment-removal', 'team-coaching'] },
                { name: 'Review', activities: ['sprint-review', 'retrospectives', 'metrics-analysis'] },
                { name: 'Improvement', activities: ['process-improvement', 'team-development', 'tool-optimization'] }
            ],
            'release-manager': [
                { name: 'Planning', activities: ['release-planning', 'deployment-strategy', 'risk-assessment'] },
                { name: 'Preparation', activities: ['environment-setup', 'testing-coordination', 'documentation'] },
                { name: 'Deployment', activities: ['release-execution', 'monitoring', 'rollback-planning'] },
                { name: 'Post-Release', activities: ['metrics-analysis', 'feedback-collection', 'improvement'] }
            ],
            'technical-writer': [
                { name: 'Research', activities: ['requirement-gathering', 'stakeholder-interviews', 'content-audit'] },
                { name: 'Planning', activities: ['content-strategy', 'information-architecture', 'style-guide'] },
                { name: 'Creation', activities: ['content-writing', 'documentation', 'review-cycles'] },
                { name: 'Maintenance', activities: ['content-updates', 'user-feedback', 'continuous-improvement'] }
            ],
            designer: [
                { name: 'Research', activities: ['user-research', 'market-analysis', 'design-audit'] },
                { name: 'Design', activities: ['wireframing', 'prototyping', 'visual-design'] },
                { name: 'Validation', activities: ['user-testing', 'stakeholder-review', 'iteration'] },
                { name: 'Delivery', activities: ['design-handoff', 'implementation-support', 'quality-assurance'] }
            ]
        };

        return (
            phases[this.config.role] || [
                { name: 'Planning', activities: ['requirement-analysis', 'strategy-development'] },
                { name: 'Execution', activities: ['implementation', 'coordination', 'communication'] },
                { name: 'Review', activities: ['evaluation', 'feedback-collection', 'improvement'] }
            ]
        );
    }

    protected getWorkflowCheckpoints(): string[] {
        return [
            'requirements-understood',
            'strategy-approved',
            'team-aligned',
            'deliverables-completed',
            'stakeholders-satisfied',
            'process-improved'
        ];
    }

    protected getSpecificBestPractices(): object {
        return {
            communication: [
                'Tailor communication to the audience',
                'Use data to support decisions and recommendations',
                'Maintain transparency and regular updates',
                'Foster collaborative and inclusive environments'
            ],
            process: [
                'Implement lightweight and effective processes',
                'Continuously gather feedback and improve',
                'Focus on value delivery over process adherence',
                'Measure and optimize based on outcomes'
            ],
            stakeholder: [
                'Understand and align stakeholder expectations',
                'Provide regular updates and transparency',
                'Manage conflicts and facilitate consensus',
                'Build trust through consistent delivery'
            ]
        };
    }

    protected generateId(): string {
        return this.config.role;
    }

    protected generateName(): string {
        return this.capitalize(this.config.role.replace('-', ' '));
    }

    protected generateIcon(): string {
        const icons = {
            'product-manager': '📊',
            'scrum-master': '🏃',
            'release-manager': '🚀',
            'technical-writer': '📝',
            designer: '🎨'
        };
        return icons[this.config.role] || '👥';
    }

    protected generateTerminalIcon(): string {
        const icons = {
            'product-manager': 'graph',
            'scrum-master': 'person',
            'release-manager': 'rocket',
            'technical-writer': 'edit',
            designer: 'paintbrush'
        };
        return icons[this.config.role] || 'people';
    }

    protected generateColor(): string {
        const colors = {
            'product-manager': '#3498DB',
            'scrum-master': '#2ECC71',
            'release-manager': '#E74C3C',
            'technical-writer': '#9B59B6',
            designer: '#F39C12'
        };
        return colors[this.config.role] || '#34495E';
    }

    protected generateDescription(): string {
        const role = this.config.role.replace('-', ' ');
        const methodologies = this.config.methodologies.slice(0, 2).join(' and ');

        return `Expert ${role} specializing in ${methodologies} and stakeholder collaboration across any project domain`;
    }

    protected generateRiskMitigation(): object {
        return {
            communication: ['regular-updates', 'stakeholder-alignment', 'conflict-resolution'],
            process: ['continuous-improvement', 'feedback-loops', 'adaptability'],
            delivery: ['milestone-tracking', 'risk-management', 'contingency-planning'],
            team: ['team-development', 'skill-building', 'collaboration-improvement']
        };
    }

    protected generateMetrics(): object {
        return {
            delivery: ['on-time-delivery', 'scope-completion', 'quality-metrics', 'stakeholder-satisfaction'],
            process: ['cycle-time', 'throughput', 'efficiency', 'improvement-rate'],
            team: ['team-velocity', 'collaboration-score', 'engagement-level', 'retention-rate'],
            business: ['value-delivered', 'roi', 'user-satisfaction', 'market-impact']
        };
    }

    protected generateDocumentation(): object {
        return {
            required: ['process-documentation', 'stakeholder-communication', 'delivery-reports', 'metrics-dashboard'],
            recommended: ['best-practices', 'lessons-learned', 'improvement-plans', 'team-guidelines']
        };
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// ===== SMART TEMPLATE COMPOSER =====

/**
 * Composite template configuration for multi-domain agents
 */
export interface CompositeAgentConfig {
    category: 'developer' | 'architect' | 'quality' | 'process';
    domains: string[]; // Multiple domains to combine
    primaryDomain: string; // Primary domain for identity
    crossDomain?: boolean; // Enable cross-domain capabilities
    compositeConfig?: {
        weights: Record<string, number>; // Domain weight distribution
        focusAreas: string[]; // Cross-domain focus areas
        integrationPoints: string[]; // How domains integrate
    };
}

/**
 * Smart Template Composer for multi-domain agent templates
 * Combines multiple template types to create versatile agents
 */
export class SmartTemplateComposer {
    /**
     * Create a composite template by combining multiple domain templates
     */
    static createCompositeTemplate(config: AgentConfig): SmartAgentTemplate {
        const compositeConfig = config as any;

        // Extract domains to combine
        let domains: string[] = [];
        if (Array.isArray(compositeConfig.domains)) {
            domains = compositeConfig.domains;
        } else if (compositeConfig.primaryDomain === 'composite') {
            // Infer domains from specializations
            domains = this.inferDomainsFromSpecializations(compositeConfig.specializations || []);
        } else {
            // Single domain fallback
            domains = [compositeConfig.primaryDomain || 'fullstack'];
        }

        // Create individual templates for each domain
        const domainTemplates: SmartAgentTemplate[] = [];
        for (const domain of domains) {
            const domainConfig = this.createDomainConfig(domain, compositeConfig);
            const domainTemplate = this.createSingleDomainTemplate(domainConfig);
            domainTemplates.push(domainTemplate);
        }

        // Compose the templates
        return this.composeTemplates(domainTemplates, compositeConfig);
    }

    /**
     * Infer domains from specializations
     */
    private static inferDomainsFromSpecializations(specializations: string[]): string[] {
        const domainMapping = {
            frontend: ['ui-ux', 'responsive-design', 'component-design', 'styling', 'accessibility'],
            backend: ['api-design', 'database-design', 'microservices', 'authentication', 'server-architecture'],
            mobile: ['mobile-development', 'react-native', 'ios-development', 'android-development'],
            'ai-ml': ['machine-learning', 'data-science', 'nlp', 'computer-vision', 'deep-learning'],
            devops: ['ci-cd', 'deployment', 'docker', 'kubernetes', 'infrastructure'],
            security: ['security-audit', 'penetration-testing', 'compliance', 'encryption'],
            quality: ['testing', 'automation', 'quality-assurance', 'performance-testing']
        };

        const detectedDomains = new Set<string>();

        for (const spec of specializations) {
            for (const [domain, specs] of Object.entries(domainMapping)) {
                if (specs.some(s => spec.toLowerCase().includes(s) || s.includes(spec.toLowerCase()))) {
                    detectedDomains.add(domain);
                }
            }
        }

        // Default to fullstack if multiple domains detected
        if (detectedDomains.size > 2) {
            return ['fullstack'];
        }

        return Array.from(detectedDomains).slice(0, 3); // Limit to 3 domains
    }

    /**
     * Create domain-specific configuration
     */
    private static createDomainConfig(domain: string, baseConfig: any): AgentConfig {
        const domainConfig: DeveloperConfig = {
            category: 'developer',
            primaryDomain: domain as 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'ai-ml' | 'data',
            languages: baseConfig.languages || [],
            frameworks: baseConfig.frameworks || [],
            specializations: this.getDomainSpecializations(domain, baseConfig.specializations || []),
            toolchain: baseConfig.toolchain || [],
            complexity: baseConfig.complexity || 'medium',
            priority: baseConfig.priority || 'medium'
        };

        return domainConfig;
    }

    /**
     * Get domain-specific specializations
     */
    private static getDomainSpecializations(domain: string, allSpecs: string[]): string[] {
        const domainSpecs = {
            frontend: ['ui-ux', 'responsive-design', 'component-design', 'accessibility'],
            backend: ['api-design', 'database-design', 'microservices', 'authentication'],
            fullstack: ['end-to-end-development', 'integration', 'system-design'],
            mobile: ['mobile-development', 'cross-platform', 'native-development'],
            'ai-ml': ['machine-learning', 'data-science', 'model-development'],
            devops: ['ci-cd', 'deployment', 'infrastructure-management'],
            security: ['security-audit', 'penetration-testing', 'compliance'],
            quality: ['testing-automation', 'quality-assurance', 'performance-optimization']
        };

        const domainSpecific = domainSpecs[domain as keyof typeof domainSpecs] || [];
        const relevant = allSpecs.filter(spec => domainSpecific.some(ds => spec.includes(ds) || ds.includes(spec)));

        return [...domainSpecific, ...relevant].slice(0, 5); // Limit to 5 specializations
    }

    /**
     * Create a single domain template
     */
    private static createSingleDomainTemplate(config: AgentConfig): SmartAgentTemplate {
        const template = new DeveloperSmartTemplate(config as DeveloperConfig);
        return template.generateTemplate();
    }

    /**
     * Compose multiple templates into a single composite template
     */
    private static composeTemplates(templates: SmartAgentTemplate[], config: any): SmartAgentTemplate {
        if (templates.length === 0) {
            throw new Error('No templates to compose');
        }

        if (templates.length === 1) {
            return templates[0];
        }

        const primaryTemplate = templates[0];
        const compositeTemplate: SmartAgentTemplate = {
            ...primaryTemplate,
            id: this.generateCompositeId(templates),
            name: this.generateCompositeName(templates),
            description: this.generateCompositeDescription(templates),
            systemPrompt: '', // this.composeSystemPrompts(templates),
            detailedPrompt: '', // this.composeDetailedPrompts(templates),
            capabilities: [], // this.composeCapabilities(templates),
            taskPreferences: {
                preferred: [],
                avoid: [],
                priority: 'medium',
                complexity: 'medium'
            },
            filePatterns: {
                watch: [],
                ignore: []
            },
            config: {
                ...primaryTemplate.config,
                domains: templates.map(t => (t.config as any).primaryDomain),
                compositeType: 'multi-domain'
            } as unknown as AgentConfig
        };

        return compositeTemplate;
    }

    /**
     * Generate composite ID
     */
    private static generateCompositeId(templates: SmartAgentTemplate[]): string {
        const domains = templates
            .map(t => (t.config as any).primaryDomain || 'unknown')
            .sort()
            .join('-');
        return `composite-${domains}-specialist`;
    }

    /**
     * Generate composite name
     */
    private static generateCompositeName(templates: SmartAgentTemplate[]): string {
        if (templates.length === 2) {
            const domains = templates.map(t => (t.config as any).primaryDomain);
            return `${domains[0]}-${domains[1]} Specialist`;
        }

        return `Multi-Domain Specialist`;
    }

    /**
     * Generate composite description
     */
    private static generateCompositeDescription(templates: SmartAgentTemplate[]): string {
        const domains = templates.map(t => (t.config as any).primaryDomain);
        return `Multi-domain specialist combining expertise in ${domains.join(', ')}. Capable of end-to-end development across multiple technical domains.`;
    }

    /**
     * Compose system prompts
     */
    private static composeSystemPrompts(templates: SmartAgentTemplate[]): string {
        const domains = templates.map(t => (t.config as any).primaryDomain);
        const specializations = templates.flatMap(t => (t.config as any).specializations || []);

        return `You are a Multi-Domain Specialist with expertise in ${domains.join(', ')}. 

Core Competencies: ${specializations.slice(0, 6).join(', ')}.

You excel at:
- Cross-domain integration and system thinking
- End-to-end development workflows
- Technical decision-making across multiple domains
- Bridging different technical areas effectively

Communication Style: Technical yet accessible, able to explain complex integrations clearly, provide comprehensive solutions that span multiple domains.`;
    }

    /**
     * Compose detailed prompts
     */
    private static composeDetailedPrompts(templates: SmartAgentTemplate[]): string {
        const domains = templates.map(t => (t.config as any).primaryDomain);

        return `You are a Multi-Domain Specialist with deep expertise across ${domains.join(', ')}. You excel at creating comprehensive solutions that integrate multiple technical domains seamlessly.

Your strength lies in:
- Understanding the complete technical stack from ${domains[0]} to ${domains[domains.length - 1]}
- Identifying optimal integration points between different domains
- Making informed architectural decisions that consider all domains
- Delivering end-to-end solutions with consistent quality

Technical Excellence: Design systems that leverage the best of each domain, implement solutions that are both domain-specific and well-integrated, ensure quality and maintainability across the entire technical stack.

Always consider: Performance implications across domains, security at integration points, maintainability of cross-domain code, scalability of integrated solutions.`;
    }

    /**
     * Compose capabilities from multiple templates
     */
    private static composeCapabilities(templates: SmartAgentTemplate[]): object {
        const compositeCapabilities: any = {
            domains: {},
            languages: new Set(),
            frameworks: new Set(),
            tools: new Set(),
            specializations: new Set()
        };

        for (const template of templates) {
            const caps = template.capabilities as any;

            // Domain-specific capabilities
            const domain = (template.config as any).primaryDomain;
            compositeCapabilities.domains[domain] = caps;

            // Aggregate capabilities
            if (caps.languages) {
                if (Array.isArray(caps.languages)) {
                    caps.languages.forEach((lang: string) => compositeCapabilities.languages.add(lang));
                } else if (caps.languages.all) {
                    caps.languages.all.forEach((lang: string) => compositeCapabilities.languages.add(lang));
                }
            }

            if (caps.frameworks) {
                caps.frameworks.forEach((fw: string) => compositeCapabilities.frameworks.add(fw));
            }

            if (caps.tools) {
                caps.tools.forEach((tool: string) => compositeCapabilities.tools.add(tool));
            }

            if (caps.specializations) {
                caps.specializations.forEach((spec: string) => compositeCapabilities.specializations.add(spec));
            }
        }

        return {
            ...compositeCapabilities,
            languages: Array.from(compositeCapabilities.languages),
            frameworks: Array.from(compositeCapabilities.frameworks),
            tools: Array.from(compositeCapabilities.tools),
            specializations: Array.from(compositeCapabilities.specializations),
            compositeType: 'multi-domain'
        };
    }

    /**
     * Compose task preferences
     */
    private static composeTaskPreferences(templates: SmartAgentTemplate[]): object {
        const allPreferred = new Set<string>();
        const allAvoided = new Set<string>();
        let maxPriority = 'medium';
        let maxComplexity = 'medium';

        for (const template of templates) {
            const prefs = template.taskPreferences as any;

            if (prefs.preferred) {
                prefs.preferred.forEach((pref: string) => allPreferred.add(pref));
            }

            if (prefs.avoid) {
                prefs.avoid.forEach((avoid: string) => allAvoided.add(avoid));
            }

            // Take highest priority and complexity
            if (prefs.priority === 'critical' || (prefs.priority === 'high' && maxPriority === 'medium')) {
                maxPriority = prefs.priority;
            }

            if (prefs.complexity === 'high') {
                maxComplexity = 'high';
            }
        }

        // Add composite-specific preferences
        allPreferred.add('end-to-end-development');
        allPreferred.add('cross-domain-integration');
        allPreferred.add('system-design');
        allPreferred.add('technical-architecture');

        // Remove conflicting preferences (things we can't avoid if we prefer them)
        for (const preferred of allPreferred) {
            allAvoided.delete(preferred);
        }

        return {
            preferred: Array.from(allPreferred),
            avoid: Array.from(allAvoided),
            priority: maxPriority,
            complexity: maxComplexity
        };
    }

    /**
     * Compose file patterns
     */
    private static composeFilePatterns(templates: SmartAgentTemplate[]): object {
        const allWatch = new Set<string>();
        const allIgnore = new Set<string>();

        for (const template of templates) {
            const patterns = template.filePatterns as any;

            if (patterns?.watch) {
                patterns.watch.forEach((pattern: string) => allWatch.add(pattern));
            }

            if (patterns?.ignore) {
                patterns.ignore.forEach((pattern: string) => allIgnore.add(pattern));
            }
        }

        return {
            watch: Array.from(allWatch),
            ignore: Array.from(allIgnore)
        };
    }
}

// ===== SMART TEMPLATE FACTORY =====

export class SmartTemplateFactory {
    static createTemplate(config: AgentConfig): SmartAgentTemplate {
        // Handle composite templates (multiple domains/specializations)
        const isComposite = this.isCompositeConfig(config);
        if (isComposite) {
            return SmartTemplateComposer.createCompositeTemplate(config);
        }

        let template: BaseSmartTemplate;

        switch (config.category) {
            case 'developer':
                template = new DeveloperSmartTemplate(config as DeveloperConfig);
                break;
            case 'architect':
                template = new ArchitectSmartTemplate(config as ArchitectConfig);
                break;
            case 'quality':
                template = new QualitySmartTemplate(config as QualityConfig);
                break;
            case 'process':
                template = new ProcessSmartTemplate(config as ProcessConfig);
                break;
            default:
                throw new Error(`Unknown template category: ${(config as any).category}`);
        }

        return template.generateTemplate();
    }

    /**
     * Check if configuration requires composite template handling
     */
    private static isCompositeConfig(config: AgentConfig): boolean {
        // Check for composite indicators
        const compositeConfig = config as any;

        return (
            // Multiple domains specified
            Array.isArray(compositeConfig.domains) ||
            // Multiple specializations that span domains
            (Array.isArray(compositeConfig.specializations) && compositeConfig.specializations.length > 3) ||
            // Explicit composite configuration
            compositeConfig.compositeConfig ||
            // Cross-domain skill requirements
            compositeConfig.crossDomain === true
        );
    }

    static createPresetTemplates(): SmartAgentTemplate[] {
        return [
            // Developer presets
            this.createTemplate({
                category: 'developer',
                primaryDomain: 'frontend',
                languages: ['typescript', 'javascript', 'html', 'css'],
                frameworks: ['react', 'next.js', 'tailwind-css'],
                specializations: ['responsive-design', 'accessibility', 'performance'],
                toolchain: ['vscode', 'git', 'webpack', 'jest'],
                complexity: 'high',
                priority: 'high'
            } as DeveloperConfig),

            this.createTemplate({
                category: 'developer',
                primaryDomain: 'backend',
                languages: ['typescript', 'python', 'sql'],
                frameworks: ['express', 'fastapi', 'postgresql'],
                specializations: ['api-design', 'database-design', 'authentication'],
                toolchain: ['vscode', 'git', 'docker', 'jest'],
                complexity: 'high',
                priority: 'high'
            } as DeveloperConfig),

            this.createTemplate({
                category: 'developer',
                primaryDomain: 'fullstack',
                languages: ['typescript', 'javascript', 'python'],
                frameworks: ['react', 'express', 'postgresql'],
                specializations: ['end-to-end-development', 'api-design', 'ui-ux'],
                toolchain: ['vscode', 'git', 'docker', 'jest'],
                complexity: 'high',
                priority: 'high'
            } as DeveloperConfig),

            // Architect preset
            this.createTemplate({
                category: 'architect',
                scope: 'software',
                focusAreas: ['system-design', 'scalability', 'performance'],
                decisionLevel: 'strategic',
                systemTypes: ['microservices', 'distributed-systems'],
                complexity: 'high',
                priority: 'high'
            } as ArchitectConfig),

            // Quality preset
            this.createTemplate({
                category: 'quality',
                primaryFocus: 'testing',
                testingTypes: ['unit', 'integration', 'e2e'],
                securityScope: ['application-security'],
                auditAreas: ['code-quality'],
                toolchain: ['jest', 'cypress', 'playwright'],
                complexity: 'high',
                priority: 'high'
            } as QualityConfig),

            // Process preset
            this.createTemplate({
                category: 'process',
                role: 'product-manager',
                methodologies: ['agile', 'scrum'],
                stakeholders: ['users', 'development-team', 'business'],
                deliverables: ['roadmaps', 'requirements', 'user-stories'],
                communicationStyle: 'business',
                complexity: 'medium',
                priority: 'high'
            } as ProcessConfig)
        ];
    }
}
