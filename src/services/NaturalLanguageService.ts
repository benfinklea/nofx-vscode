import { ILogger } from './interfaces';

export interface AgentConfig {
    capabilities?: string[];
    suggestedName?: string;
}

/**
 * Service for parsing natural language descriptions into agent configurations
 */
export class NaturalLanguageService {
    private loggingService?: ILogger;

    constructor(loggingService?: ILogger) {
        this.loggingService = loggingService;
    }

    /**
     * Parse a natural language description to determine agent configuration
     */
    async parseAgentDescription(description: string): Promise<AgentConfig | null> {
        try {
            const lowerDesc = description.toLowerCase();
            const capabilities: string[] = [];
            let suggestedName = 'Custom Agent';

            // Detect programming languages
            if (lowerDesc.includes('python')) capabilities.push('Python');
            if (lowerDesc.includes('javascript') || lowerDesc.includes('js')) capabilities.push('JavaScript');
            if (lowerDesc.includes('typescript') || lowerDesc.includes('ts')) capabilities.push('TypeScript');
            if (lowerDesc.includes('java')) capabilities.push('Java');
            if (lowerDesc.includes('c++') || lowerDesc.includes('cpp')) capabilities.push('C++');
            if (lowerDesc.includes('rust')) capabilities.push('Rust');
            if (lowerDesc.includes('go') || lowerDesc.includes('golang')) capabilities.push('Go');

            // Detect frameworks
            if (lowerDesc.includes('react')) capabilities.push('React');
            if (lowerDesc.includes('vue')) capabilities.push('Vue');
            if (lowerDesc.includes('angular')) capabilities.push('Angular');
            if (lowerDesc.includes('node')) capabilities.push('Node.js');
            if (lowerDesc.includes('express')) capabilities.push('Express');
            if (lowerDesc.includes('django')) capabilities.push('Django');
            if (lowerDesc.includes('flask')) capabilities.push('Flask');
            if (lowerDesc.includes('spring')) capabilities.push('Spring');

            // Detect specialties
            if (lowerDesc.includes('frontend') || lowerDesc.includes('ui') || lowerDesc.includes('ux')) {
                capabilities.push('Frontend', 'UI/UX');
                suggestedName = 'Frontend Specialist';
            }
            if (lowerDesc.includes('backend') || lowerDesc.includes('api') || lowerDesc.includes('server')) {
                capabilities.push('Backend', 'API Development');
                suggestedName = 'Backend Specialist';
            }
            if (lowerDesc.includes('fullstack') || lowerDesc.includes('full-stack')) {
                capabilities.push('Fullstack');
                suggestedName = 'Fullstack Developer';
            }
            if (lowerDesc.includes('database') || lowerDesc.includes('sql') || lowerDesc.includes('mongodb')) {
                capabilities.push('Database');
                suggestedName = 'Database Expert';
            }
            if (lowerDesc.includes('test') || lowerDesc.includes('qa') || lowerDesc.includes('quality')) {
                capabilities.push('Testing', 'QA');
                suggestedName = 'Test Engineer';
            }
            if (lowerDesc.includes('devops') || lowerDesc.includes('ci/cd') || lowerDesc.includes('docker')) {
                capabilities.push('DevOps', 'CI/CD');
                suggestedName = 'DevOps Engineer';
            }
            if (lowerDesc.includes('security') || lowerDesc.includes('penetration') || lowerDesc.includes('audit')) {
                capabilities.push('Security');
                suggestedName = 'Security Expert';
            }
            if (lowerDesc.includes('mobile') || lowerDesc.includes('ios') || lowerDesc.includes('android')) {
                capabilities.push('Mobile Development');
                suggestedName = 'Mobile Developer';
            }
            if (lowerDesc.includes('ai') || lowerDesc.includes('ml') || lowerDesc.includes('machine learning')) {
                capabilities.push('AI/ML');
                suggestedName = 'AI/ML Specialist';
            }

            // If no capabilities detected, try to be helpful
            if (capabilities.length === 0) {
                capabilities.push('General Development');
            }

            return {
                capabilities,
                suggestedName
            };
        } catch (error) {
            this.loggingService?.error('Failed to parse agent description', error);
            return null;
        }
    }
}
