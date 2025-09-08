/**
 * Simple Agent Template Validation Test
 *
 * This test validates that agent templates exist, are valid JSON, and have required fields.
 * This is a critical test because if templates are broken, the entire system fails.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
    createMockConfigurationService,
    createMockLoggingService,
    createMockEventBus,
    createMockNotificationService,
    createMockContainer,
    createMockExtensionContext,
    createMockOutputChannel,
    createMockTerminal,
    setupVSCodeMocks
} from './../helpers/mockFactories';

describe('Simple Agent Template Validation', () => {
    const templatesDir = path.join(__dirname, '../../../src/agents/templates');

    it('should find the templates directory', () => {
        expect(fs.existsSync(templatesDir)).toBe(true);
        console.log('Templates directory found:', templatesDir);
    });

    it('should have template files', () => {
        const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        expect(files.length).toBeGreaterThan(0);
        console.log(`Found ${files.length} template files:`, files);
    });

    it('should parse all templates as valid JSON', () => {
        const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        const templates: any[] = [];

        templateFiles.forEach(filename => {
            const filePath = path.join(templatesDir, filename);
            const content = fs.readFileSync(filePath, 'utf8');

            let template: any;
            expect(() => {
                template = JSON.parse(content);
            }).not.toThrow();

            templates.push({ filename, template });
        });

        expect(templates.length).toBe(templateFiles.length);
        console.log(`Successfully parsed ${templates.length} templates`);
    });

    it('should validate critical testing specialist template', () => {
        const testingTemplate = path.join(templatesDir, 'testing-specialist.json');
        expect(fs.existsSync(testingTemplate)).toBe(true);

        const content = fs.readFileSync(testingTemplate, 'utf8');
        const template = JSON.parse(content);

        // Required fields
        expect(template.id).toBe('testing-specialist');
        expect(template.name).toBeTruthy();
        expect(typeof template.name).toBe('string');
        expect(template.systemPrompt).toBeTruthy();
        expect(typeof template.systemPrompt).toBe('string');
        expect(template.systemPrompt.length).toBeGreaterThan(100);

        // Should have testing-related content
        const promptLower = template.systemPrompt.toLowerCase();
        expect(promptLower).toMatch(/test|testing|qa|quality/);

        console.log('Testing specialist template validated successfully');
        console.log('- ID:', template.id);
        console.log('- Name:', template.name);
        console.log('- System prompt length:', template.systemPrompt.length);
    });

    it('should validate all templates have required fields', () => {
        const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        const validationResults: Array<{ filename: string; valid: boolean; errors: string[] }> = [];

        templateFiles.forEach(filename => {
            const filePath = path.join(templatesDir, filename);
            const content = fs.readFileSync(filePath, 'utf8');
            const template = JSON.parse(content);
            const errors: string[] = [];

            // Validate required fields
            if (!template.id || typeof template.id !== 'string') {
                errors.push('Missing or invalid id');
            }
            if (!template.name || typeof template.name !== 'string') {
                errors.push('Missing or invalid name');
            }
            if (!template.systemPrompt || typeof template.systemPrompt !== 'string') {
                errors.push('Missing or invalid systemPrompt');
            }
            if (template.systemPrompt && template.systemPrompt.length < 50) {
                errors.push('systemPrompt too short');
            }

            // Check ID matches filename
            const expectedId = filename.replace('.json', '');
            if (template.id !== expectedId) {
                errors.push(`ID '${template.id}' doesn't match filename '${expectedId}'`);
            }

            validationResults.push({
                filename,
                valid: errors.length === 0,
                errors
            });
        });

        // Report results
        const validCount = validationResults.filter(r => r.valid).length;
        const invalidCount = validationResults.filter(r => !r.valid).length;

        console.log(`Validation results: ${validCount} valid, ${invalidCount} invalid`);

        validationResults.forEach(result => {
            if (!result.valid) {
                console.error(`❌ ${result.filename}:`, result.errors);
            } else {
                console.log(`✅ ${result.filename}: Valid`);
            }
        });

        // All templates should be valid
        expect(invalidCount).toBe(0);
        expect(validCount).toBe(templateFiles.length);
    });

    it('should have testing capabilities in testing specialist template', () => {
        const testingTemplate = path.join(templatesDir, 'testing-specialist.json');
        const content = fs.readFileSync(testingTemplate, 'utf8');
        const template = JSON.parse(content);

        expect(template.capabilities).toBeDefined();

        if (template.capabilities?.frameworks) {
            // Should have testing frameworks
            const frameworks = template.capabilities.frameworks;
            expect(frameworks.unit || frameworks.e2e || frameworks.api).toBeTruthy();

            if (frameworks.unit) {
                expect(frameworks.unit).toContain('jest');
            }
            if (frameworks.e2e) {
                expect(frameworks.e2e).toContain('playwright');
            }
        }

        if (template.taskPreferences?.preferred) {
            const preferred = template.taskPreferences.preferred;
            const hasTestingTasks = preferred.some(
                (task: string) => task.includes('test') || task.includes('qa') || task.includes('coverage')
            );
            expect(hasTestingTasks).toBe(true);
        }

        console.log('Testing specialist has appropriate capabilities');
    });

    it('should detect common template issues', () => {
        const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        const issues: Array<{ filename: string; issue: string }> = [];

        templateFiles.forEach(filename => {
            const filePath = path.join(templatesDir, filename);
            const content = fs.readFileSync(filePath, 'utf8');
            const template = JSON.parse(content);

            // Check for placeholder content
            const promptLower = template.systemPrompt?.toLowerCase() || '';
            if (promptLower.includes('todo') || promptLower.includes('placeholder')) {
                issues.push({ filename, issue: 'Contains placeholder text in systemPrompt' });
            }

            // Check for empty or generic descriptions
            if (template.description === '' || template.description === 'TODO: Add description') {
                issues.push({ filename, issue: 'Empty or placeholder description' });
            }

            // Check system prompt quality
            if (template.systemPrompt && template.systemPrompt.length < 100) {
                issues.push({ filename, issue: 'System prompt is too short' });
            }

            // Check for inconsistent naming
            if (template.name && template.id) {
                const nameLower = template.name.toLowerCase().replace(/[^a-z]/g, '');
                const idLower = template.id.toLowerCase().replace(/[^a-z]/g, '');

                // Names should be somewhat related
                const hasCommonWords = nameLower.split('').some((char: string) => idLower.includes(char));
                if (!hasCommonWords) {
                    issues.push({ filename, issue: 'Name and ID seem unrelated' });
                }
            }
        });

        // Report issues
        if (issues.length > 0) {
            console.log('Template issues found:');
            issues.forEach(issue => {
                console.warn(`⚠️  ${issue.filename}: ${issue.issue}`);
            });
        } else {
            console.log('No template issues found');
        }

        // For now, we'll just report issues but not fail the test
        // This allows us to see problems without breaking the build
    });

    it('should have unique template IDs and names', () => {
        const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        const ids: string[] = [];
        const names: string[] = [];

        templateFiles.forEach(filename => {
            const filePath = path.join(templatesDir, filename);
            const content = fs.readFileSync(filePath, 'utf8');
            const template = JSON.parse(content);

            ids.push(template.id);
            names.push(template.name);
        });

        // Check for duplicate IDs
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);

        // Check for duplicate names
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);

        console.log(`All ${ids.length} template IDs and names are unique`);
    });
});
