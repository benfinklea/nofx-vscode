/**
 * NofX Business-Focused Test Suites
 *
 * Consolidated test organization for better performance and business alignment
 * Each suite focuses on specific business value and entrepreneur outcomes
 */

// Re-export all test suites for easy importing
export * from './agent-coordination/agent-coordination.test';
export * from './agent-coordination/agent-lifecycle.test';
export * from './agent-coordination/agent-communication.test';

export * from './platform-services/core-services.test';
export * from './platform-services/configuration-services.test';
export * from './platform-services/monitoring-services.test';
export * from './platform-services/persistence-services.test';
export * from './platform-services/orchestration-services.test';

export * from './business-logic/task-management.test';
export * from './business-logic/workflow-execution.test';
export * from './business-logic/business-rules.test';
export * from './business-logic/user-scenarios.test';
export * from './business-logic/error-recovery.test';
export * from './business-logic/performance-benchmarks.test';

export * from './user-interface/command-interface.test';
export * from './user-interface/dashboard-components.test';
export * from './user-interface/user-interactions.test';
export * from './user-interface/accessibility.test';

export * from './integration/end-to-end-workflows.test';
export * from './integration/external-integrations.test';
export * from './integration/cross-component.test';
export * from './integration/data-flow.test';
export * from './integration/error-propagation.test';
export * from './integration/performance-integration.test';

export * from './business-confidence/entrepreneur-workflows.test';
export * from './business-confidence/platform-reliability.test';
export * from './business-confidence/user-experience.test';
export * from './business-confidence/business-metrics.test';
export * from './business-confidence/confidence-indicators.test';
export * from './business-confidence/success-validation.test';
