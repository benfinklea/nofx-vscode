/**
 * CodebaseAnalyzer - Advanced TypeScript AST-based code analysis
 */

import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import {
    CodeComponent,
    ImportInfo,
    ExportInfo,
    ComplexityMetrics,
    DependencyGraph,
    FileAnalysis,
    WorkspaceAnalysis,
    QualityMetrics,
    CircularDependency,
    AnalysisOptions,
    AggregatedComplexityMetrics
} from './types';

export class CodebaseAnalyzer {
    private components: Map<string, CodeComponent> = new Map();
    private dependencyGraph: DependencyGraph = new Map();
    private reverseDependencyGraph: DependencyGraph = new Map();
    private analysisCache: Map<string, FileAnalysis> = new Map();
    private outputChannel: vscode.OutputChannel;
    private compilerOptions: ts.CompilerOptions;
    private tsConfigCache: Map<string, ts.ParsedCommandLine | null> = new Map();
    private pathAliasResolver: Map<string, string[]> = new Map();

    // Common file extensions for dependency resolution
    private readonly FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];
    private readonly INDEX_EXTENSIONS = [
        '/index.ts',
        '/index.tsx',
        '/index.js',
        '/index.jsx',
        '/index.mjs',
        '/index.cjs',
        '/index.mts',
        '/index.cts'
    ];

    constructor(outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('NofX Analyzer');
        this.compilerOptions = {
            target: ts.ScriptTarget.Latest,
            module: ts.ModuleKind.CommonJS,
            allowJs: true,
            jsx: ts.JsxEmit.React,
            esModuleInterop: true,
            skipLibCheck: true,
            noResolve: false
        };
    }

    /**
     * Analyze the entire workspace
     */
    public async analyzeWorkspace(options: AnalysisOptions = {}): Promise<WorkspaceAnalysis> {
        this.outputChannel.appendLine('Starting workspace analysis...');
        this.components.clear();
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();

        if (!options.cacheResults) {
            this.analysisCache.clear();
        }

        try {
            // Find all TypeScript/JavaScript files including module variants
            const pattern = '**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}';

            // Get VS Code's file exclusion settings
            const config = vscode.workspace.getConfiguration('files');
            const vsCodeExclusions = config.get<Record<string, boolean>>('exclude', {});

            // Build exclusion pattern - be more precise to avoid over-exclusion
            const defaultExclusions: string[] = [];

            // Always exclude node_modules unless explicitly included
            if (!options.includeNodeModules) {
                defaultExclusions.push('**/node_modules/**');
            }

            // Add VS Code's configured exclusions
            for (const [pattern, enabled] of Object.entries(vsCodeExclusions)) {
                if (enabled) {
                    defaultExclusions.push(pattern);
                }
            }

            // Add user-provided exclusions
            const additionalExclusions = options.excludePatterns || [];
            const allExclusions = [...defaultExclusions, ...additionalExclusions];

            // Use glob patterns directly instead of combining them
            const exclude = allExclusions.length > 0 ? `{${allExclusions.join(',')}}` : undefined;

            const files = await vscode.workspace.findFiles(pattern, exclude);

            this.outputChannel.appendLine(`Found ${files.length} files to analyze`);

            // Analyze each file
            for (const file of files) {
                try {
                    await this.analyzeFile(file.fsPath, options);
                } catch (error) {
                    this.outputChannel.appendLine(`Error analyzing ${file.fsPath}: ${error}`);
                }
            }

            // Build dependency graphs
            this.buildDependencyGraph();

            // Calculate workspace metrics
            const metrics = this.calculateWorkspaceMetrics();

            const result: WorkspaceAnalysis = {
                components: Object.fromEntries(this.components),
                dependencies: this.dependencyGraph,
                metrics,
                timestamp: new Date()
            };

            this.outputChannel.appendLine(`Analysis complete. Analyzed ${this.components.size} components`);
            return result;
        } catch (error) {
            this.outputChannel.appendLine(`Workspace analysis failed: ${error}`);
            throw error;
        }
    }

    /**
     * Analyze a single file
     */
    public async analyzeFile(filePath: string, options: AnalysisOptions = {}): Promise<FileAnalysis> {
        // Check cache first
        if (options.cacheResults && this.analysisCache.has(filePath)) {
            const cached = this.analysisCache.get(filePath)!;
            // Don't return cached text-analysis results for file analysis
            if (cached.isTextAnalysis === true) {
                // Delete stale text-analysis cache entry before re-analyzing
                this.analysisCache.delete(filePath);
                // Proceed to read from disk instead of using text-based cache
            } else {
                // Validate mtime if available
                if (cached.mtimeMs !== undefined) {
                    try {
                        const stats = await fs.promises.stat(filePath);
                        if (stats.mtimeMs === cached.mtimeMs) {
                            this.components.set(filePath, cached.component);
                            return cached;
                        }
                        // mtime mismatch, re-analyze file
                    } catch {
                        // File might not exist or be accessible, re-analyze
                    }
                } else {
                    // No mtime stored, return cached for backward compatibility
                    this.components.set(filePath, cached.component);
                    return cached;
                }
            }
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const stats = await fs.promises.stat(filePath);
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

            // Extract imports and exports
            const imports = this.extractImports(sourceFile);
            const exports = this.extractExports(sourceFile);

            // Collect re-export sources to include in dependencies
            const reExportSources = exports.filter(e => e.type === 're-export' && e.source).map(e => e.source!);

            // Calculate complexity
            const complexity = this.calculateComplexity(sourceFile);

            // Determine component type
            const componentType = this.inferComponentType(sourceFile, filePath);

            // Resolve dependencies from both imports and re-exports
            const importDependencies = this.resolveDependencies(imports, filePath);
            const reExportDependencies = this.resolveReExportDependencies(reExportSources, filePath);
            const allDependencies = Array.from(new Set([...importDependencies, ...reExportDependencies]));

            // Create component
            const component: CodeComponent = {
                name: path.basename(filePath, path.extname(filePath)),
                path: filePath,
                type: componentType,
                imports: imports.map(i => i.source),
                exports: exports.map(e => e.name),
                dependencies: allDependencies,
                complexity: complexity.cyclomatic,
                linesOfCode: complexity.loc,
                hasDocs: this.hasDocumentation(sourceFile),
                lastModified: stats.mtime,
                qualityScore: this.calculateQualityScore(complexity)
            };

            // Check for test coverage
            if (options.includeTests) {
                component.testCoverage = await this.estimateTestCoverage(filePath);
            }

            // Store component
            this.components.set(filePath, component);

            // Create analysis result
            const analysis: FileAnalysis = {
                path: filePath,
                component,
                imports,
                exports,
                complexity,
                errors: [],
                mtimeMs: stats.mtimeMs
            };

            // Cache if enabled
            if (options.cacheResults) {
                this.analysisCache.set(filePath, analysis);
            }

            return analysis;
        } catch (error) {
            const errorMsg = `Failed to analyze ${filePath}: ${error}`;
            this.outputChannel.appendLine(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Analyze code from text content (for unsaved buffers)
     */
    public async analyzeText(filePath: string, content: string, options: AnalysisOptions = {}): Promise<FileAnalysis> {
        // Use a distinct cache key for text analysis to avoid conflicts
        const textCacheKey = `text:${filePath}`;

        // Check cache first if using the text-specific cache key
        if (options.cacheResults && this.analysisCache.has(textCacheKey)) {
            const cached = this.analysisCache.get(textCacheKey)!;
            // Only return cached if it's for text analysis (not file-based)
            if (cached.isTextAnalysis) {
                this.components.set(filePath, cached.component);
                return cached;
            }
        }

        try {
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

            // Extract imports and exports
            const imports = this.extractImports(sourceFile);
            const exports = this.extractExports(sourceFile);

            // Collect re-export sources to include in dependencies
            const reExportSources = exports.filter(e => e.type === 're-export' && e.source).map(e => e.source!);

            // Calculate complexity
            const complexity = this.calculateComplexity(sourceFile);

            // Determine component type
            const componentType = this.inferComponentType(sourceFile, filePath);

            // Resolve dependencies from both imports and re-exports
            const importDependencies = this.resolveDependencies(imports, filePath);
            const reExportDependencies = this.resolveReExportDependencies(reExportSources, filePath);
            const allDependencies = Array.from(new Set([...importDependencies, ...reExportDependencies]));

            // Create component
            const component: CodeComponent = {
                name: path.basename(filePath, path.extname(filePath)),
                path: filePath,
                type: componentType,
                imports: imports.map(i => i.source),
                exports: exports.map(e => e.name),
                dependencies: allDependencies,
                complexity: complexity.cyclomatic,
                linesOfCode: complexity.loc,
                hasDocs: this.hasDocumentation(sourceFile),
                lastModified: new Date(),
                qualityScore: this.calculateQualityScore(complexity)
            };

            // Note: Skip test coverage for text analysis since file might not exist
            // Test coverage requires looking for test files on disk

            // Store component
            this.components.set(filePath, component);

            // Create analysis result
            const analysis: FileAnalysis = {
                path: filePath,
                component,
                imports,
                exports,
                complexity,
                errors: [],
                isTextAnalysis: true // Mark as text analysis
            };

            // Cache if enabled using text-specific cache key
            if (options.cacheResults) {
                this.analysisCache.set(textCacheKey, analysis);
            }

            return analysis;
        } catch (error) {
            const errorMsg = `Failed to analyze text for ${filePath}: ${error}`;
            this.outputChannel.appendLine(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Update analysis for a single file (incremental update)
     */
    public async updateFile(filePath: string, options: AnalysisOptions = {}): Promise<FileAnalysis> {
        this.outputChannel.appendLine(`Updating analysis for ${filePath}`);

        // Get old component data if it exists
        const oldComponent = this.components.get(filePath);
        const oldDependencies = oldComponent?.dependencies || [];

        // Remove old entries from dependency graphs
        this.removeFromDependencyGraphs(filePath, oldDependencies);

        // Clear cache for this file
        this.analysisCache.delete(filePath);

        // Re-analyze the file
        const analysis = await this.analyzeFile(filePath, options);

        // Update dependency graphs with new data
        this.updateDependencyGraphsForFile(filePath, analysis.component.dependencies);

        // Find and update files that depend on this file
        const dependents = this.reverseDependencyGraph.get(filePath);
        if (dependents && dependents.size > 0) {
            this.outputChannel.appendLine(
                `File ${filePath} has ${dependents.size} dependents that may need re-analysis`
            );

            // Optionally re-analyze dependent files if incremental update is enabled
            if (options.incrementalUpdate) {
                for (const dependent of Array.from(dependents)) {
                    // Only update dependency resolution, not full re-analysis
                    const dependentComponent = this.components.get(dependent);
                    if (dependentComponent) {
                        // Re-resolve dependencies in case exports changed
                        const dependentAnalysis = this.analysisCache.get(dependent);
                        if (dependentAnalysis) {
                            const newDependencies = this.resolveDependencies(dependentAnalysis.imports, dependent);
                            dependentComponent.dependencies = newDependencies;
                            this.components.set(dependent, dependentComponent);
                        }
                    }
                }
            }
        }

        this.outputChannel.appendLine(`Updated analysis for ${filePath}`);
        return analysis;
    }

    /**
     * Remove a file from the analysis (for file deletion)
     */
    public removeFile(filePath: string): void {
        this.outputChannel.appendLine(`Removing ${filePath} from analysis`);

        // Get component data before removal
        const component = this.components.get(filePath);
        if (!component) {
            this.outputChannel.appendLine(`File ${filePath} not found in analysis`);
            return;
        }

        // Remove from dependency graphs
        this.removeFromDependencyGraphs(filePath, component.dependencies);

        // Remove the file's own entries from graphs
        this.dependencyGraph.delete(filePath);
        this.reverseDependencyGraph.delete(filePath);

        // Remove from components and cache
        this.components.delete(filePath);
        this.analysisCache.delete(filePath);

        // Check for broken dependencies in other files
        const dependents = this.reverseDependencyGraph.get(filePath);
        if (dependents && dependents.size > 0) {
            this.outputChannel.appendLine(`⚠️ Warning: ${dependents.size} files depend on removed file ${filePath}`);

            // Update dependent files to remove the broken dependency
            for (const dependent of Array.from(dependents)) {
                const depComponent = this.components.get(dependent);
                if (depComponent) {
                    depComponent.dependencies = depComponent.dependencies.filter(dep => dep !== filePath);
                    this.components.set(dependent, depComponent);

                    // Add error to track broken dependency
                    if (!depComponent.errors) {
                        depComponent.errors = [];
                    }
                    depComponent.errors.push(`Missing dependency: ${filePath}`);
                }
            }
        }

        this.outputChannel.appendLine(`Removed ${filePath} from analysis`);
    }

    /**
     * Remove file from dependency graphs
     */
    private removeFromDependencyGraphs(filePath: string, dependencies: string[]): void {
        // Remove from forward dependency graph
        if (this.dependencyGraph.has(filePath)) {
            const deps = this.dependencyGraph.get(filePath)!;
            for (const dep of Array.from(deps)) {
                // Remove from reverse graph
                const reverseDeps = this.reverseDependencyGraph.get(dep);
                if (reverseDeps) {
                    reverseDeps.delete(filePath);
                    if (reverseDeps.size === 0) {
                        this.reverseDependencyGraph.delete(dep);
                    }
                }
            }
        }

        // Remove old dependencies
        for (const dep of dependencies) {
            const reverseDeps = this.reverseDependencyGraph.get(dep);
            if (reverseDeps) {
                reverseDeps.delete(filePath);
                if (reverseDeps.size === 0) {
                    this.reverseDependencyGraph.delete(dep);
                }
            }
        }
    }

    /**
     * Update dependency graphs for a file
     */
    private updateDependencyGraphsForFile(filePath: string, dependencies: string[]): void {
        // Update forward dependency graph
        if (!this.dependencyGraph.has(filePath)) {
            this.dependencyGraph.set(filePath, new Set());
        }

        const depSet = this.dependencyGraph.get(filePath)!;
        depSet.clear();

        for (const dep of dependencies) {
            depSet.add(dep);

            // Update reverse dependency graph
            if (!this.reverseDependencyGraph.has(dep)) {
                this.reverseDependencyGraph.set(dep, new Set());
            }
            this.reverseDependencyGraph.get(dep)!.add(filePath);
        }
    }

    /**
     * Extract imports from AST
     */
    private extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
        const imports: ImportInfo[] = [];

        const visit = (node: ts.Node) => {
            if (ts.isImportDeclaration(node)) {
                const moduleSpecifier = node.moduleSpecifier;
                if (ts.isStringLiteral(moduleSpecifier)) {
                    const importInfo: ImportInfo = {
                        source: moduleSpecifier.text,
                        specifiers: []
                    };

                    if (node.importClause) {
                        // Default import
                        if (node.importClause.name) {
                            importInfo.specifiers.push(node.importClause.name.text);
                            importInfo.isDefault = true;
                        }

                        // Named imports
                        if (node.importClause.namedBindings) {
                            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                                importInfo.specifiers.push(node.importClause.namedBindings.name.text);
                                importInfo.isNamespace = true;
                            } else if (ts.isNamedImports(node.importClause.namedBindings)) {
                                node.importClause.namedBindings.elements.forEach(element => {
                                    importInfo.specifiers.push(element.name.text);
                                });
                            }
                        }

                        // Check if it's a type-only import
                        if (node.importClause.isTypeOnly) {
                            importInfo.isType = true;
                        }
                    }

                    imports.push(importInfo);
                }
            } else if (ts.isCallExpression(node)) {
                // Dynamic imports - both require() and import()
                const expressionText = node.expression.getText();

                if (expressionText === 'require' && node.arguments.length > 0) {
                    const arg = node.arguments[0];
                    if (ts.isStringLiteral(arg)) {
                        imports.push({
                            source: arg.text,
                            specifiers: [],
                            isDynamic: true
                        });
                    }
                } else if (expressionText === 'import' && node.arguments.length > 0) {
                    // Dynamic import() expressions
                    const arg = node.arguments[0];
                    if (ts.isStringLiteral(arg)) {
                        imports.push({
                            source: arg.text,
                            specifiers: [],
                            isDynamic: true
                        });
                    }
                }
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return imports;
    }

    /**
     * Extract exports from AST
     */
    private extractExports(sourceFile: ts.SourceFile): ExportInfo[] {
        const exports: ExportInfo[] = [];

        const visit = (node: ts.Node) => {
            if (ts.isExportDeclaration(node)) {
                if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                    // Named exports
                    node.exportClause.elements.forEach(element => {
                        exports.push({
                            name: element.name.text,
                            type: 'named',
                            isType: node.isTypeOnly
                        });
                    });
                } else if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                    // Re-exports
                    exports.push({
                        name: '*',
                        type: 're-export',
                        source: node.moduleSpecifier.text
                    });
                }
            } else if (ts.isExportAssignment(node)) {
                // Default export
                exports.push({
                    name: 'default',
                    type: 'default'
                });
            } else {
                // Check for export modifiers on declarations
                const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
                if (modifiers) {
                    const hasExport = modifiers.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.ExportKeyword);
                    if (hasExport) {
                        let name = 'unknown';
                        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
                            name = node.name?.text || 'anonymous';
                        } else if (ts.isVariableStatement(node)) {
                            node.declarationList.declarations.forEach(decl => {
                                if (ts.isIdentifier(decl.name)) {
                                    name = decl.name.text;
                                }
                            });
                        }

                        exports.push({
                            name,
                            type: 'named'
                        });
                    }
                }
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return exports;
    }

    /**
     * Calculate cyclomatic complexity and other metrics
     */
    private calculateComplexity(sourceFile: ts.SourceFile): ComplexityMetrics {
        let cyclomatic = 1; // Base complexity
        let cognitive = 0;
        let loc = 0;
        let lloc = 0;
        let sloc = 0;
        const operators = new Set<string>();
        const operands = new Set<string>();

        const visit = (node: ts.Node, depth: number = 0) => {
            // Cyclomatic complexity - count decision points
            switch (node.kind) {
                case ts.SyntaxKind.IfStatement:
                    cyclomatic++;
                    cognitive += depth;
                    // Check for else clause via elseStatement property
                    const ifStmt = node as ts.IfStatement;
                    if (ifStmt.elseStatement) {
                        cyclomatic++;
                        cognitive += depth;
                    }
                    break;
                case ts.SyntaxKind.ConditionalExpression:
                    cyclomatic++;
                    cognitive += depth + 1;
                    break;
                case ts.SyntaxKind.WhileStatement:
                case ts.SyntaxKind.ForStatement:
                case ts.SyntaxKind.ForInStatement:
                case ts.SyntaxKind.ForOfStatement:
                case ts.SyntaxKind.DoStatement:
                    cyclomatic++;
                    cognitive += depth + 1;
                    break;
                case ts.SyntaxKind.CaseClause:
                    if ((node as ts.CaseClause).statements.length > 0) {
                        cyclomatic++;
                    }
                    break;
                case ts.SyntaxKind.DefaultClause:
                    cyclomatic++;
                    break;
                case ts.SyntaxKind.CatchClause:
                    cyclomatic++;
                    cognitive += depth;
                    break;
                case ts.SyntaxKind.BinaryExpression:
                    const binaryExpr = node as ts.BinaryExpression;
                    const operator = binaryExpr.operatorToken.getText();
                    if (operator === '&&' || operator === '||' || operator === '??') {
                        cyclomatic++;
                        cognitive += depth;
                    }
                    operators.add(operator);
                    break;
            }

            // Track identifiers for Halstead metrics
            if (ts.isIdentifier(node)) {
                operands.add(node.text);
            }

            // Count logical lines of code
            if (ts.isStatement(node)) {
                lloc++;
            }

            ts.forEachChild(node, child => visit(child, depth + 1));
        };

        visit(sourceFile);

        // Count lines from full source text (computed once)
        const text = sourceFile.getText();
        const lines = text.split('\n');
        loc = lines.length;
        sloc = lines.filter(l => l.trim().length > 0).length;

        // Calculate Halstead metrics
        const n1 = operators.size; // unique operators
        const n2 = operands.size; // unique operands
        const N1 = cyclomatic * 2; // total operators (approximation)
        const N2 = lloc; // total operands (approximation)

        const vocabulary = n1 + n2;
        const length = N1 + N2;
        const volume = length * (vocabulary > 0 ? Math.log2(vocabulary) : 0);
        const difficulty = (n1 / 2) * (n2 > 0 ? N2 / n2 : 0);
        const effort = volume * difficulty;

        // Calculate maintainability index with safe logarithm handling
        // Use Math.max(1, value) to avoid log(0) which would be -Infinity
        const safeVolume = Math.max(1, volume);
        const safeLoc = Math.max(1, loc);

        const maintainabilityIndex = 171 - 5.2 * Math.log(safeVolume) - 0.23 * cyclomatic - 16.2 * Math.log(safeLoc);

        // Clamp maintainability to [0, 100] range
        const maintainability = Math.max(0, Math.min(100, (maintainabilityIndex * 100) / 171));

        return {
            cyclomatic,
            cognitive,
            halstead: {
                volume,
                difficulty,
                effort
            },
            maintainability,
            loc,
            lloc,
            sloc
        };
    }

    /**
     * Infer component type from AST
     */
    private inferComponentType(sourceFile: ts.SourceFile, filePath: string): CodeComponent['type'] {
        const fileName = path.basename(filePath).toLowerCase();

        // Check file naming conventions
        if (fileName.includes('component')) return 'component';
        if (fileName.includes('service')) return 'service';
        if (fileName.includes('interface')) return 'interface';
        if (fileName.includes('type')) return 'type';

        // Check main export
        let hasClassExport = false;
        let hasFunctionExport = false;
        let hasInterfaceExport = false;
        let hasTypeExport = false;

        const visit = (node: ts.Node) => {
            if (ts.isClassDeclaration(node)) {
                hasClassExport = true;
            } else if (ts.isFunctionDeclaration(node)) {
                hasFunctionExport = true;
            } else if (ts.isInterfaceDeclaration(node)) {
                hasInterfaceExport = true;
            } else if (ts.isTypeAliasDeclaration(node)) {
                hasTypeExport = true;
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);

        if (hasClassExport) return 'class';
        if (hasInterfaceExport) return 'interface';
        if (hasTypeExport) return 'type';
        if (hasFunctionExport) return 'function';

        return 'module';
    }

    /**
     * Check if the file has documentation
     */
    private hasDocumentation(sourceFile: ts.SourceFile): boolean {
        let hasJsDoc = false;

        const visit = (node: ts.Node) => {
            if (ts.getJSDocTags(node).length > 0) {
                hasJsDoc = true;
            }
            if (!hasJsDoc) {
                ts.forEachChild(node, visit);
            }
        };

        visit(sourceFile);
        return hasJsDoc;
    }

    /**
     * Calculate quality score based on complexity metrics
     */
    private calculateQualityScore(complexity: ComplexityMetrics): number {
        // Scoring weights
        const weights = {
            cyclomatic: 0.3,
            cognitive: 0.2,
            maintainability: 0.3,
            size: 0.2
        };

        // Score components (0-100) with safe clamping
        const cyclomaticScore = Math.max(0, Math.min(100, 100 - complexity.cyclomatic * 5));
        const cognitiveScore = Math.max(0, Math.min(100, 100 - complexity.cognitive * 2));
        // Ensure maintainability is a valid number, default to 50 if NaN/undefined
        const maintainabilityScore = isFinite(complexity.maintainability)
            ? Math.max(0, Math.min(100, complexity.maintainability))
            : 50;
        const sizeScore = Math.max(0, Math.min(100, 100 - complexity.loc / 10));

        const score =
            cyclomaticScore * weights.cyclomatic +
            cognitiveScore * weights.cognitive +
            maintainabilityScore * weights.maintainability +
            sizeScore * weights.size;

        // Ensure final score is valid and within bounds
        const finalScore = Math.round(Math.max(0, Math.min(100, score)));
        return isFinite(finalScore) ? finalScore : 50; // Default to 50 if calculation fails
    }

    /**
     * Resolve dependencies from imports
     */
    private resolveDependencies(imports: ImportInfo[], fromFile: string): string[] {
        const dependencies: string[] = [];

        for (const imp of imports) {
            // Skip type-only imports in dependency graph
            if (imp.isType) {
                continue;
            }

            // Try to resolve the import (handles both relative and bare imports)
            const resolvedPath = this.resolveDependencyPath(imp.source, fromFile);
            if (resolvedPath) {
                // Path is already normalized by resolveDependencyPath
                dependencies.push(resolvedPath);
            }
        }

        return dependencies;
    }

    /**
     * Resolve re-export dependencies
     */
    private resolveReExportDependencies(reExportSources: string[], fromFile: string): string[] {
        const dependencies: string[] = [];

        for (const source of reExportSources) {
            // Try to resolve the dependency (handles both relative and bare imports)
            const resolvedPath = this.resolveDependencyPath(source, fromFile);
            if (resolvedPath) {
                // Path is already normalized by resolveDependencyPath
                dependencies.push(resolvedPath);
            }
        }

        return dependencies;
    }

    /**
     * Load TypeScript configuration for path resolution
     */
    private loadTsConfig(searchPath: string): ts.ParsedCommandLine | null {
        // Check cache first
        const cacheKey = path.dirname(searchPath);
        if (this.tsConfigCache.has(cacheKey)) {
            return this.tsConfigCache.get(cacheKey)!;
        }

        try {
            // Find tsconfig.json
            const configPath = ts.findConfigFile(searchPath, ts.sys.fileExists, 'tsconfig.json');
            if (!configPath) {
                this.tsConfigCache.set(cacheKey, null);
                return null;
            }

            // Read and parse config
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
            if (configFile.error) {
                this.tsConfigCache.set(cacheKey, null);
                return null;
            }

            const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

            this.tsConfigCache.set(cacheKey, parsedConfig);
            return parsedConfig;
        } catch (error) {
            this.outputChannel.appendLine(`Failed to load tsconfig: ${error}`);
            this.tsConfigCache.set(cacheKey, null);
            return null;
        }
    }

    /**
     * Resolve package.json exports field
     */
    private resolvePackageExports(exports: any, target: string, basePath: string): string | null {
        if (typeof exports === 'string') {
            const resolved = path.resolve(basePath, exports);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        } else if (typeof exports === 'object' && exports !== null) {
            // Handle conditional exports
            if (exports[target]) {
                return this.resolvePackageExports(exports[target], target, basePath);
            }

            // Handle default export
            if (exports.default) {
                return this.resolvePackageExports(exports.default, target, basePath);
            }

            // Handle nested conditions (import/require/node)
            if (exports.import) {
                return this.resolvePackageExports(exports.import, target, basePath);
            }
            if (exports.require) {
                return this.resolvePackageExports(exports.require, target, basePath);
            }
            if (exports.node) {
                return this.resolvePackageExports(exports.node, target, basePath);
            }
        }
        return null;
    }

    /**
     * Resolve TypeScript path alias
     */
    private resolvePathAlias(specifier: string, fromFile: string): string | null {
        const tsConfig = this.loadTsConfig(fromFile);
        if (!tsConfig || !tsConfig.options.paths) {
            return null;
        }

        const { paths, baseUrl } = tsConfig.options;
        const basePath = baseUrl ? path.resolve(path.dirname(fromFile), baseUrl) : path.dirname(fromFile);

        // Try to match against path patterns
        for (const [pattern, replacements] of Object.entries(paths)) {
            // Convert pattern to regex (e.g., "@app/*" -> "^@app/(.*)$")
            const regex = new RegExp('^' + pattern.replace('*', '(.*)') + '$');
            const match = specifier.match(regex);

            if (match) {
                // Try each replacement path
                for (const replacement of replacements as string[]) {
                    const resolvedPath = replacement.replace('*', match[1] || '');
                    const absolutePath = path.resolve(basePath, resolvedPath);

                    // Use the helper method to resolve the path
                    const resolved = this.resolveLocalPath(absolutePath);
                    if (resolved) {
                        return resolved;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Resolve dependency path
     */
    private resolveDependencyPath(specifier: string, fromFile: string): string | null {
        // Handle relative paths
        if (specifier.startsWith('.')) {
            const dir = path.dirname(fromFile);
            const resolvedPath = path.resolve(dir, specifier);
            const resolved = this.resolveLocalPath(resolvedPath);
            return resolved ? this.normalizePath(resolved) : null;
        }

        // Handle non-relative (bare) imports

        // First try TypeScript path alias resolution
        const aliasResolved = this.resolvePathAlias(specifier, fromFile);
        if (aliasResolved) {
            return this.normalizePath(aliasResolved);
        }

        // Try to resolve as workspace-local package (monorepo scenario)
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const workspaceRoot = folder.uri.fsPath;
                const localPackagePath = path.join(workspaceRoot, specifier);

                // Check if this bare import exists within the workspace
                const resolved = this.resolveLocalPath(localPackagePath);
                if (resolved) {
                    return this.normalizePath(resolved);
                }

                // Also check common monorepo patterns like packages/
                const commonPaths = ['packages', 'apps', 'libs'];
                for (const commonPath of commonPaths) {
                    const monorepoPath = path.join(workspaceRoot, commonPath, specifier);
                    const resolvedMonorepo = this.resolveLocalPath(monorepoPath);
                    if (resolvedMonorepo) {
                        return this.normalizePath(resolvedMonorepo);
                    }
                }
            }
        }

        // External dependency
        return null;
    }

    /**
     * Resolve a local path (file or directory)
     */
    private resolveLocalPath(resolvedPath: string): string | null {
        // Check if the path exists and determine if it's a file or directory
        try {
            const stats = fs.statSync(resolvedPath);

            if (stats.isFile()) {
                // It's already a file, return as-is
                return resolvedPath;
            } else if (stats.isDirectory()) {
                // It's a directory, try to resolve via package.json or index files

                // First check for package.json with exports or main field
                const packageJsonPath = path.join(resolvedPath, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    try {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

                        // Check exports field (modern)
                        if (packageJson.exports) {
                            const exportPath = this.resolvePackageExports(packageJson.exports, '.', resolvedPath);
                            if (exportPath) return exportPath;
                        }

                        // Check main field (legacy)
                        if (packageJson.main) {
                            const mainPath = path.resolve(resolvedPath, packageJson.main);
                            if (fs.existsSync(mainPath)) {
                                return mainPath;
                            }
                        }
                    } catch (e) {
                        // Failed to parse package.json, continue with index resolution
                    }
                }

                // Try to resolve index files using the expanded list
                for (const indexExt of this.INDEX_EXTENSIONS) {
                    const indexPath = resolvedPath + indexExt;
                    if (fs.existsSync(indexPath)) {
                        return indexPath;
                    }
                }

                // No index file found in directory
                return null;
            }
        } catch (error) {
            // Path doesn't exist as-is, try adding extensions
        }

        // Try adding extensions to the path (including extensionless imports)
        for (const ext of this.FILE_EXTENSIONS) {
            const pathWithExt = resolvedPath + ext;
            if (fs.existsSync(pathWithExt)) {
                const stats = fs.statSync(pathWithExt);
                if (stats.isFile()) {
                    return pathWithExt;
                }
            }
        }

        // Try resolving as directory with index files
        for (const indexExt of this.INDEX_EXTENSIONS) {
            const indexPath = resolvedPath + indexExt;
            if (fs.existsSync(indexPath)) {
                const stats = fs.statSync(indexPath);
                if (stats.isFile()) {
                    return indexPath;
                }
            }
        }

        return null;
    }

    /**
     * Build dependency graph
     */
    private buildDependencyGraph(): void {
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();

        // Initialize all nodes in both graphs with normalized paths
        for (const filePath of Array.from(this.components.keys())) {
            const normalizedPath = this.normalizePath(filePath);
            if (!this.dependencyGraph.has(normalizedPath)) {
                this.dependencyGraph.set(normalizedPath, new Set());
            }
            if (!this.reverseDependencyGraph.has(normalizedPath)) {
                this.reverseDependencyGraph.set(normalizedPath, new Set());
            }
        }

        // Add edges, skipping self-edges (using normalized paths)
        for (const [filePath, component] of Array.from(this.components)) {
            const normalizedFilePath = this.normalizePath(filePath);

            for (const dep of component.dependencies) {
                const normalizedDep = this.normalizePath(dep);

                // Skip self-edges
                if (normalizedDep === normalizedFilePath) {
                    continue;
                }

                // Add to forward graph
                this.dependencyGraph.get(normalizedFilePath)!.add(normalizedDep);

                // Build reverse graph
                if (!this.reverseDependencyGraph.has(normalizedDep)) {
                    this.reverseDependencyGraph.set(normalizedDep, new Set());
                }
                this.reverseDependencyGraph.get(normalizedDep)!.add(normalizedFilePath);
            }
        }
    }

    /**
     * Estimate test coverage for a file
     */
    private async estimateTestCoverage(filePath: string): Promise<number> {
        // Look for corresponding test file
        const testPatterns = [
            filePath.replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
            filePath.replace(/\.(ts|js|tsx|jsx)$/, '.spec.$1'),
            filePath.replace(/src/, '__tests__').replace(/\.(ts|js|tsx|jsx)$/, '.test.$1')
        ];

        for (const pattern of testPatterns) {
            if (fs.existsSync(pattern)) {
                return 80; // Assume decent coverage if test file exists
            }
        }

        return 0; // No test file found
    }

    /**
     * Calculate workspace-level metrics
     */
    private calculateWorkspaceMetrics(): QualityMetrics {
        let totalComplexity = 0;
        let totalLines = 0;
        let componentsWithDocs = 0;
        let componentsWithTests = 0;

        for (const component of Array.from(this.components.values())) {
            totalComplexity += component.complexity;
            totalLines += component.linesOfCode;
            if (component.hasDocs) componentsWithDocs++;
            if ((component.testCoverage || 0) > 0) componentsWithTests++;
        }

        const componentCount = this.components.size || 1;
        const circularDeps = this.findCircularDependencies();

        return {
            averageComplexity: totalComplexity / componentCount,
            testCoverage: (componentsWithTests / componentCount) * 100,
            documentationCoverage: (componentsWithDocs / componentCount) * 100,
            duplicateCodePercentage: 0, // TODO: Implement duplicate detection
            technicalDebt: this.estimateTechnicalDebt(),
            linterErrors: 0, // TODO: Integrate with ESLint
            circularDependencies: circularDeps.length,
            unhandledErrors: 0 // TODO: Detect unhandled errors
        };
    }

    /**
     * Estimate technical debt based on complexity and quality
     */
    private estimateTechnicalDebt(): number {
        let debt = 0;

        for (const component of Array.from(this.components.values())) {
            // High complexity adds debt
            if (component.complexity > 10) {
                debt += (component.complexity - 10) * 0.5;
            }

            // Large files add debt
            if (component.linesOfCode > 300) {
                debt += (component.linesOfCode - 300) / 100;
            }

            // Missing docs add debt
            if (!component.hasDocs) {
                debt += 1;
            }

            // Missing tests add debt
            if ((component.testCoverage || 0) < 50) {
                debt += 2;
            }
        }

        return Math.round(debt);
    }

    /**
     * Normalize path for consistent comparison
     */
    private normalizePath(filePath: string): string {
        return path.resolve(filePath);
    }

    /**
     * Find circular dependencies using DFS
     */
    public findCircularDependencies(): CircularDependency[] {
        // Early return if graphs are empty
        if (this.dependencyGraph.size === 0 || this.components.size === 0) {
            return [];
        }

        const cycles: CircularDependency[] = [];
        const normalizedCycles = new Set<string>(); // Track normalized cycle representations
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const path: string[] = [];

        // Normalize cycle representation for deduplication
        const normalizeCycle = (cycle: string[]): string => {
            // Remove the duplicate last element (same as first)
            const uniqueCycle = cycle.slice(0, -1);
            // Find the lexicographically smallest element as starting point
            let minIndex = 0;
            let minValue = uniqueCycle[0];
            for (let i = 1; i < uniqueCycle.length; i++) {
                if (uniqueCycle[i] < minValue) {
                    minValue = uniqueCycle[i];
                    minIndex = i;
                }
            }
            // Rotate cycle to start with smallest element
            const normalized = [...uniqueCycle.slice(minIndex), ...uniqueCycle.slice(0, minIndex)];
            return normalized.join('->');
        };

        const dfs = (node: string): boolean => {
            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const neighbors = this.dependencyGraph.get(node) || new Set();
            for (const neighbor of Array.from(neighbors)) {
                if (!visited.has(neighbor)) {
                    if (dfs(neighbor)) {
                        return true;
                    }
                } else if (recursionStack.has(neighbor)) {
                    // Found a cycle
                    const cycleStart = path.indexOf(neighbor);
                    const cycle = path.slice(cycleStart);
                    cycle.push(neighbor); // Complete the cycle

                    // Normalize and check for duplicates
                    const normalizedCycle = normalizeCycle(cycle);
                    if (!normalizedCycles.has(normalizedCycle)) {
                        normalizedCycles.add(normalizedCycle);
                        cycles.push({
                            cycle,
                            severity: this.assessCycleSeverity(cycle)
                        });
                    }
                }
            }

            path.pop();
            recursionStack.delete(node);
            return false;
        };

        for (const node of Array.from(this.dependencyGraph.keys())) {
            if (!visited.has(node)) {
                dfs(node);
            }
        }

        return cycles;
    }

    /**
     * Assess the severity of a circular dependency
     */
    private assessCycleSeverity(cycle: string[]): 'low' | 'medium' | 'high' {
        // Shorter cycles are more severe
        if (cycle.length <= 2) return 'high';
        if (cycle.length <= 4) return 'medium';
        return 'low';
    }

    /**
     * Get components map (returns a clone to avoid external mutation)
     */
    public getComponents(): Map<string, CodeComponent> {
        return new Map(this.components);
    }

    /**
     * Get dependency graph (returns a deep clone to prevent external mutation)
     */
    public getDependencyGraph(): DependencyGraph {
        const clone = new Map<string, Set<string>>();
        for (const [key, value] of Array.from(this.dependencyGraph)) {
            clone.set(key, new Set(value));
        }
        return clone;
    }

    /**
     * Get reverse dependency graph (returns a deep clone to prevent external mutation)
     */
    public getReverseDependencyGraph(): DependencyGraph {
        const clone = new Map<string, Set<string>>();
        for (const [key, value] of Array.from(this.reverseDependencyGraph)) {
            clone.set(key, new Set(value));
        }
        return clone;
    }

    /**
     * Get complexity metrics for all components
     */
    public getComplexityMetrics(): Map<string, ComplexityMetrics> {
        const metrics = new Map<string, ComplexityMetrics>();

        for (const [path, analysis] of Array.from(this.analysisCache)) {
            metrics.set(path, analysis.complexity);
        }

        return metrics;
    }

    /**
     * Get aggregated complexity metrics for the entire codebase
     */
    public getAggregatedComplexity(): AggregatedComplexityMetrics {
        const cyclomaticValues: number[] = [];
        const maintainabilityValues: number[] = [];
        const locValues: number[] = [];

        let totalCyclomatic = 0;
        let totalMaintainability = 0;
        let totalLines = 0;
        let filesWithMetrics = 0;

        // Complexity distribution counters
        let lowComplexity = 0;
        let mediumComplexity = 0;
        let highComplexity = 0;
        let veryHighComplexity = 0;

        // Maintainability distribution counters
        let excellentMaintainability = 0;
        let goodMaintainability = 0;
        let fairMaintainability = 0;
        let poorMaintainability = 0;

        // Collect metrics from cache for more accurate data
        for (const [path, analysis] of Array.from(this.analysisCache)) {
            const complexity = analysis.complexity;

            // Cyclomatic complexity
            cyclomaticValues.push(complexity.cyclomatic);
            totalCyclomatic += complexity.cyclomatic;

            // Categorize cyclomatic complexity
            if (complexity.cyclomatic <= 5) {
                lowComplexity++;
            } else if (complexity.cyclomatic <= 10) {
                mediumComplexity++;
            } else if (complexity.cyclomatic <= 20) {
                highComplexity++;
            } else {
                veryHighComplexity++;
            }

            // Maintainability (ensure valid value)
            const maintainability = isFinite(complexity.maintainability) ? complexity.maintainability : 50;
            maintainabilityValues.push(maintainability);
            totalMaintainability += maintainability;

            // Categorize maintainability
            if (maintainability > 80) {
                excellentMaintainability++;
            } else if (maintainability >= 60) {
                goodMaintainability++;
            } else if (maintainability >= 40) {
                fairMaintainability++;
            } else {
                poorMaintainability++;
            }

            // Lines of code
            locValues.push(complexity.loc);
            totalLines += complexity.loc;

            filesWithMetrics++;
        }

        // If no cached analysis, fall back to component data
        if (filesWithMetrics === 0) {
            for (const [path, component] of Array.from(this.components)) {
                cyclomaticValues.push(component.complexity);
                totalCyclomatic += component.complexity;

                // Categorize cyclomatic complexity
                if (component.complexity <= 5) {
                    lowComplexity++;
                } else if (component.complexity <= 10) {
                    mediumComplexity++;
                } else if (component.complexity <= 20) {
                    highComplexity++;
                } else {
                    veryHighComplexity++;
                }

                // For components, we don't have maintainability, so estimate
                const estimatedMaintainability = component.qualityScore || 50;
                maintainabilityValues.push(estimatedMaintainability);
                totalMaintainability += estimatedMaintainability;

                // Categorize maintainability
                if (estimatedMaintainability > 80) {
                    excellentMaintainability++;
                } else if (estimatedMaintainability >= 60) {
                    goodMaintainability++;
                } else if (estimatedMaintainability >= 40) {
                    fairMaintainability++;
                } else {
                    poorMaintainability++;
                }

                locValues.push(component.linesOfCode);
                totalLines += component.linesOfCode;

                filesWithMetrics++;
            }
        }

        // Calculate averages
        const averageCyclomatic = filesWithMetrics > 0 ? totalCyclomatic / filesWithMetrics : 0;
        const averageMaintainability = filesWithMetrics > 0 ? totalMaintainability / filesWithMetrics : 0;
        const averageLines = filesWithMetrics > 0 ? totalLines / filesWithMetrics : 0;

        // Calculate medians
        const sortedCyclomatic = [...cyclomaticValues].sort((a, b) => a - b);
        const sortedMaintainability = [...maintainabilityValues].sort((a, b) => a - b);

        const medianCyclomatic = this.calculateMedian(sortedCyclomatic);
        const medianMaintainability = this.calculateMedian(sortedMaintainability);

        // Find min and max cyclomatic
        const maxCyclomatic = cyclomaticValues.length > 0 ? Math.max(...cyclomaticValues) : 0;
        const minCyclomatic = cyclomaticValues.length > 0 ? Math.min(...cyclomaticValues) : 0;

        // Calculate standard deviation for cyclomatic complexity
        const standardDeviation = this.calculateStandardDeviation(cyclomaticValues, averageCyclomatic);

        return {
            averageCyclomatic: Math.round(averageCyclomatic * 100) / 100,
            averageMaintainability: Math.round(averageMaintainability * 100) / 100,
            averageLines: Math.round(averageLines),
            totalCyclomatic,
            totalLines,
            medianCyclomatic,
            medianMaintainability: Math.round(medianMaintainability * 100) / 100,
            maxCyclomatic,
            minCyclomatic,
            standardDeviation: Math.round(standardDeviation * 100) / 100,
            filesAnalyzed: filesWithMetrics,
            complexityDistribution: {
                low: lowComplexity,
                medium: mediumComplexity,
                high: highComplexity,
                veryHigh: veryHighComplexity
            },
            maintainabilityDistribution: {
                excellent: excellentMaintainability,
                good: goodMaintainability,
                fair: fairMaintainability,
                poor: poorMaintainability
            }
        };
    }

    /**
     * Calculate median value from a sorted array
     */
    private calculateMedian(sortedValues: number[]): number {
        if (sortedValues.length === 0) return 0;

        const mid = Math.floor(sortedValues.length / 2);

        if (sortedValues.length % 2 === 0) {
            return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
        } else {
            return sortedValues[mid];
        }
    }

    /**
     * Calculate standard deviation
     */
    private calculateStandardDeviation(values: number[], mean: number): number {
        if (values.length === 0) return 0;

        const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDifferences.reduce((sum, value) => sum + value, 0) / values.length;

        return Math.sqrt(avgSquaredDiff);
    }

    /**
     * Find untested components
     */
    public findUntestedComponents(): string[] {
        const untested: string[] = [];

        for (const [path, component] of Array.from(this.components)) {
            if (!component.testCoverage || component.testCoverage === 0) {
                untested.push(path);
            }
        }

        return untested;
    }

    /**
     * Find components with high complexity
     */
    public findComplexComponents(threshold: number = 10): string[] {
        const complex: string[] = [];

        for (const [path, component] of Array.from(this.components)) {
            if (component.complexity > threshold) {
                complex.push(path);
            }
        }

        return complex.sort((a, b) => {
            return this.components.get(b)!.complexity - this.components.get(a)!.complexity;
        });
    }

    /**
     * Get component by path
     */
    public getComponent(path: string): CodeComponent | undefined {
        return this.components.get(path);
    }

    /**
     * Clear all analysis data
     */
    public clear(): void {
        this.components.clear();
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();
        this.analysisCache.clear();
        this.tsConfigCache.clear();
        this.pathAliasResolver.clear();
    }

    /**
     * Setup file watchers for incremental analysis updates
     * Call this to enable automatic re-analysis on file changes
     */
    public setupWatchers(context: vscode.ExtensionContext): void {
        // Watch for file changes including module variants
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}');

        // Handle file changes
        watcher.onDidChange(async uri => {
            this.outputChannel.appendLine(`File changed: ${uri.fsPath}`);
            await this.updateFile(uri.fsPath, { incrementalUpdate: true });
        });

        // Handle file creation
        watcher.onDidCreate(async uri => {
            this.outputChannel.appendLine(`File created: ${uri.fsPath}`);
            await this.analyzeFile(uri.fsPath);
            this.updateDependencyGraphsForFile(uri.fsPath, this.components.get(uri.fsPath)?.dependencies || []);
        });

        // Handle file deletion
        watcher.onDidDelete(uri => {
            this.outputChannel.appendLine(`File deleted: ${uri.fsPath}`);
            this.removeFile(uri.fsPath);
        });

        // Register the watcher for disposal
        context.subscriptions.push(watcher);

        this.outputChannel.appendLine('File watcher registered for incremental updates');
    }

    /**
     * Get files that depend on a given file
     */
    public getDependents(filePath: string): Set<string> | undefined {
        return this.reverseDependencyGraph.get(filePath);
    }

    /**
     * Check if analysis is cached for a file
     */
    public isCached(filePath: string): boolean {
        return this.analysisCache.has(filePath);
    }

    /**
     * Get cached analysis for a file
     */
    public getCachedAnalysis(filePath: string): FileAnalysis | undefined {
        return this.analysisCache.get(filePath);
    }
}
