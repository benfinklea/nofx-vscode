/**
 * Shared type definitions for the intelligence module
 * These types support comprehensive codebase analysis and architectural insights
 */

import * as vscode from 'vscode';

/**
 * Represents a code component with its metadata and relationships
 */
export interface CodeComponent {
    /** Component name (class, function, or module name) */
    name: string;
    /** File path of the component */
    path: string;
    /** Component type (class, function, interface, etc.) */
    type: 'class' | 'function' | 'interface' | 'type' | 'module' | 'component' | 'service';
    /** List of imported modules */
    imports: string[];
    /** List of exported items */
    exports: string[];
    /** Dependencies on other components */
    dependencies: string[];
    /** Cyclomatic complexity score */
    complexity: number;
    /** Number of lines of code */
    linesOfCode: number;
    /** Whether this component has documentation */
    hasDocs: boolean;
    /** Last modified timestamp */
    lastModified: Date;
    /** Quality score (0-100) */
    qualityScore: number;
    /** Test coverage percentage */
    testCoverage?: number;
    /** Error messages */
    errors?: string[];
}

/**
 * Performance metrics for an agent
 */
export interface AgentPerformance {
    /** Unique agent identifier */
    agentId: string;
    /** Total number of tasks assigned */
    totalTasks: number;
    /** Number of successfully completed tasks */
    completedTasks: number;
    /** Number of failed tasks */
    failedTasks: number;
    /** Average execution time in minutes */
    averageExecutionTime: number;
    /** Agent's area of specialization */
    specialization: string;
    /** Quality score based on success rate (0-100) */
    qualityScore: number;
    /** Last time the agent was active */
    lastActive: Date;
}

/**
 * Project architecture overview
 */
export interface ProjectArchitecture {
    /** Entry points of the application */
    entryPoints: string[];
    /** Architectural layers and their components */
    layers: Map<string, string[]>;
    /** Detected design patterns */
    patterns: string[];
    /** Technologies used in the project */
    technologies: string[];
    /** Component dependency relationships */
    dependencies: Map<string, string[]>;
    /** Overall quality metrics */
    qualityMetrics: QualityMetrics;
}

/**
 * Quality metrics for the codebase
 */
export interface QualityMetrics {
    /** Average cyclomatic complexity across all components */
    averageComplexity: number;
    /** Test coverage percentage */
    testCoverage: number;
    /** Documentation coverage percentage */
    documentationCoverage: number;
    /** Code duplication percentage */
    duplicateCodePercentage: number;
    /** Technical debt score (0-100) */
    technicalDebt: number;
    /** Number of linter errors */
    linterErrors: number;
    /** Total number of circular dependencies */
    circularDependencies: number;
    /** Number of unhandled errors */
    unhandledErrors: number;
}

/**
 * Circular dependency information
 */
export interface CircularDependency {
    /** Components involved in the circular dependency */
    cycle: string[];
    /** Severity level of the circular dependency */
    severity: 'low' | 'medium' | 'high';
}

/**
 * Dependency graph structure
 * Maps component file paths to their dependencies
 */
export type DependencyGraph = Map<string, Set<string>>;

/**
 * Import information extracted from AST
 */
export interface ImportInfo {
    /** Source module being imported */
    source: string;
    /** Import specifiers (named imports, default import, etc.) */
    specifiers: string[];
    /** Whether this is a default import */
    isDefault?: boolean;
    /** Whether this is a namespace import */
    isNamespace?: boolean;
    /** Whether this is a type-only import */
    isType?: boolean;
    /** Whether this is a dynamic import */
    isDynamic?: boolean;
}

/**
 * Import specifier details
 */
export interface ImportSpecifier {
    /** Name of the imported item */
    name: string;
    /** Alias if renamed during import */
    alias?: string;
    /** Whether this is a default import */
    isDefault: boolean;
    /** Whether this is a namespace import */
    isNamespace: boolean;
}

/**
 * Export information extracted from AST
 */
export interface ExportInfo {
    /** Name of the exported item */
    name: string;
    /** Type of export (named, default, re-export) */
    type: 'named' | 'default' | 're-export';
    /** Source module for re-exports */
    source?: string;
    /** Whether this is a type-only export */
    isType?: boolean;
}

/**
 * Complexity metrics for a component
 */
export interface ComplexityMetrics {
    /** Cyclomatic complexity score */
    cyclomatic: number;
    /** Cognitive complexity score */
    cognitive: number;
    /** Halstead metrics */
    halstead: {
        volume: number;
        difficulty: number;
        effort: number;
    };
    /** Maintainability index */
    maintainability: number;
    /** Lines of code */
    loc: number;
    /** Logical lines of code */
    lloc: number;
    /** Source lines of code */
    sloc: number;
}

