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
    /** Current workload and availability metrics */
    availability: AgentAvailabilityMetrics;
    /** Speed and throughput metrics */
    speed: AgentSpeedMetrics;
    /** Reliability and error tracking */
    reliability: AgentReliabilityMetrics;
    /** Current and historical workload data */
    workload: AgentWorkloadMetrics;
    /** Stuck detection configuration and status */
    stuckDetection: StuckAgentDetection;
    /** Performance trend analysis */
    trends: PerformanceTrend;
    /** Heuristic scoring breakdown */
    heuristicScore: HeuristicScore;
}

/**
 * Detailed availability tracking for an agent
 */
export interface AgentAvailabilityMetrics {
    /** Current number of active tasks */
    currentLoad: number;
    /** Maximum concurrent tasks the agent can handle */
    maxCapacity: number;
    /** Whether the agent is currently available for new tasks */
    isAvailable: boolean;
    /** Time since last response to task assignment (in milliseconds) */
    lastResponseTime: number;
    /** Average response time to task assignments (in milliseconds) */
    averageResponseTime: number;
    /** Agent uptime percentage (0-100) */
    uptime: number;
    /** Last time agent was marked as online */
    lastOnlineTime: Date;
    /** Whether agent is currently online */
    isOnline: boolean;
}

/**
 * Comprehensive speed and throughput metrics for an agent
 */
export interface AgentSpeedMetrics {
    /** Average time to start a task (in milliseconds) */
    averageTaskStartTime: number;
    /** Average time to complete a task (in milliseconds) */
    averageTaskCompletionTime: number;
    /** Tasks completed per hour */
    tasksPerHour: number;
    /** Average time between task assignments and start (in milliseconds) */
    averageAssignmentToStartTime: number;
    /** Fastest task completion time (in milliseconds) */
    fastestTaskTime: number;
    /** Slowest task completion time (in milliseconds) */
    slowestTaskTime: number;
    /** Median task completion time (in milliseconds) */
    medianTaskTime: number;
    /** Standard deviation of task completion times */
    taskTimeStandardDeviation: number;
}

/**
 * Reliability and error tracking for an agent
 */
export interface AgentReliabilityMetrics {
    /** Number of consecutive failures */
    consecutiveFailures: number;
    /** Agent uptime percentage (0-100) */
    uptime: number;
    /** Error rate percentage (0-100) */
    errorRate: number;
    /** Number of times agent has been stuck */
    stuckCount: number;
    /** Last error message */
    lastError?: string;
    /** Error types and their frequencies */
    errorTypes: Record<string, number>;
    /** Recovery time after failures (in milliseconds) */
    averageRecoveryTime: number;
    /** Success rate percentage (0-100) */
    successRate: number;
}

/**
 * Current and historical workload data for an agent
 */
