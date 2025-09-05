/**
 * Intelligence Module - Barrel Export
 * 
 * This module provides comprehensive codebase analysis capabilities using
 * TypeScript Compiler API for robust AST-based analysis.
 */

// Main analyzer class
export { CodebaseAnalyzer } from './CodebaseAnalyzer';

// Type definitions
export type {
    CodeComponent,
    AgentPerformance,
    ProjectArchitecture,
    QualityMetrics,
    CircularDependency,
    DependencyGraph,
    ImportInfo,
    ExportInfo,
    ComplexityMetrics,
    AnalysisOptions,
    AnalysisResults,
    FileAnalysis,
    WorkspaceAnalysis,
    AggregatedComplexityMetrics,
    FileChangeEvent,
    AnalysisCacheEntry,
    AnalyzerPerformance
} from './types';

// Re-export commonly used types for convenience
export type {
    ImportSpecifier
} from './types';