/**
 * Analysis options for workspace analysis
 */
export interface AnalysisOptions {
    /** Whether to include test files in analysis */
    includeTests?: boolean;
    /** Whether to cache analysis results */
    cacheResults?: boolean;
    /** File patterns to include (default: TypeScript/JavaScript files) */
    includePatterns?: string[];
    /** File patterns to exclude (default: node_modules) */
    excludePatterns?: string[];
    /** Maximum file size to analyze (in bytes) */
    maxFileSize?: number;
    /** Whether to perform deep analysis (slower but more accurate) */
    deepAnalysis?: boolean;
    /** Whether to include node_modules in analysis */
    includeNodeModules?: boolean;
    /** Whether to perform incremental updates */
    incrementalUpdate?: boolean;
}

/**
 * Analysis results from workspace analysis
 */
export interface AnalysisResults {
    /** Map of file paths to their analyzed components */
    components: Map<string, CodeComponent>;
    /** Overall quality metrics */
    metrics: QualityMetrics;
    /** Dependency graph */
    dependencyGraph: DependencyGraph;
    /** Analysis duration in milliseconds */
    duration: number;
    /** Number of files analyzed */
    filesAnalyzed: number;
    /** Number of files that failed to parse */
    parseErrors: number;
    /** Analysis timestamp */
    timestamp: Date;
}

/**
 * File analysis result
 */
export interface FileAnalysis {
    /** File path */
    path: string;
    /** Analyzed component */
    component: CodeComponent;
    /** Import information */
    imports: ImportInfo[];
    /** Export information */
    exports: ExportInfo[];
    /** Complexity metrics */
    complexity: ComplexityMetrics;
    /** Analysis errors */
    errors: string[];
    /** File modification time */
    mtimeMs?: number;
    /** Whether this is text-based analysis */
    isTextAnalysis?: boolean;
}

/**
 * Workspace analysis result
 */
export interface WorkspaceAnalysis {
    /** Map of file paths to their analyzed components */
    components: Map<string, CodeComponent>;
    /** Dependency graph */
    dependencies: DependencyGraph;
    /** Quality metrics */
    metrics: QualityMetrics;
    /** Analysis timestamp */
    timestamp: Date;
}

/**
 * Aggregated complexity metrics
 */
export interface AggregatedComplexityMetrics {
    /** Average cyclomatic complexity */
    averageCyclomatic: number;
    /** Average maintainability index */
    averageMaintainability: number;
    /** Average lines of code */
    averageLines: number;
    /** Total cyclomatic complexity */
    totalCyclomatic: number;
    /** Total lines of code */
    totalLines: number;
    /** Median cyclomatic complexity */
    medianCyclomatic: number;
    /** Median maintainability index */
    medianMaintainability: number;
    /** Maximum cyclomatic complexity */
    maxCyclomatic: number;
    /** Minimum cyclomatic complexity */
    minCyclomatic: number;
    /** Standard deviation of cyclomatic complexity */
    standardDeviation: number;
    /** Number of files analyzed */
    filesAnalyzed: number;
    /** Complexity distribution */
    complexityDistribution: {
        low: number;
        medium: number;
        high: number;
        veryHigh: number;
    };
    /** Maintainability distribution */
    maintainabilityDistribution: {
        excellent: number;
        good: number;
        fair: number;
        poor: number;
    };
}

/**
 * File change event for incremental analysis
 */
export interface FileChangeEvent {
    /** Type of file change */
    type: 'created' | 'modified' | 'deleted';
    /** File path that changed */
    filePath: string;
    /** New file content (for created/modified) */
    content?: string;
    /** Timestamp of the change */
    timestamp: Date;
}

/**
 * Analysis cache entry
 */
export interface AnalysisCacheEntry {
    /** File path */
    filePath: string;
    /** File content hash */
    contentHash: string;
    /** Analysis timestamp */
    timestamp: Date;
    /** Cached component data */
    component: CodeComponent;
}

/**
 * Performance metrics for the analyzer
 */
export interface AnalyzerPerformance {
    /** Total analysis time in milliseconds */
    totalTime: number;
    /** Time spent parsing files */
    parseTime: number;
    /** Time spent building dependency graph */
    dependencyTime: number;
    /** Time spent calculating complexity */
    complexityTime: number;
    /** Memory usage in MB */
    memoryUsage: number;
    /** Number of files processed per second */
    filesPerSecond: number;
}