export interface AgentWorkloadMetrics {
    /** Current number of active tasks */
    currentTasks: number;
    /** Number of tasks in queue for this agent */
    queuedTasks: number;
    /** Maximum concurrent tasks this agent can handle */
    maxConcurrentTasks: number;
    /** Workload utilization percentage (0-100) */
    utilizationPercentage: number;
    /** Peak workload reached in current session */
    peakWorkload: number;
    /** Average workload over time */
    averageWorkload: number;
    /** Workload trend (increasing, decreasing, stable) */
    workloadTrend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Stuck detection configuration and status for an agent
 */
export interface StuckAgentDetection {
    /** Last time agent showed activity */
    lastActivityTime: Date;
    /** Threshold for considering agent stuck (in milliseconds) */
    stuckThreshold: number;
    /** Whether agent is currently considered stuck */
    isStuck: boolean;
    /** Reason for being stuck */
    stuckReason?: 'timeout' | 'unresponsive' | 'error_pattern' | 'workload' | 'unknown';
    /** Number of times agent has been detected as stuck */
    stuckDetectionCount: number;
    /** Last time agent was unstuck */
    lastUnstuckTime?: Date;
    /** Time agent has been stuck (in milliseconds) */
    stuckDuration: number;
    /** Whether stuck detection is enabled for this agent */
    detectionEnabled: boolean;
}

/**
 * Performance trend analysis data structure
 */
export interface PerformanceTrend {
    /** Overall performance trend */
    performanceTrend: 'improving' | 'declining' | 'stable';
    /** Speed trend analysis */
    speedTrend: 'faster' | 'slower' | 'stable';
    /** Reliability trend analysis */
    reliabilityTrend: 'more_reliable' | 'less_reliable' | 'stable';
    /** Trend confidence score (0-100) */
    confidence: number;
    /** Number of data points used for trend analysis */
    dataPoints: number;
    /** Trend analysis timestamp */
    analysisTimestamp: Date;
}

/**
 * Multi-criteria scoring breakdown for agent performance
 */
export interface HeuristicScore {
    /** Overall heuristic score (0-100) */
    overallScore: number;
    /** Success rate component score (0-100) */
    successRateScore: number;
    /** Speed component score (0-100) */
    speedScore: number;
    /** Availability component score (0-100) */
    availabilityScore: number;
    /** Reliability component score (0-100) */
    reliabilityScore: number;
    /** Workload efficiency score (0-100) */
    workloadScore: number;
    /** Scoring weights used */
    weights: ScoringWeights;
    /** Score calculation timestamp */
    calculatedAt: Date;
}

/**
 * Configurable weights for different scoring criteria
 */
export interface ScoringWeights {
    /** Weight for success rate (0-1) */
    successRate: number;
    /** Weight for speed (0-1) */
    speed: number;
    /** Weight for availability (0-1) */
    availability: number;
    /** Weight for reliability (0-1) */
    reliability: number;
    /** Weight for workload efficiency (0-1) */
    workload: number;
}

/**
 * Configurable thresholds for various performance metrics
 */
export interface PerformanceThresholds {
    /** Threshold for considering agent stuck (in milliseconds) */
    stuckThreshold: number;
    /** Threshold for low performance alert (0-100) */
    lowPerformanceThreshold: number;
    /** Threshold for high error rate alert (0-100) */
    highErrorRateThreshold: number;
    /** Threshold for high workload alert (0-100) */
    highWorkloadThreshold: number;
    /** Threshold for slow response time alert (in milliseconds) */
    slowResponseThreshold: number;
    /** Minimum tasks required for reliable performance calculation */
    minTasksForReliability: number;
}

/**
 * Point-in-time performance data snapshot
 */
export interface PerformanceSnapshot {
    /** Agent ID */
    agentId: string;
    /** Snapshot timestamp */
    timestamp: Date;
    /** Performance metrics at this point in time */
    performance: AgentPerformance;
    /** Heuristic score at this point in time */
    heuristicScore: HeuristicScore;
    /** Whether agent was stuck at this time */
    wasStuck: boolean;
    /** Current workload at this time */
    currentWorkload: number;
}

/**
 * Historical performance data with timestamps
 */
export interface PerformanceHistory {
    /** Agent ID */
    agentId: string;
    /** Historical performance snapshots */
    snapshots: PerformanceSnapshot[];
    /** Time range of historical data */
    timeRange: {
        start: Date;
        end: Date;
    };
    /** Number of snapshots */
    snapshotCount: number;
    /** Average performance over time */
    averagePerformance: AgentPerformance;
    /** Performance trend analysis */
    trendAnalysis: PerformanceTrend;
}

/**
 * Storage configuration and metadata for performance metrics
 */
export interface MetricsStorage {
    /** Storage location identifier */
    storageId: string;
    /** Storage type */
    storageType: 'workspace' | 'global' | 'temp';
    /** Storage configuration */
    config: {
        /** Maximum number of snapshots to keep */
        maxSnapshots: number;
        /** Snapshot interval in milliseconds */
        snapshotInterval: number;
        /** Retention period in days */
        retentionDays: number;
        /** Whether to compress old data */
        compressOldData: boolean;
    };
    /** Storage metadata */
    metadata: {
        /** Creation timestamp */
        createdAt: Date;
        /** Last update timestamp */
        lastUpdated: Date;
        /** Total storage size in bytes */
        totalSize: number;
        /** Number of agents tracked */
        agentCount: number;
    };
}

/**
 * Project architecture overview
 */
export interface ProjectArchitecture {
    /** Entry points of the application */
    entryPoints: string[];
    /** Architectural layers and their components */
    layers: Record<string, string[]>;
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
    components: Record<string, CodeComponent>;
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
    components: Record<string, CodeComponent>;
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

/**
 * Load balancing strategy options
 */
export enum LoadBalancingStrategy {
    /** Balanced distribution across all agents */
    BALANCED = 'balanced',
    /** Optimize for performance and speed */
    PERFORMANCE_OPTIMIZED = 'performance-optimized',
    /** Optimize for capacity utilization */
    CAPACITY_OPTIMIZED = 'capacity-optimized'
}

/**
 * Agent capacity scoring breakdown
 */
export interface AgentCapacityScore {
    /** Overall capacity score (0-100) */
    overallScore: number;
    /** Capacity utilization score (0-100) */
    capacityScore: number;
    /** Performance score (0-100) */
    performanceScore: number;
    /** Availability score (0-100) */
    availabilityScore: number;
    /** Specialization match score (0-100) */
    specializationScore: number;
    /** Scoring weights used */
    weights: CapacityScoringWeights;
    /** Score calculation timestamp */
    calculatedAt: Date;
}

/**
 * Configurable weights for capacity scoring
 */
export interface CapacityScoringWeights {
    /** Weight for capacity utilization (0-1) */
    capacity: number;
    /** Weight for performance (0-1) */
    performance: number;
    /** Weight for availability (0-1) */
    availability: number;
    /** Weight for specialization match (0-1) */
    specialization: number;
}

/**
 * Load balancing configuration
 */
export interface LoadBalancingConfig {
    /** Load balancing strategy to use */
    strategy: LoadBalancingStrategy;
    /** Threshold for considering agent overloaded (0-100) */
    overloadThreshold: number;
    /** Timeout for stuck agent detection (in milliseconds) */
    stuckDetectionTimeout: number;
    /** Monitoring interval (in milliseconds) */
    monitoringInterval: number;
    /** Whether load balancing is enabled */
    enabled: boolean;
    /** Minimum tasks required before load balancing kicks in */
    minTasksForLoadBalancing: number;
    /** Maximum reassignments per monitoring cycle */
    maxReassignmentsPerCycle: number;
}

/**
 * Load balancing metrics for tracking effectiveness
 */
export interface LoadBalancingMetrics {
    /** Total number of load balancing operations */
    totalOperations: number;
    /** Number of task reassignments */
    taskReassignments: number;
    /** Number of stuck agents detected */
    stuckAgentsDetected: number;
    /** Number of overloaded agents detected */
    overloadedAgentsDetected: number;
    /** Average load balancing effectiveness (0-100) */
    averageEffectiveness: number;
    /** Load balancing operation success rate (0-100) */
    successRate: number;
    /** Last load balancing operation timestamp */
    lastOperationTime: Date;
    /** Load balancing metrics timestamp */
    timestamp: Date;
}

/**
 * Task reassignment reason
 */
export enum TaskReassignmentReason {
    /** Agent is overloaded */
    OVERLOADED = 'overloaded',
    /** Agent is stuck */
    STUCK = 'stuck',
    /** Performance optimization */
    PERFORMANCE_OPTIMIZATION = 'performance-optimization',
    /** Capacity optimization */
    CAPACITY_OPTIMIZATION = 'capacity-optimization'
}

/**
 * Load balancing event for publishing
 */
export interface LoadBalancingEvent {
    /** Event type */
    type: 'task_reassigned' | 'agent_overloaded' | 'agent_stuck' | 'load_balanced' | 'optimization_completed';
    /** Agent ID involved */
    agentId: string;
    /** Task ID involved (if applicable) */
    taskId?: string;
    /** Reassignment reason (if applicable) */
    reason?: TaskReassignmentReason;
    /** Event timestamp */
    timestamp: Date;
    /** Additional event data */
    data?: Record<string, any>;
}

/**
 * Detailed workload breakdown for an agent
 */
export interface AgentWorkload {
    /** Agent ID */
    agentId: string;
    /** Current number of active tasks */
    currentTasks: number;
    /** Maximum concurrent tasks */
    maxConcurrentTasks: number;
    /** Workload utilization percentage (0-100) */
    utilizationPercentage: number;
    /** Tasks completed in last hour */
    tasksCompletedLastHour: number;
    /** Average task completion time (in milliseconds) */
    averageTaskTime: number;
    /** Whether agent is available for new tasks */
    isAvailable: boolean;
    /** Workload timestamp */
    timestamp: Date;
}

/**
 * Task distribution plan for load balancing
 */
export interface TaskDistributionPlan {
    /** Plan ID */
    planId: string;
    /** Tasks to be reassigned */
    reassignments: TaskReassignment[];
    /** Expected load distribution after plan execution */
    expectedDistribution: Map<string, AgentWorkload>;
    /** Plan effectiveness score (0-100) */
    effectivenessScore: number;
    /** Plan creation timestamp */
    createdAt: Date;
    /** Whether plan has been executed */
    executed: boolean;
    /** Plan execution timestamp */
    executedAt?: Date;
}

/**
 * Individual task reassignment within a distribution plan
 */
export interface TaskReassignment {
    /** Task ID */
    taskId: string;
    /** Current agent ID */
    currentAgentId: string;
    /** Target agent ID */
    targetAgentId: string;
    /** Reassignment reason */
    reason: TaskReassignmentReason;
    /** Expected improvement score (0-100) */
    expectedImprovement: number;
    /** Reassignment priority (1-10) */
    priority: number;
}

/**
 * Load balancing operation result
 */
export interface LoadBalancingResult {
    /** Operation success status */
    success: boolean;
    /** Number of tasks reassigned */
    tasksReassigned: number;
    /** Number of agents affected */
    agentsAffected: number;
    /** Load balancing effectiveness score (0-100) */
    effectiveness: number;
    /** Operation duration (in milliseconds) */
    duration: number;
    /** Any errors encountered */
    errors: string[];
    /** Operation timestamp */
    timestamp: Date;
    /** Detailed results for each reassignment */
    reassignmentResults: ReassignmentResult[];
}

/**
 * Individual reassignment result
 */
export interface ReassignmentResult {
    /** Task ID */
    taskId: string;
    /** Source agent ID */
    sourceAgentId: string;
    /** Target agent ID */
    targetAgentId: string;
    /** Reassignment success status */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Reassignment timestamp */
    timestamp: Date;
}
