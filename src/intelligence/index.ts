/**
 * Intelligence Module - Barrel Export
 *
 * This module provides comprehensive codebase analysis capabilities using
 * TypeScript Compiler API for robust AST-based analysis.
 */

// Export a safe wrapper for CodebaseAnalyzer that handles missing TypeScript
let CodebaseAnalyzer: any;

try {
    // Try to load the real CodebaseAnalyzer
    require('typescript');
    CodebaseAnalyzer = require('./CodebaseAnalyzer').CodebaseAnalyzer;
} catch (e) {
    // Create a stub implementation when TypeScript is not available
    console.warn('[NofX] TypeScript not available - code analysis features disabled');

    CodebaseAnalyzer = class StubCodebaseAnalyzer {
        constructor() {}

        async analyzeWorkspace() {
            return {
                fileCount: 0,
                totalLines: 0,
                components: new Map(),
                metrics: {
                    averageComplexity: 0,
                    avgMaintainability: 100,
                    minMaintainability: 100,
                    fileCount: 0,
                    functionCount: 0
                },
                circularDependencies: [],
                unusedExports: [],
                qualityScore: 100,
                suggestions: ['TypeScript module not available - code analysis disabled']
            };
        }

        async analyzeFile() {
            return {
                path: '',
                imports: [],
                exports: [],
                complexity: {
                    cyclomatic: 0,
                    cognitive: 0,
                    halstead: {
                        volume: 0,
                        difficulty: 0,
                        effort: 0
                    },
                    maintainability: 100
                },
                dependencies: [],
                dependents: [],
                lineCount: 0,
                issues: []
            };
        }

        async analyzeText() {
            return this.analyzeFile();
        }

        getComponents() {
            return new Map();
        }
        getDependencyGraph() {
            return new Map();
        }
        findCircularDependencies() {
            return [];
        }
        findUnusedExports() {
            return [];
        }
        generateMetrics() {
            return {
                averageComplexity: 0,
                avgMaintainability: 100,
                minMaintainability: 100,
                fileCount: 0,
                functionCount: 0
            };
        }
        calculateQualityScore() {
            return 100;
        }
        generateSuggestions() {
            return ['TypeScript not available'];
        }
        isCached() {
            return false;
        }
        getCachedAnalysis() {
            return undefined;
        }
    };
}

export { CodebaseAnalyzer };

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
    AnalyzerPerformance,
    PerformanceSnapshot,
    PerformanceHistory,
    PerformanceTrend,
    ScoringWeights,
    PerformanceThresholds,
    StuckAgentDetection
} from './types';

// Re-export commonly used types for convenience
export type { ImportSpecifier } from './types';

// Load balancing types - re-exported from types.ts
export {
    LoadBalancingStrategy,
    LoadBalancingConfig,
    LoadBalancingMetrics,
    LoadBalancingEvent,
    AgentCapacityScore,
    TaskReassignmentReason,
    AgentWorkload,
    TaskDistributionPlan,
    TaskReassignment,
    LoadBalancingResult,
    ReassignmentResult,
    CapacityScoringWeights
} from './types';
