# Dependency-Aware Task Prioritization

This document explains how the NOFX extension handles dependency-aware task prioritization using soft dependencies.

## Overview

The system automatically boosts the priority of tasks when their preferred dependencies complete, ensuring that high-priority tasks can influence the execution order of their blocking dependencies.

## How It Works

### Soft Dependencies

Tasks can specify soft dependencies using the `prefers` field in their configuration:

```typescript
interface TaskConfig {
  id: string;
  priority: number;
  prefers?: string[]; // Soft dependencies - boost priority when these complete
  // ... other fields
}
```

### Automatic Priority Boosting

When a task completes, the system:

1. **Identifies dependent tasks**: Finds all tasks that have the completed task in their `prefers` list
2. **Recalculates priority**: Calls `recomputeTaskPriorityWithSoftDeps()` for each dependent task
3. **Updates queue**: The dependent tasks are re-queued with their boosted priority
4. **Publishes event**: Emits `TASK_SOFT_DEPENDENCY_SATISFIED` event

### Priority Calculation

The `computeEffectivePriority()` method calculates the final priority by:

- Starting with the base task priority
- Adding a boost for each satisfied soft dependency
- Using the configured soft dependency weight (current: +5 for all satisfied dependencies)

```typescript
effectivePriority = basePriority + (satisfiedSoftDeps > 0 ? 5 : -5)
```

## Example Scenario

Consider the original issue scenario:

```typescript
// Low priority integration test
const integrationTest = {
  id: "integration-test",
  priority: 10,
  // ... other config
};

// High priority deployment that needs the test
const deployTask = {
  id: "deploy-to-production", 
  priority: 100,
  prefers: ["integration-test"], // Boost integration test priority
  // ... other config
};
```

**What happens:**

1. Both tasks start with their base priorities (10 and 100)
2. Integration test runs first due to lower priority
3. When integration test completes, deploy task's soft dependency is satisfied
4. Deploy task's priority is automatically boosted (e.g., 100 + 5 = 105)
5. Deploy task moves to the front of the queue

## Configuration

### Soft Dependency Weight

The priority boost amount is configured in the `PriorityTaskQueue` implementation. The current implementation uses a fixed boost of +5 for satisfied soft dependencies.

### Event Handling

Listen for soft dependency satisfaction events:

```typescript
eventBus.subscribe(DOMAIN_EVENTS.TASK_SOFT_DEPENDENCY_SATISFIED, (data) => {
  console.log(`Task ${data.taskId} soft deps satisfied:`, data.satisfiedDependencies);
});

eventBus.subscribe(DOMAIN_EVENTS.TASK_PRIORITY_UPDATED, (data) => {
  console.log(`Task ${data.taskId} priority updated: ${data.oldPriority} → ${data.newPriority}`);
});
```

**Note:** The system publishes two separate events:
- `TASK_SOFT_DEPENDENCY_SATISFIED`: Contains `{ taskId, task, satisfiedDependencies: string[] }`
- `TASK_PRIORITY_UPDATED`: Contains `{ taskId, oldPriority, newPriority }`

## Best Practices

### When to Use Soft Dependencies

- **Use `prefers`** when you want to influence execution order without blocking
- **Use hard dependencies** when tasks absolutely cannot run without prerequisites
- **Combine both** for complex workflows with optional and required dependencies

### Task Design

- Keep soft dependency lists small and focused
- Avoid circular preferences (A prefers B, B prefers A)
- Use descriptive task IDs for better dependency management
- Consider the priority boost when setting base priorities

### Performance Considerations

- Soft dependency resolution is automatic and efficient
- Priority recalculation only occurs when dependencies complete
- Large dependency graphs are handled gracefully
- Events are published asynchronously to avoid blocking

## API Reference

### Key Methods

- `recomputeTaskPriorityWithSoftDeps(taskId)`: Recalculates priority for a task
- `computeEffectivePriority(task, allTasks)`: Calculates final priority with boosts
- `getSoftDependents(taskId)`: Finds tasks that depend on the given task
- `updatePriority(taskId, newPriority)`: Updates task priority in queue

### Events

- `TASK_SOFT_DEPENDENCY_SATISFIED`: Emitted when a soft dependency is satisfied
- `TASK_PRIORITY_UPDATED`: Emitted when a task's priority changes

## Troubleshooting

### Common Issues

1. **Priority not boosting**: Check that `prefers` field contains correct task IDs
2. **Circular dependencies**: Avoid tasks that prefer each other
3. **Missing events**: Ensure event listeners are registered before task creation
4. **Unexpected order**: Verify base priorities and soft dependency weights

### Debugging

Enable debug logging to see priority calculations:

```typescript
// Enable debug logging in your logging service
const loggingService = {
  debug: (message: string, ...args: any[]) => console.log(message, ...args),
  // ... other logging methods
};
```

This will log priority calculations and dependency satisfaction events to the console.
