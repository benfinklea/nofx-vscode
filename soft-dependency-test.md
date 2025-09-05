# Soft Dependency Implementation Test

## Overview
This document describes the test scenario for the soft dependency implementation.

## Test Scenario
Create tasks A, B, and C where:
- Task A: "Setup database" (no dependencies)
- Task B: "Run migrations" (no dependencies) 
- Task C: "Start application" (prefers A and B)

## Expected Behavior

### Initial State
- Task A and B are ready and can be assigned immediately
- Task C is ready but has a small priority penalty (-5) because it prefers A and B which are not completed
- Task C should be lower in the priority queue than A and B

### After Task A Completes
- Task C's priority should increase (still -5 penalty for B not completed)
- Task C moves up in the queue but still below B

### After Task B Completes  
- Task C's priority should increase by +5 bonus (all soft deps satisfied)
- Task C should now have higher priority and move to the top of the queue
- UI should show "✨ Soft deps satisfied" hint for Task C

## Implementation Details

### Priority Adjustments
- **+5 bonus**: When all preferred tasks are completed
- **-5 penalty**: When some preferred tasks are still pending
- **No adjustment**: When no soft dependencies exist

### Events Published
- `TASK_SOFT_DEPENDENCY_SATISFIED`: When all soft dependencies are completed
- Existing soft dependency events continue to work

### UI Enhancements
- `softDependencyStatus`: 'satisfied' | 'pending' | 'none'
- `softDependencyHint`: User-friendly hint text
- Examples:
  - "✨ Soft deps satisfied"
  - "⏳ Waiting for: task-A, task-B"

## Key Files Modified
1. `PriorityTaskQueue.ts` - Added priority adjustment logic
2. `TaskQueue.ts` - Added recomputation triggers
3. `TaskDependencyManager.ts` - Added getSoftDependents method
4. `EventConstants.ts` - Added TASK_SOFT_DEPENDENCY_SATISFIED event
5. `ui.ts` - Added soft dependency status and hints
6. `interfaces.ts` - Updated interfaces

## Testing Steps
1. Create tasks A, B, C with the above configuration
2. Verify initial priority ordering
3. Complete task A and verify C's priority adjustment
4. Complete task B and verify C gets priority bonus
5. Check UI displays correct soft dependency hints
6. Verify events are published correctly
