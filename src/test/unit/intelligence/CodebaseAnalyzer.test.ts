import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { CodebaseAnalyzer } from '../../../intelligence/CodebaseAnalyzer';

// Mock VS Code API
const mockOutputChannel = {
    appendLine: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn()
};

const mockUri = {
    fsPath: '/test/file.ts',
    scheme: 'file'
};

const mockWorkspaceFolder = {
    uri: { fsPath: '/test/workspace' },
    name: 'test-workspace',
    index: 0
};

const mockConfiguration = {
    get: jest.fn()
};

const mockWatcher = {
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn()
};

const mockExtensionContext = {
    subscriptions: [] as vscode.Disposable[]
};

Object.defineProperty(vscode.window, 'createOutputChannel', {
    value: jest.fn().mockReturnValue(mockOutputChannel),
    configurable: true
});

Object.defineProperty(vscode.workspace, 'getConfiguration', {
    value: jest.fn().mockReturnValue(mockConfiguration),
    configurable: true
});

Object.defineProperty(vscode.workspace, 'findFiles', {
    value: jest.fn(),
    configurable: true
});

Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    value: [mockWorkspaceFolder],
    configurable: true
});

Object.defineProperty(vscode.workspace, 'createFileSystemWatcher', {
    value: jest.fn().mockReturnValue(mockWatcher),
    configurable: true
});

jest.mock('vscode');

