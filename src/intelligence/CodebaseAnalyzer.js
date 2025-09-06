"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodebaseAnalyzer = void 0;
const vscode = __importStar(require("vscode"));
const ts = __importStar(require("typescript"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class CodebaseAnalyzer {
    constructor(outputChannel) {
        this.components = new Map();
        this.dependencyGraph = new Map();
        this.reverseDependencyGraph = new Map();
        this.analysisCache = new Map();
        this.tsConfigCache = new Map();
        this.pathAliasResolver = new Map();
        this.FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];
        this.INDEX_EXTENSIONS = [
            '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
            '/index.mjs', '/index.cjs', '/index.mts', '/index.cts'
        ];
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
    async analyzeWorkspace(options = {}) {
        this.outputChannel.appendLine('Starting workspace analysis...');
        this.components.clear();
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();
        if (!options.cacheResults) {
            this.analysisCache.clear();
        }
        try {
            const pattern = '**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}';
            const config = vscode.workspace.getConfiguration('files');
            const vsCodeExclusions = config.get('exclude', {});
            const defaultExclusions = [];
            if (!options.includeNodeModules) {
                defaultExclusions.push('**/node_modules/**');
            }
            for (const [pattern, enabled] of Object.entries(vsCodeExclusions)) {
                if (enabled) {
                    defaultExclusions.push(pattern);
                }
            }
            const additionalExclusions = options.excludePatterns || [];
            const allExclusions = [...defaultExclusions, ...additionalExclusions];
            const exclude = allExclusions.length > 0
                ? `{${allExclusions.join(',')}}`
                : undefined;
            const files = await vscode.workspace.findFiles(pattern, exclude);
            this.outputChannel.appendLine(`Found ${files.length} files to analyze`);
            for (const file of files) {
                try {
                    await this.analyzeFile(file.fsPath, options);
                }
                catch (error) {
                    this.outputChannel.appendLine(`Error analyzing ${file.fsPath}: ${error}`);
                }
            }
            this.buildDependencyGraph();
            const metrics = this.calculateWorkspaceMetrics();
            const result = {
                components: new Map(this.components),
                dependencies: this.dependencyGraph,
                metrics,
                timestamp: new Date()
            };
            this.outputChannel.appendLine(`Analysis complete. Analyzed ${this.components.size} components`);
            return result;
        }
        catch (error) {
            this.outputChannel.appendLine(`Workspace analysis failed: ${error}`);
            throw error;
        }
    }
    async analyzeFile(filePath, options = {}) {
        if (options.cacheResults && this.analysisCache.has(filePath)) {
            const cached = this.analysisCache.get(filePath);
            if (cached.isTextAnalysis === true) {
                this.analysisCache.delete(filePath);
            }
            else {
                if (cached.mtimeMs !== undefined) {
                    try {
                        const stats = await fs.promises.stat(filePath);
                        if (stats.mtimeMs === cached.mtimeMs) {
                            this.components.set(filePath, cached.component);
                            return cached;
                        }
                    }
                    catch {
                    }
                }
                else {
                    this.components.set(filePath, cached.component);
                    return cached;
                }
            }
        }
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const stats = await fs.promises.stat(filePath);
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
            const imports = this.extractImports(sourceFile);
            const exports = this.extractExports(sourceFile);
            const reExportSources = exports
                .filter(e => e.type === 're-export' && e.source)
                .map(e => e.source);
            const complexity = this.calculateComplexity(sourceFile);
            const componentType = this.inferComponentType(sourceFile, filePath);
            const importDependencies = this.resolveDependencies(imports, filePath);
            const reExportDependencies = this.resolveReExportDependencies(reExportSources, filePath);
            const allDependencies = Array.from(new Set([...importDependencies, ...reExportDependencies]));
            const component = {
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
            if (options.includeTests) {
                component.testCoverage = await this.estimateTestCoverage(filePath);
            }
            this.components.set(filePath, component);
            const analysis = {
                path: filePath,
                component,
                imports,
                exports,
                complexity,
                errors: [],
                mtimeMs: stats.mtimeMs
            };
            if (options.cacheResults) {
                this.analysisCache.set(filePath, analysis);
            }
            return analysis;
        }
        catch (error) {
            const errorMsg = `Failed to analyze ${filePath}: ${error}`;
            this.outputChannel.appendLine(errorMsg);
            throw new Error(errorMsg);
        }
    }
    async analyzeText(filePath, content, options = {}) {
        const textCacheKey = `text:${filePath}`;
        if (options.cacheResults && this.analysisCache.has(textCacheKey)) {
            const cached = this.analysisCache.get(textCacheKey);
            if (cached.isTextAnalysis) {
                this.components.set(filePath, cached.component);
                return cached;
            }
        }
        try {
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
            const imports = this.extractImports(sourceFile);
            const exports = this.extractExports(sourceFile);
            const reExportSources = exports
                .filter(e => e.type === 're-export' && e.source)
                .map(e => e.source);
            const complexity = this.calculateComplexity(sourceFile);
            const componentType = this.inferComponentType(sourceFile, filePath);
            const importDependencies = this.resolveDependencies(imports, filePath);
            const reExportDependencies = this.resolveReExportDependencies(reExportSources, filePath);
            const allDependencies = Array.from(new Set([...importDependencies, ...reExportDependencies]));
            const component = {
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
            this.components.set(filePath, component);
            const analysis = {
                path: filePath,
                component,
                imports,
                exports,
                complexity,
                errors: [],
                isTextAnalysis: true
            };
            if (options.cacheResults) {
                this.analysisCache.set(textCacheKey, analysis);
            }
            return analysis;
        }
        catch (error) {
            const errorMsg = `Failed to analyze text for ${filePath}: ${error}`;
            this.outputChannel.appendLine(errorMsg);
            throw new Error(errorMsg);
        }
    }
    async updateFile(filePath, options = {}) {
        this.outputChannel.appendLine(`Updating analysis for ${filePath}`);
        const oldComponent = this.components.get(filePath);
        const oldDependencies = oldComponent?.dependencies || [];
        this.removeFromDependencyGraphs(filePath, oldDependencies);
        this.analysisCache.delete(filePath);
        const analysis = await this.analyzeFile(filePath, options);
        this.updateDependencyGraphsForFile(filePath, analysis.component.dependencies);
        const dependents = this.reverseDependencyGraph.get(filePath);
        if (dependents && dependents.size > 0) {
            this.outputChannel.appendLine(`File ${filePath} has ${dependents.size} dependents that may need re-analysis`);
            if (options.incrementalUpdate) {
                for (const dependent of Array.from(dependents)) {
                    const dependentComponent = this.components.get(dependent);
                    if (dependentComponent) {
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
    removeFile(filePath) {
        this.outputChannel.appendLine(`Removing ${filePath} from analysis`);
        const component = this.components.get(filePath);
        if (!component) {
            this.outputChannel.appendLine(`File ${filePath} not found in analysis`);
            return;
        }
        this.removeFromDependencyGraphs(filePath, component.dependencies);
        this.dependencyGraph.delete(filePath);
        this.reverseDependencyGraph.delete(filePath);
        this.components.delete(filePath);
        this.analysisCache.delete(filePath);
        const dependents = this.reverseDependencyGraph.get(filePath);
        if (dependents && dependents.size > 0) {
            this.outputChannel.appendLine(`⚠️ Warning: ${dependents.size} files depend on removed file ${filePath}`);
            for (const dependent of Array.from(dependents)) {
                const depComponent = this.components.get(dependent);
                if (depComponent) {
                    depComponent.dependencies = depComponent.dependencies.filter(dep => dep !== filePath);
                    this.components.set(dependent, depComponent);
                    if (!depComponent.errors) {
                        depComponent.errors = [];
                    }
                    depComponent.errors.push(`Missing dependency: ${filePath}`);
                }
            }
        }
        this.outputChannel.appendLine(`Removed ${filePath} from analysis`);
    }
    removeFromDependencyGraphs(filePath, dependencies) {
        if (this.dependencyGraph.has(filePath)) {
            const deps = this.dependencyGraph.get(filePath);
            for (const dep of Array.from(deps)) {
                const reverseDeps = this.reverseDependencyGraph.get(dep);
                if (reverseDeps) {
                    reverseDeps.delete(filePath);
                    if (reverseDeps.size === 0) {
                        this.reverseDependencyGraph.delete(dep);
                    }
                }
            }
        }
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
    updateDependencyGraphsForFile(filePath, dependencies) {
        if (!this.dependencyGraph.has(filePath)) {
            this.dependencyGraph.set(filePath, new Set());
        }
        const depSet = this.dependencyGraph.get(filePath);
        depSet.clear();
        for (const dep of dependencies) {
            depSet.add(dep);
            if (!this.reverseDependencyGraph.has(dep)) {
                this.reverseDependencyGraph.set(dep, new Set());
            }
            this.reverseDependencyGraph.get(dep).add(filePath);
        }
    }
    extractImports(sourceFile) {
        const imports = [];
        const visit = (node) => {
            if (ts.isImportDeclaration(node)) {
                const moduleSpecifier = node.moduleSpecifier;
                if (ts.isStringLiteral(moduleSpecifier)) {
                    const importInfo = {
                        source: moduleSpecifier.text,
                        specifiers: []
                    };
                    if (node.importClause) {
                        if (node.importClause.name) {
                            importInfo.specifiers.push(node.importClause.name.text);
                            importInfo.isDefault = true;
                        }
                        if (node.importClause.namedBindings) {
                            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                                importInfo.specifiers.push(node.importClause.namedBindings.name.text);
                                importInfo.isNamespace = true;
                            }
                            else if (ts.isNamedImports(node.importClause.namedBindings)) {
                                node.importClause.namedBindings.elements.forEach(element => {
                                    importInfo.specifiers.push(element.name.text);
                                });
                            }
                        }
                        if (node.importClause.isTypeOnly) {
                            importInfo.isType = true;
                        }
                    }
                    imports.push(importInfo);
                }
            }
            else if (ts.isCallExpression(node)) {
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
                }
                else if (expressionText === 'import' && node.arguments.length > 0) {
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
    extractExports(sourceFile) {
        const exports = [];
        const visit = (node) => {
            if (ts.isExportDeclaration(node)) {
                if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                    node.exportClause.elements.forEach(element => {
                        exports.push({
                            name: element.name.text,
                            type: 'named',
                            isType: node.isTypeOnly
                        });
                    });
                }
                else if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                    exports.push({
                        name: '*',
                        type: 're-export',
                        source: node.moduleSpecifier.text
                    });
                }
            }
            else if (ts.isExportAssignment(node)) {
                exports.push({
                    name: 'default',
                    type: 'default'
                });
            }
            else {
                const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
                if (modifiers) {
                    const hasExport = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
                    if (hasExport) {
                        let name = 'unknown';
                        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
                            name = node.name?.text || 'anonymous';
                        }
                        else if (ts.isVariableStatement(node)) {
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
    calculateComplexity(sourceFile) {
        let cyclomatic = 1;
        let cognitive = 0;
        let loc = 0;
        let lloc = 0;
        let sloc = 0;
        let operators = new Set();
        let operands = new Set();
        const visit = (node, depth = 0) => {
            switch (node.kind) {
                case ts.SyntaxKind.IfStatement:
                    cyclomatic++;
                    cognitive += depth;
                    const ifStmt = node;
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
                    if (node.statements.length > 0) {
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
                    const binaryExpr = node;
                    const operator = binaryExpr.operatorToken.getText();
                    if (operator === '&&' || operator === '||' || operator === '??') {
                        cyclomatic++;
                        cognitive += depth;
                    }
                    operators.add(operator);
                    break;
            }
            if (ts.isIdentifier(node)) {
                operands.add(node.text);
            }
            if (ts.isStatement(node)) {
                lloc++;
            }
            ts.forEachChild(node, child => visit(child, depth + 1));
        };
        visit(sourceFile);
        const text = sourceFile.getText();
        const lines = text.split('\n');
        loc = lines.length;
        sloc = lines.filter(l => l.trim().length > 0).length;
        const n1 = operators.size;
        const n2 = operands.size;
        const N1 = cyclomatic * 2;
        const N2 = lloc;
        const vocabulary = n1 + n2;
        const length = N1 + N2;
        const volume = length * (vocabulary > 0 ? Math.log2(vocabulary) : 0);
        const difficulty = (n1 / 2) * (n2 > 0 ? N2 / n2 : 0);
        const effort = volume * difficulty;
        const safeVolume = Math.max(1, volume);
        const safeLoc = Math.max(1, loc);
        const maintainabilityIndex = 171 - 5.2 * Math.log(safeVolume) - 0.23 * cyclomatic - 16.2 * Math.log(safeLoc);
        const maintainability = Math.max(0, Math.min(100, maintainabilityIndex * 100 / 171));
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
    inferComponentType(sourceFile, filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        if (fileName.includes('component'))
            return 'component';
        if (fileName.includes('service'))
            return 'service';
        if (fileName.includes('interface'))
            return 'interface';
        if (fileName.includes('type'))
            return 'type';
        let hasClassExport = false;
        let hasFunctionExport = false;
        let hasInterfaceExport = false;
        let hasTypeExport = false;
        const visit = (node) => {
            if (ts.isClassDeclaration(node)) {
                hasClassExport = true;
            }
            else if (ts.isFunctionDeclaration(node)) {
                hasFunctionExport = true;
            }
            else if (ts.isInterfaceDeclaration(node)) {
                hasInterfaceExport = true;
            }
            else if (ts.isTypeAliasDeclaration(node)) {
                hasTypeExport = true;
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        if (hasClassExport)
            return 'class';
        if (hasInterfaceExport)
            return 'interface';
        if (hasTypeExport)
            return 'type';
        if (hasFunctionExport)
            return 'function';
        return 'module';
    }
    hasDocumentation(sourceFile) {
        let hasJsDoc = false;
        const visit = (node) => {
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
    calculateQualityScore(complexity) {
        const weights = {
            cyclomatic: 0.3,
            cognitive: 0.2,
            maintainability: 0.3,
            size: 0.2
        };
        const cyclomaticScore = Math.max(0, Math.min(100, 100 - complexity.cyclomatic * 5));
        const cognitiveScore = Math.max(0, Math.min(100, 100 - complexity.cognitive * 2));
        const maintainabilityScore = isFinite(complexity.maintainability) ?
            Math.max(0, Math.min(100, complexity.maintainability)) : 50;
        const sizeScore = Math.max(0, Math.min(100, 100 - (complexity.loc / 10)));
        const score = cyclomaticScore * weights.cyclomatic +
            cognitiveScore * weights.cognitive +
            maintainabilityScore * weights.maintainability +
            sizeScore * weights.size;
        const finalScore = Math.round(Math.max(0, Math.min(100, score)));
        return isFinite(finalScore) ? finalScore : 50;
    }
    resolveDependencies(imports, fromFile) {
        const dependencies = [];
        for (const imp of imports) {
            if (imp.isType) {
                continue;
            }
            const resolvedPath = this.resolveDependencyPath(imp.source, fromFile);
            if (resolvedPath) {
                dependencies.push(resolvedPath);
            }
        }
        return dependencies;
    }
    resolveReExportDependencies(reExportSources, fromFile) {
        const dependencies = [];
        for (const source of reExportSources) {
            const resolvedPath = this.resolveDependencyPath(source, fromFile);
            if (resolvedPath) {
                dependencies.push(resolvedPath);
            }
        }
        return dependencies;
    }
    loadTsConfig(searchPath) {
        const cacheKey = path.dirname(searchPath);
        if (this.tsConfigCache.has(cacheKey)) {
            return this.tsConfigCache.get(cacheKey);
        }
        try {
            const configPath = ts.findConfigFile(searchPath, ts.sys.fileExists, 'tsconfig.json');
            if (!configPath) {
                this.tsConfigCache.set(cacheKey, null);
                return null;
            }
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
            if (configFile.error) {
                this.tsConfigCache.set(cacheKey, null);
                return null;
            }
            const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
            this.tsConfigCache.set(cacheKey, parsedConfig);
            return parsedConfig;
        }
        catch (error) {
            this.outputChannel.appendLine(`Failed to load tsconfig: ${error}`);
            this.tsConfigCache.set(cacheKey, null);
            return null;
        }
    }
    resolvePackageExports(exports, target, basePath) {
        if (typeof exports === 'string') {
            const resolved = path.resolve(basePath, exports);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }
        else if (typeof exports === 'object' && exports !== null) {
            if (exports[target]) {
                return this.resolvePackageExports(exports[target], target, basePath);
            }
            if (exports.default) {
                return this.resolvePackageExports(exports.default, target, basePath);
            }
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
    resolvePathAlias(specifier, fromFile) {
        const tsConfig = this.loadTsConfig(fromFile);
        if (!tsConfig || !tsConfig.options.paths) {
            return null;
        }
        const { paths, baseUrl } = tsConfig.options;
        const basePath = baseUrl ? path.resolve(path.dirname(fromFile), baseUrl) : path.dirname(fromFile);
        for (const [pattern, replacements] of Object.entries(paths)) {
            const regex = new RegExp('^' + pattern.replace('*', '(.*)') + '$');
            const match = specifier.match(regex);
            if (match) {
                for (const replacement of replacements) {
                    const resolvedPath = replacement.replace('*', match[1] || '');
                    const absolutePath = path.resolve(basePath, resolvedPath);
                    const resolved = this.resolveLocalPath(absolutePath);
                    if (resolved) {
                        return resolved;
                    }
                }
            }
        }
        return null;
    }
    resolveDependencyPath(specifier, fromFile) {
        if (specifier.startsWith('.')) {
            const dir = path.dirname(fromFile);
            const resolvedPath = path.resolve(dir, specifier);
            const resolved = this.resolveLocalPath(resolvedPath);
            return resolved ? this.normalizePath(resolved) : null;
        }
        const aliasResolved = this.resolvePathAlias(specifier, fromFile);
        if (aliasResolved) {
            return this.normalizePath(aliasResolved);
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const workspaceRoot = folder.uri.fsPath;
                const localPackagePath = path.join(workspaceRoot, specifier);
                const resolved = this.resolveLocalPath(localPackagePath);
                if (resolved) {
                    return this.normalizePath(resolved);
                }
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
        return null;
    }
    resolveLocalPath(resolvedPath) {
        try {
            const stats = fs.statSync(resolvedPath);
            if (stats.isFile()) {
                return resolvedPath;
            }
            else if (stats.isDirectory()) {
                const packageJsonPath = path.join(resolvedPath, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    try {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                        if (packageJson.exports) {
                            const exportPath = this.resolvePackageExports(packageJson.exports, '.', resolvedPath);
                            if (exportPath)
                                return exportPath;
                        }
                        if (packageJson.main) {
                            const mainPath = path.resolve(resolvedPath, packageJson.main);
                            if (fs.existsSync(mainPath)) {
                                return mainPath;
                            }
                        }
                    }
                    catch (e) {
                    }
                }
                for (const indexExt of this.INDEX_EXTENSIONS) {
                    const indexPath = resolvedPath + indexExt;
                    if (fs.existsSync(indexPath)) {
                        return indexPath;
                    }
                }
                return null;
            }
        }
        catch (error) {
        }
        for (const ext of this.FILE_EXTENSIONS) {
            const pathWithExt = resolvedPath + ext;
            if (fs.existsSync(pathWithExt)) {
                const stats = fs.statSync(pathWithExt);
                if (stats.isFile()) {
                    return pathWithExt;
                }
            }
        }
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
    buildDependencyGraph() {
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();
        for (const filePath of Array.from(this.components.keys())) {
            const normalizedPath = this.normalizePath(filePath);
            if (!this.dependencyGraph.has(normalizedPath)) {
                this.dependencyGraph.set(normalizedPath, new Set());
            }
            if (!this.reverseDependencyGraph.has(normalizedPath)) {
                this.reverseDependencyGraph.set(normalizedPath, new Set());
            }
        }
        for (const [filePath, component] of Array.from(this.components)) {
            const normalizedFilePath = this.normalizePath(filePath);
            for (const dep of component.dependencies) {
                const normalizedDep = this.normalizePath(dep);
                if (normalizedDep === normalizedFilePath) {
                    continue;
                }
                this.dependencyGraph.get(normalizedFilePath).add(normalizedDep);
                if (!this.reverseDependencyGraph.has(normalizedDep)) {
                    this.reverseDependencyGraph.set(normalizedDep, new Set());
                }
                this.reverseDependencyGraph.get(normalizedDep).add(normalizedFilePath);
            }
        }
    }
    async estimateTestCoverage(filePath) {
        const testPatterns = [
            filePath.replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
            filePath.replace(/\.(ts|js|tsx|jsx)$/, '.spec.$1'),
            filePath.replace(/src/, '__tests__').replace(/\.(ts|js|tsx|jsx)$/, '.test.$1')
        ];
        for (const pattern of testPatterns) {
            if (fs.existsSync(pattern)) {
                return 80;
            }
        }
        return 0;
    }
    calculateWorkspaceMetrics() {
        let totalComplexity = 0;
        let totalLines = 0;
        let componentsWithDocs = 0;
        let componentsWithTests = 0;
        for (const component of Array.from(this.components.values())) {
            totalComplexity += component.complexity;
            totalLines += component.linesOfCode;
            if (component.hasDocs)
                componentsWithDocs++;
            if ((component.testCoverage || 0) > 0)
                componentsWithTests++;
        }
        const componentCount = this.components.size || 1;
        const circularDeps = this.findCircularDependencies();
        return {
            averageComplexity: totalComplexity / componentCount,
            testCoverage: (componentsWithTests / componentCount) * 100,
            documentationCoverage: (componentsWithDocs / componentCount) * 100,
            duplicateCodePercentage: 0,
            technicalDebt: this.estimateTechnicalDebt(),
            linterErrors: 0,
            circularDependencies: circularDeps.length,
            unhandledErrors: 0
        };
    }
    estimateTechnicalDebt() {
        let debt = 0;
        for (const component of Array.from(this.components.values())) {
            if (component.complexity > 10) {
                debt += (component.complexity - 10) * 0.5;
            }
            if (component.linesOfCode > 300) {
                debt += (component.linesOfCode - 300) / 100;
            }
            if (!component.hasDocs) {
                debt += 1;
            }
            if ((component.testCoverage || 0) < 50) {
                debt += 2;
            }
        }
        return Math.round(debt);
    }
    normalizePath(filePath) {
        return path.resolve(filePath);
    }
    findCircularDependencies() {
        if (this.dependencyGraph.size === 0 || this.components.size === 0) {
            return [];
        }
        const cycles = [];
        const normalizedCycles = new Set();
        const visited = new Set();
        const recursionStack = new Set();
        const path = [];
        const normalizeCycle = (cycle) => {
            const uniqueCycle = cycle.slice(0, -1);
            let minIndex = 0;
            let minValue = uniqueCycle[0];
            for (let i = 1; i < uniqueCycle.length; i++) {
                if (uniqueCycle[i] < minValue) {
                    minValue = uniqueCycle[i];
                    minIndex = i;
                }
            }
            const normalized = [
                ...uniqueCycle.slice(minIndex),
                ...uniqueCycle.slice(0, minIndex)
            ];
            return normalized.join('->');
        };
        const dfs = (node) => {
            visited.add(node);
            recursionStack.add(node);
            path.push(node);
            const neighbors = this.dependencyGraph.get(node) || new Set();
            for (const neighbor of Array.from(neighbors)) {
                if (!visited.has(neighbor)) {
                    if (dfs(neighbor)) {
                        return true;
                    }
                }
                else if (recursionStack.has(neighbor)) {
                    const cycleStart = path.indexOf(neighbor);
                    const cycle = path.slice(cycleStart);
                    cycle.push(neighbor);
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
    assessCycleSeverity(cycle) {
        if (cycle.length <= 2)
            return 'high';
        if (cycle.length <= 4)
            return 'medium';
        return 'low';
    }
    getComponents() {
        return new Map(this.components);
    }
    getDependencyGraph() {
        const clone = new Map();
        for (const [key, value] of Array.from(this.dependencyGraph)) {
            clone.set(key, new Set(value));
        }
        return clone;
    }
    getReverseDependencyGraph() {
        const clone = new Map();
        for (const [key, value] of Array.from(this.reverseDependencyGraph)) {
            clone.set(key, new Set(value));
        }
        return clone;
    }
    getComplexityMetrics() {
        const metrics = new Map();
        for (const [path, analysis] of Array.from(this.analysisCache)) {
            metrics.set(path, analysis.complexity);
        }
        return metrics;
    }
    getAggregatedComplexity() {
        const cyclomaticValues = [];
        const maintainabilityValues = [];
        const locValues = [];
        let totalCyclomatic = 0;
        let totalMaintainability = 0;
        let totalLines = 0;
        let filesWithMetrics = 0;
        let lowComplexity = 0;
        let mediumComplexity = 0;
        let highComplexity = 0;
        let veryHighComplexity = 0;
        let excellentMaintainability = 0;
        let goodMaintainability = 0;
        let fairMaintainability = 0;
        let poorMaintainability = 0;
        for (const [path, analysis] of Array.from(this.analysisCache)) {
            const complexity = analysis.complexity;
            cyclomaticValues.push(complexity.cyclomatic);
            totalCyclomatic += complexity.cyclomatic;
            if (complexity.cyclomatic <= 5) {
                lowComplexity++;
            }
            else if (complexity.cyclomatic <= 10) {
                mediumComplexity++;
            }
            else if (complexity.cyclomatic <= 20) {
                highComplexity++;
            }
            else {
                veryHighComplexity++;
            }
            const maintainability = isFinite(complexity.maintainability) ? complexity.maintainability : 50;
            maintainabilityValues.push(maintainability);
            totalMaintainability += maintainability;
            if (maintainability > 80) {
                excellentMaintainability++;
            }
            else if (maintainability >= 60) {
                goodMaintainability++;
            }
            else if (maintainability >= 40) {
                fairMaintainability++;
            }
            else {
                poorMaintainability++;
            }
            locValues.push(complexity.loc);
            totalLines += complexity.loc;
            filesWithMetrics++;
        }
        if (filesWithMetrics === 0) {
            for (const [path, component] of Array.from(this.components)) {
                cyclomaticValues.push(component.complexity);
                totalCyclomatic += component.complexity;
                if (component.complexity <= 5) {
                    lowComplexity++;
                }
                else if (component.complexity <= 10) {
                    mediumComplexity++;
                }
                else if (component.complexity <= 20) {
                    highComplexity++;
                }
                else {
                    veryHighComplexity++;
                }
                const estimatedMaintainability = component.qualityScore || 50;
                maintainabilityValues.push(estimatedMaintainability);
                totalMaintainability += estimatedMaintainability;
                if (estimatedMaintainability > 80) {
                    excellentMaintainability++;
                }
                else if (estimatedMaintainability >= 60) {
                    goodMaintainability++;
                }
                else if (estimatedMaintainability >= 40) {
                    fairMaintainability++;
                }
                else {
                    poorMaintainability++;
                }
                locValues.push(component.linesOfCode);
                totalLines += component.linesOfCode;
                filesWithMetrics++;
            }
        }
        const averageCyclomatic = filesWithMetrics > 0 ? totalCyclomatic / filesWithMetrics : 0;
        const averageMaintainability = filesWithMetrics > 0 ? totalMaintainability / filesWithMetrics : 0;
        const averageLines = filesWithMetrics > 0 ? totalLines / filesWithMetrics : 0;
        const sortedCyclomatic = [...cyclomaticValues].sort((a, b) => a - b);
        const sortedMaintainability = [...maintainabilityValues].sort((a, b) => a - b);
        const medianCyclomatic = this.calculateMedian(sortedCyclomatic);
        const medianMaintainability = this.calculateMedian(sortedMaintainability);
        const maxCyclomatic = cyclomaticValues.length > 0 ? Math.max(...cyclomaticValues) : 0;
        const minCyclomatic = cyclomaticValues.length > 0 ? Math.min(...cyclomaticValues) : 0;
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
    calculateMedian(sortedValues) {
        if (sortedValues.length === 0)
            return 0;
        const mid = Math.floor(sortedValues.length / 2);
        if (sortedValues.length % 2 === 0) {
            return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
        }
        else {
            return sortedValues[mid];
        }
    }
    calculateStandardDeviation(values, mean) {
        if (values.length === 0)
            return 0;
        const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDifferences.reduce((sum, value) => sum + value, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
    }
    findUntestedComponents() {
        const untested = [];
        for (const [path, component] of Array.from(this.components)) {
            if (!component.testCoverage || component.testCoverage === 0) {
                untested.push(path);
            }
        }
        return untested;
    }
    findComplexComponents(threshold = 10) {
        const complex = [];
        for (const [path, component] of Array.from(this.components)) {
            if (component.complexity > threshold) {
                complex.push(path);
            }
        }
        return complex.sort((a, b) => {
            return this.components.get(b).complexity - this.components.get(a).complexity;
        });
    }
    getComponent(path) {
        return this.components.get(path);
    }
    clear() {
        this.components.clear();
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();
        this.analysisCache.clear();
        this.tsConfigCache.clear();
        this.pathAliasResolver.clear();
    }
    setupWatchers(context) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}');
        watcher.onDidChange(async (uri) => {
            this.outputChannel.appendLine(`File changed: ${uri.fsPath}`);
            await this.updateFile(uri.fsPath, { incrementalUpdate: true });
        });
        watcher.onDidCreate(async (uri) => {
            this.outputChannel.appendLine(`File created: ${uri.fsPath}`);
            await this.analyzeFile(uri.fsPath);
            this.updateDependencyGraphsForFile(uri.fsPath, this.components.get(uri.fsPath)?.dependencies || []);
        });
        watcher.onDidDelete((uri) => {
            this.outputChannel.appendLine(`File deleted: ${uri.fsPath}`);
            this.removeFile(uri.fsPath);
        });
        context.subscriptions.push(watcher);
        this.outputChannel.appendLine('File watcher registered for incremental updates');
    }
    getDependents(filePath) {
        return this.reverseDependencyGraph.get(filePath);
    }
    isCached(filePath) {
        return this.analysisCache.has(filePath);
    }
    getCachedAnalysis(filePath) {
        return this.analysisCache.get(filePath);
    }
}
exports.CodebaseAnalyzer = CodebaseAnalyzer;
//# sourceMappingURL=CodebaseAnalyzer.js.map