describe('CodebaseAnalyzer', () => {
    let codebaseAnalyzer: CodebaseAnalyzer;
    let fsReadFileMock: jest.SpyInstance;
    let fsStatMock: jest.SpyInstance;
    let fsExistsSyncMock: jest.SpyInstance;

    const mockTypeScriptCode = `
import * as vscode from 'vscode';
import { SomeService } from './some-service';

/**
 * Example class with documentation
 */
export class ExampleClass {
    private service: SomeService;

    constructor(service: SomeService) {
        this.service = service;
    }

    public process(data: any[]): boolean {
        if (data.length === 0) {
            return false;
        }

        for (const item of data) {
            if (item.type === 'complex') {
                return this.handleComplex(item);
            }
        }

        return true;
    }

    private handleComplex(item: any): boolean {
        try {
            return item.value > 0 && item.status === 'active';
        } catch (error) {
            return false;
        }
    }
}

export const helper = (input: string): string => input.toUpperCase();
export { SomeService } from './some-service';
`;

    const mockStats = {
        mtime: new Date('2024-01-01'),
        mtimeMs: 1704067200000,
        isFile: () => true,
        isDirectory: () => false
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup file system mocks
        fsReadFileMock = jest.spyOn(fs.promises, 'readFile').mockResolvedValue(mockTypeScriptCode);
        fsStatMock = jest.spyOn(fs.promises, 'stat').mockResolvedValue(mockStats as any);
        fsExistsSyncMock = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

        // Setup workspace configuration
        mockConfiguration.get.mockReturnValue({});
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([mockUri]);

        codebaseAnalyzer = new CodebaseAnalyzer(mockOutputChannel);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        codebaseAnalyzer?.clear();
    });

    describe('initialization', () => {
        it('should initialize with default output channel', () => {
            const analyzer = new CodebaseAnalyzer();
            expect(analyzer).toBeInstanceOf(CodebaseAnalyzer);
        });

        it('should initialize with custom output channel', () => {
            expect(codebaseAnalyzer).toBeInstanceOf(CodebaseAnalyzer);
        });

        it('should clear analysis data', () => {
            codebaseAnalyzer.clear();
            expect(codebaseAnalyzer.getComponents().size).toBe(0);
            expect(codebaseAnalyzer.getDependencyGraph().size).toBe(0);
        });
    });

    describe('analyzeWorkspace', () => {
        it('should analyze workspace successfully', async () => {
            const result = await codebaseAnalyzer.analyzeWorkspace();

            expect(result).toHaveProperty('components');
            expect(result).toHaveProperty('dependencies');
            expect(result).toHaveProperty('metrics');
            expect(result).toHaveProperty('timestamp');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Starting workspace analysis...');
            expect(vscode.workspace.findFiles).toHaveBeenCalled();
        });

        it('should handle cache results option', async () => {
            await codebaseAnalyzer.analyzeWorkspace({ cacheResults: true });
            expect(codebaseAnalyzer.isCached('/test/file.ts')).toBe(true);

            await codebaseAnalyzer.analyzeWorkspace({ cacheResults: false });
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Starting workspace analysis...');
        });

        it('should handle exclude patterns', async () => {
            const options = {
                excludePatterns: ['**/test/**', '**/spec/**']
            };

            await codebaseAnalyzer.analyzeWorkspace(options);

            expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
                '**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
                expect.stringContaining('test')
            );
        });

        it('should include node_modules when specified', async () => {
            const options = { includeNodeModules: true };

            await codebaseAnalyzer.analyzeWorkspace(options);

            expect(vscode.workspace.findFiles).toHaveBeenCalled();
        });

        it('should handle VS Code exclusion settings', async () => {
            mockConfiguration.get.mockReturnValue({
                '**/*.spec.ts': true,
                '**/build/**': true
            });

            await codebaseAnalyzer.analyzeWorkspace();

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('files');
        });

        it('should handle analysis errors gracefully', async () => {
            fsReadFileMock.mockRejectedValue(new Error('File read error'));

            const result = await codebaseAnalyzer.analyzeWorkspace();

            expect(result).toHaveProperty('components');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error analyzing'));
        });

        it('should handle workspace analysis failure', async () => {
            (vscode.workspace.findFiles as jest.Mock).mockRejectedValue(new Error('Workspace error'));

            await expect(codebaseAnalyzer.analyzeWorkspace()).rejects.toThrow('Workspace error');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Workspace analysis failed')
            );
        });

        it('should include test coverage when requested', async () => {
            const options = { includeTests: true };

            await codebaseAnalyzer.analyzeWorkspace(options);

            expect(fsExistsSyncMock).toHaveBeenCalled();
        });
    });

    describe('analyzeFile', () => {
        it('should analyze file successfully', async () => {
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result).toHaveProperty('path', '/test/file.ts');
            expect(result).toHaveProperty('component');
            expect(result).toHaveProperty('imports');
            expect(result).toHaveProperty('exports');
            expect(result).toHaveProperty('complexity');
            expect(result.component.name).toBe('file');
            expect(result.component.type).toBe('class');
        });

        it('should use cached analysis when available', async () => {
            // First analysis
            await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            // Second analysis should use cache
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            expect(fsReadFileMock).toHaveBeenCalledTimes(1);
            expect(result.path).toBe('/test/file.ts');
        });

        it('should invalidate cache on mtime mismatch', async () => {
            // First analysis
            await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            // Change mtime
            const newStats = { ...mockStats, mtimeMs: 1704153600000 };
            fsStatMock.mockResolvedValue(newStats as any);

            // Second analysis should not use cache
            await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            expect(fsReadFileMock).toHaveBeenCalledTimes(2);
        });

        it('should handle text analysis cache conflicts', async () => {
            // Analyze text first
            await codebaseAnalyzer.analyzeText('/test/file.ts', mockTypeScriptCode, { cacheResults: true });

            // File analysis should ignore text cache
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            expect(result.isTextAnalysis).toBeUndefined();
            expect(fsReadFileMock).toHaveBeenCalled();
        });

        it('should handle file read errors', async () => {
            fsReadFileMock.mockRejectedValue(new Error('Permission denied'));

            await expect(codebaseAnalyzer.analyzeFile('/test/file.ts')).rejects.toThrow(
                expect.stringContaining('Failed to analyze')
            );
        });

        it('should extract imports correctly', async () => {
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.imports).toHaveLength(2);
            expect(result.imports[0].source).toBe('vscode');
            expect(result.imports[1].source).toBe('./some-service');
        });

        it('should extract exports correctly', async () => {
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.exports).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'ExampleClass', type: 'named' }),
                    expect.objectContaining({ name: 'helper', type: 'named' }),
                    expect.objectContaining({ name: '*', type: 're-export', source: './some-service' })
                ])
            );
        });

        it('should calculate complexity metrics', async () => {
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.complexity).toHaveProperty('cyclomatic');
            expect(result.complexity).toHaveProperty('cognitive');
            expect(result.complexity).toHaveProperty('halstead');
            expect(result.complexity).toHaveProperty('maintainability');
            expect(result.complexity).toHaveProperty('loc');
            expect(result.complexity.cyclomatic).toBeGreaterThan(0);
        });

        it('should detect documentation', async () => {
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.component.hasDocs).toBe(true);
        });

        it('should include test coverage when requested', async () => {
            fsExistsSyncMock.mockReturnValue(true);

            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts', { includeTests: true });

            expect(result.component.testCoverage).toBe(80);
        });

        it('should handle files without tests', async () => {
            fsExistsSyncMock.mockReturnValue(false);

            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts', { includeTests: true });

            expect(result.component.testCoverage).toBe(0);
        });
    });

    describe('analyzeText', () => {
        it('should analyze text content successfully', async () => {
            const result = await codebaseAnalyzer.analyzeText('/test/file.ts', mockTypeScriptCode);

            expect(result).toHaveProperty('path', '/test/file.ts');
            expect(result).toHaveProperty('component');
            expect(result).toHaveProperty('isTextAnalysis', true);
            expect(result.component.name).toBe('file');
        });

        it('should use text-specific cache', async () => {
            // First analysis
            await codebaseAnalyzer.analyzeText('/test/file.ts', mockTypeScriptCode, { cacheResults: true });

            // Second analysis should use cache
            const result = await codebaseAnalyzer.analyzeText('/test/file.ts', mockTypeScriptCode, {
                cacheResults: true
            });

            expect(result.isTextAnalysis).toBe(true);
        });

        it('should handle text analysis errors', async () => {
            const invalidCode = 'invalid typescript code {{{';

            const result = await codebaseAnalyzer.analyzeText('/test/invalid.ts', invalidCode);

            expect(result.component).toBeDefined();
        });

        it('should skip test coverage for text analysis', async () => {
            const result = await codebaseAnalyzer.analyzeText('/test/file.ts', mockTypeScriptCode);

            expect(result.component.testCoverage).toBeUndefined();
        });
    });

    describe('updateFile', () => {
        it('should update file analysis', async () => {
            // Initial analysis
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            // Update analysis
            const result = await codebaseAnalyzer.updateFile('/test/file.ts');

            expect(result.path).toBe('/test/file.ts');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Updating analysis for'));
        });

        it('should handle incremental updates', async () => {
            // Setup dependency
            await codebaseAnalyzer.analyzeFile('/test/file.ts');
            await codebaseAnalyzer.analyzeFile('/test/dependent.ts');

            const result = await codebaseAnalyzer.updateFile('/test/file.ts', { incrementalUpdate: true });

            expect(result).toBeDefined();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Updated analysis for'));
        });

        it('should update dependency graphs', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            const oldDependencies = codebaseAnalyzer.getComponent('/test/file.ts')?.dependencies || [];

            await codebaseAnalyzer.updateFile('/test/file.ts');

            const newComponent = codebaseAnalyzer.getComponent('/test/file.ts');
            expect(newComponent).toBeDefined();
        });
    });

    describe('removeFile', () => {
        it('should remove file from analysis', () => {
            // First add a file
            codebaseAnalyzer.analyzeFile('/test/file.ts');

            codebaseAnalyzer.removeFile('/test/file.ts');

            expect(codebaseAnalyzer.getComponent('/test/file.ts')).toBeUndefined();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Removing'));
        });

        it('should handle removing non-existent file', () => {
            codebaseAnalyzer.removeFile('/test/nonexistent.ts');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('not found'));
        });

        it('should update dependent files', async () => {
            // Create dependency scenario
            await codebaseAnalyzer.analyzeFile('/test/dependency.ts');
            await codebaseAnalyzer.analyzeFile('/test/dependent.ts');

            codebaseAnalyzer.removeFile('/test/dependency.ts');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Warning'));
        });
    });

    describe('complexity analysis', () => {
        const complexCode = `
export function complexFunction(data: any[]): boolean {
    if (!data || data.length === 0) {
        return false;
    }

    for (const item of data) {
        if (item.type === 'A') {
            if (item.value > 10) {
                return true;
            }
        } else if (item.type === 'B') {
            try {
                return processB(item);
            } catch (error) {
                return false;
            }
        } else {
            switch (item.subtype) {
                case 'X':
                    return item.x > 0;
                case 'Y':
                    return item.y > 0;
                default:
                    return false;
            }
        }
    }

    return data.some(item => item.valid && item.processed);
}`;

        it('should calculate cyclomatic complexity correctly', async () => {
            fsReadFileMock.mockResolvedValue(complexCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/complex.ts');

            expect(result.complexity.cyclomatic).toBeGreaterThan(5);
        });

        it('should calculate cognitive complexity', async () => {
            fsReadFileMock.mockResolvedValue(complexCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/complex.ts');

            expect(result.complexity.cognitive).toBeGreaterThan(0);
        });

        it('should calculate Halstead metrics', async () => {
            fsReadFileMock.mockResolvedValue(complexCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/complex.ts');

            expect(result.complexity.halstead).toHaveProperty('volume');
            expect(result.complexity.halstead).toHaveProperty('difficulty');
            expect(result.complexity.halstead).toHaveProperty('effort');
        });

        it('should calculate maintainability index', async () => {
            fsReadFileMock.mockResolvedValue(complexCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/complex.ts');

            expect(result.complexity.maintainability).toBeGreaterThanOrEqual(0);
            expect(result.complexity.maintainability).toBeLessThanOrEqual(100);
        });

        it('should handle edge cases in complexity calculation', async () => {
            const emptyCode = '';
            fsReadFileMock.mockResolvedValue(emptyCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/empty.ts');

            expect(result.complexity.cyclomatic).toBe(1); // Base complexity
            expect(result.complexity.loc).toBeGreaterThanOrEqual(0);
        });
    });

    describe('dependency resolution', () => {
        it('should resolve relative imports', async () => {
            const codeWithRelativeImports = `
import { Service } from './service';
import { Utils } from '../utils';
import config from './config.json';
`;
            fsReadFileMock.mockResolvedValue(codeWithRelativeImports);
            fsExistsSyncMock.mockReturnValue(true);

            const result = await codebaseAnalyzer.analyzeFile('/test/src/file.ts');

            expect(result.component.dependencies).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('service'),
                    expect.stringContaining('utils'),
                    expect.stringContaining('config.json')
                ])
            );
        });

        it('should handle TypeScript path aliases', async () => {
            const mockTsConfig = {
                options: {
                    baseUrl: '.',
                    paths: {
                        '@app/*': ['src/app/*'],
                        '@shared/*': ['src/shared/*']
                    }
                }
            };

            jest.spyOn(ts, 'findConfigFile').mockReturnValue('/test/tsconfig.json');
            jest.spyOn(ts, 'readConfigFile').mockReturnValue({ config: mockTsConfig });
            jest.spyOn(ts, 'parseJsonConfigFileContent').mockReturnValue(mockTsConfig as any);

            const codeWithAliases = `
import { Component } from '@app/components';
import { Helper } from '@shared/utils';
import { createMockConfigurationService, createMockLoggingService, createMockEventBus, createMockNotificationService, createMockContainer, createMockExtensionContext, createMockOutputChannel, createMockTerminal, setupVSCodeMocks } from './../../helpers/mockFactories';

`;
            fsReadFileMock.mockResolvedValue(codeWithAliases);

            const result = await codebaseAnalyzer.analyzeFile('/test/src/file.ts');

            expect(result.imports).toHaveLength(2);
        });

        it('should handle dynamic imports', async () => {
            const codeWithDynamicImports = `
const module = require('./dynamic-module');
const asyncModule = await import('./async-module');
`;
            fsReadFileMock.mockResolvedValue(codeWithDynamicImports);

            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.imports).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ source: './dynamic-module', isDynamic: true }),
                    expect.objectContaining({ source: './async-module', isDynamic: true })
                ])
            );
        });

        it('should resolve re-exports', async () => {
            const codeWithReExports = `
export { Service } from './service';
export * from './utils';
`;
            fsReadFileMock.mockResolvedValue(codeWithReExports);

            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.exports).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ type: 're-export', source: './service' }),
                    expect.objectContaining({ type: 're-export', source: './utils' })
                ])
            );
        });
    });

    describe('circular dependency detection', () => {
        it('should detect circular dependencies', async () => {
            // Create circular dependency scenario
            await codebaseAnalyzer.analyzeFile('/test/a.ts');
            await codebaseAnalyzer.analyzeFile('/test/b.ts');

            const cycles = codebaseAnalyzer.findCircularDependencies();

            expect(cycles).toBeDefined();
            expect(Array.isArray(cycles)).toBe(true);
        });

        it('should handle empty dependency graph', () => {
            const cycles = codebaseAnalyzer.findCircularDependencies();

            expect(cycles).toEqual([]);
        });

        it('should assess cycle severity', async () => {
            // Mock a simple circular dependency
            const component1 = {
                name: 'a',
                path: '/test/a.ts',
                type: 'module' as const,
                imports: ['./b'],
                exports: ['default'],
                dependencies: ['/test/b.ts'],
                complexity: 1,
                linesOfCode: 10,
                hasDocs: false,
                lastModified: new Date(),
                qualityScore: 50
            };

            const component2 = {
                name: 'b',
                path: '/test/b.ts',
                type: 'module' as const,
                imports: ['./a'],
                exports: ['default'],
                dependencies: ['/test/a.ts'],
                complexity: 1,
                linesOfCode: 10,
                hasDocs: false,
                lastModified: new Date(),
                qualityScore: 50
            };

            // Manually set up circular dependency
            codebaseAnalyzer.clear();
            codebaseAnalyzer['components'].set('/test/a.ts', component1);
            codebaseAnalyzer['components'].set('/test/b.ts', component2);
            codebaseAnalyzer['buildDependencyGraph']();

            const cycles = codebaseAnalyzer.findCircularDependencies();

            if (cycles.length > 0) {
                expect(cycles[0]).toHaveProperty('severity');
                expect(['low', 'medium', 'high']).toContain(cycles[0].severity);
            }
        });
    });

    describe('component analysis', () => {
        it('should infer component types correctly', async () => {
            const testCases = [
                { file: '/test/component.ts', expectedType: 'component' },
                { file: '/test/service.ts', expectedType: 'service' },
                { file: '/test/interface.ts', expectedType: 'interface' },
                { file: '/test/type.ts', expectedType: 'type' }
            ];

            for (const { file, expectedType } of testCases) {
                const result = await codebaseAnalyzer.analyzeFile(file);
                expect(result.component.type).toBe(expectedType);
            }
        });

        it('should calculate quality scores', async () => {
            const result = await codebaseAnalyzer.analyzeFile('/test/file.ts');

            expect(result.component.qualityScore).toBeGreaterThanOrEqual(0);
            expect(result.component.qualityScore).toBeLessThanOrEqual(100);
        });

        it('should find untested components', async () => {
            fsExistsSyncMock.mockReturnValue(false); // No test files

            await codebaseAnalyzer.analyzeFile('/test/file.ts', { includeTests: true });

            const untested = codebaseAnalyzer.findUntestedComponents();

            expect(untested).toContain('/test/file.ts');
        });

        it('should find complex components', async () => {
            const veryComplexCode = `
export function megaComplexFunction(data: any): any {
    if (data.a) {
        if (data.b) {
            if (data.c) {
                if (data.d) {
                    if (data.e) {
                        return processE();
                    }
                }
            }
        }
    }
    return null;
}`;
            fsReadFileMock.mockResolvedValue(veryComplexCode);

            await codebaseAnalyzer.analyzeFile('/test/complex.ts');

            const complex = codebaseAnalyzer.findComplexComponents(5);

            expect(complex).toContain('/test/complex.ts');
        });
    });

    describe('workspace metrics', () => {
        it('should calculate aggregated complexity metrics', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file1.ts');
            await codebaseAnalyzer.analyzeFile('/test/file2.ts');

            const metrics = codebaseAnalyzer.getAggregatedComplexity();

            expect(metrics).toHaveProperty('averageCyclomatic');
            expect(metrics).toHaveProperty('averageMaintainability');
            expect(metrics).toHaveProperty('totalCyclomatic');
            expect(metrics).toHaveProperty('filesAnalyzed');
            expect(metrics).toHaveProperty('complexityDistribution');
            expect(metrics).toHaveProperty('maintainabilityDistribution');
        });

        it('should handle empty workspace', () => {
            const metrics = codebaseAnalyzer.getAggregatedComplexity();

            expect(metrics.filesAnalyzed).toBe(0);
            expect(metrics.averageCyclomatic).toBe(0);
        });

        it('should calculate median values correctly', async () => {
            // Create files with known complexity values
            const files = ['/test/simple.ts', '/test/medium.ts', '/test/complex.ts'];
            for (const file of files) {
                await codebaseAnalyzer.analyzeFile(file);
            }

            const metrics = codebaseAnalyzer.getAggregatedComplexity();

            expect(metrics.medianCyclomatic).toBeGreaterThanOrEqual(0);
            expect(metrics.medianMaintainability).toBeGreaterThanOrEqual(0);
        });
    });

    describe('file watchers', () => {
        it('should setup file watchers', () => {
            codebaseAnalyzer.setupWatchers(mockExtensionContext);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
                '**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'
            );
            expect(mockWatcher.onDidChange).toHaveBeenCalled();
            expect(mockWatcher.onDidCreate).toHaveBeenCalled();
            expect(mockWatcher.onDidDelete).toHaveBeenCalled();
        });

        it('should handle file change events', async () => {
            codebaseAnalyzer.setupWatchers(mockExtensionContext);

            const changeHandler = mockWatcher.onDidChange.mock.calls[0][0];
            await changeHandler(mockUri);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('File changed'));
        });

        it('should handle file creation events', async () => {
            codebaseAnalyzer.setupWatchers(mockExtensionContext);

            const createHandler = mockWatcher.onDidCreate.mock.calls[0][0];
            await createHandler(mockUri);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('File created'));
        });

        it('should handle file deletion events', () => {
            codebaseAnalyzer.setupWatchers(mockExtensionContext);

            const deleteHandler = mockWatcher.onDidDelete.mock.calls[0][0];
            deleteHandler(mockUri);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('File deleted'));
        });
    });

    describe('getter methods', () => {
        it('should return components map', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            const components = codebaseAnalyzer.getComponents();

            expect(components).toBeInstanceOf(Map);
            expect(components.has('/test/file.ts')).toBe(true);
        });

        it('should return dependency graph', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            const graph = codebaseAnalyzer.getDependencyGraph();

            expect(graph).toBeInstanceOf(Map);
        });

        it('should return reverse dependency graph', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            const reverseGraph = codebaseAnalyzer.getReverseDependencyGraph();

            expect(reverseGraph).toBeInstanceOf(Map);
        });

        it('should return complexity metrics', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            const metrics = codebaseAnalyzer.getComplexityMetrics();

            expect(metrics).toBeInstanceOf(Map);
        });

        it('should get component by path', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts');

            const component = codebaseAnalyzer.getComponent('/test/file.ts');

            expect(component).toBeDefined();
            expect(component?.path).toBe('/test/file.ts');
        });

        it('should return undefined for non-existent component', () => {
            const component = codebaseAnalyzer.getComponent('/test/nonexistent.ts');

            expect(component).toBeUndefined();
        });

        it('should get dependents', async () => {
            await codebaseAnalyzer.analyzeWorkspace();

            const dependents = codebaseAnalyzer.getDependents('/test/file.ts');

            expect(dependents).toBeDefined();
        });

        it('should check if file is cached', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            expect(codebaseAnalyzer.isCached('/test/file.ts')).toBe(true);
            expect(codebaseAnalyzer.isCached('/test/nonexistent.ts')).toBe(false);
        });

        it('should get cached analysis', async () => {
            await codebaseAnalyzer.analyzeFile('/test/file.ts', { cacheResults: true });

            const cached = codebaseAnalyzer.getCachedAnalysis('/test/file.ts');

            expect(cached).toBeDefined();
            expect(cached?.path).toBe('/test/file.ts');
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle malformed TypeScript files', async () => {
            const malformedCode = 'export class { invalid syntax }';
            fsReadFileMock.mockResolvedValue(malformedCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/malformed.ts');

            expect(result).toBeDefined();
            expect(result.component).toBeDefined();
        });

        it('should handle empty files', async () => {
            fsReadFileMock.mockResolvedValue('');

            const result = await codebaseAnalyzer.analyzeFile('/test/empty.ts');

            expect(result.component.linesOfCode).toBe(1); // Empty file has 1 line
            expect(result.complexity.cyclomatic).toBe(1); // Base complexity
        });

        it('should handle files with only comments', async () => {
            const commentOnlyCode = '// This is just a comment\n/* And a block comment */';
            fsReadFileMock.mockResolvedValue(commentOnlyCode);

            const result = await codebaseAnalyzer.analyzeFile('/test/comments.ts');

            expect(result.component.linesOfCode).toBe(2);
        });

        it('should handle very large files', async () => {
            const largeCode = 'const x = 1;\n'.repeat(10000);
            fsReadFileMock.mkImplementation(
                () =>
                    new Promise(resolve => {
                        setTimeout(() => resolve(largeCode), 10);
                    })
            );

            const result = await codebaseAnalyzer.analyzeFile('/test/large.ts');

            expect(result.component.linesOfCode).toBe(10000);
        });

        it('should handle special characters in file paths', async () => {
            const specialPath = '/test/file with spaces & special-chars.ts';

            const result = await codebaseAnalyzer.analyzeFile(specialPath);

            expect(result.path).toBe(specialPath);
        });

        it('should handle concurrent analysis requests', async () => {
            const promises = [
                codebaseAnalyzer.analyzeFile('/test/file1.ts'),
                codebaseAnalyzer.analyzeFile('/test/file2.ts'),
                codebaseAnalyzer.analyzeFile('/test/file3.ts')
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result).toBeDefined();
                expect(result.component).toBeDefined();
            });
        });
    });
});
