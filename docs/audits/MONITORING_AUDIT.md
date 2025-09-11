# Monitoring Services Audit

## Executive Summary
The codebase has **6 monitoring services** with **ALL showing 0% test coverage**, indicating they are not actively tested or potentially unused. Significant overlap exists between services with redundant functionality.

## 1. Current Monitoring Services

| Service | Lines | Purpose | Status | Dependencies |
|---------|-------|---------|--------|--------------|
| **ActivityMonitor** | 141 | Tracks agent activity status | Used by AgentLifecycleManager | TerminalOutputMonitor, InactivityMonitor |
| **SystemHealthMonitor** | 179 | System-wide health checks | Unused (0% coverage) | Multiple services |
| **AgentHealthMonitor** | 168 | Agent-specific health tracking | Used by AgentManager | EventBus, LoggingService |
| **InactivityMonitor** | 121 | Detects agent inactivity | Used by ActivityMonitor | None |
| **TerminalMonitor** | 180 | Monitors terminal output | Test imports only | TerminalManager |
| **TerminalOutputMonitor** | 47 | Parses terminal output | Used by ActivityMonitor | None |

## 2. Functionality Overlap Analysis

### Redundant Features
- **Activity Tracking**: ActivityMonitor + InactivityMonitor + TerminalOutputMonitor (3 services for one job)
- **Health Monitoring**: SystemHealthMonitor + AgentHealthMonitor (2 services, similar purpose)
- **Terminal Monitoring**: TerminalMonitor + TerminalOutputMonitor (2 services, overlapping)

### Unique Features Worth Preserving
1. **Agent status detection** (active/waiting/thinking/inactive/stuck)
2. **Output parsing** for permission requests and completions
3. **Health checks** with recovery attempts
4. **Inactivity timeouts** with configurable thresholds
5. **System-wide component monitoring**

## 3. Dependency Graph

```
ActivityMonitor
├── TerminalOutputMonitor
└── InactivityMonitor

AgentHealthMonitor
├── EventBus
└── LoggingService

SystemHealthMonitor
├── LoggingService
├── EventBus
├── NaturalLanguageService
├── TerminalCommandRouter
└── AgentNotificationService

TerminalMonitor
└── TerminalManager

(TerminalOutputMonitor - standalone)
(InactivityMonitor - standalone)
```

## 4. Usage Analysis

### Actually Used (imported in production code)
- **ActivityMonitor** - Used by AgentLifecycleManager
- **AgentHealthMonitor** - Used by AgentManager
- **InactivityMonitor** - Used by ActivityMonitor
- **TerminalOutputMonitor** - Used by ActivityMonitor

### Never Used in Production
- **SystemHealthMonitor** - Only in tests (0% coverage)
- **TerminalMonitor** - Only in tests (0% coverage)

## 5. Consolidation Strategy

### Unified MonitoringService Design
```typescript
export class MonitoringService {
    // Core monitoring types
    private agentMonitors: Map<string, AgentMonitor>
    private systemHealth: SystemHealth
    
    // Unified methods
    monitorAgent(agentId: string): void
    getAgentStatus(agentId: string): AgentStatus
    checkSystemHealth(): HealthReport
    detectInactivity(agentId: string): InactivityStatus
    parseTerminalOutput(agentId: string, output: string): ParsedOutput
    
    // Event emitters
    onStatusChange: Event<StatusChangeEvent>
    onHealthIssue: Event<HealthIssueEvent>
    onInactivity: Event<InactivityEvent>
}
```

### Migration Plan
1. Create new `MonitoringService.ts`
2. Merge functionality from all 6 services
3. Use strategy pattern for different monitoring types
4. Update consumers (AgentManager, AgentLifecycleManager)
5. Delete old monitoring services

## 6. Benefits of Consolidation

### Before
- 6 separate services (836 total lines)
- Overlapping functionality
- Complex dependency chains
- Inconsistent interfaces

### After
- 1 unified service (~300 lines)
- Clear single responsibility
- Simplified dependencies
- Consistent monitoring API

## 7. Risk Assessment

### Low Risk
- All services have 0% test coverage
- Only 2 services actively used in production
- Clear migration path
- No breaking changes to external API

### Mitigation
- Keep same public methods during migration
- Test with existing consumers
- Add comprehensive tests for new service

## 8. Implementation Steps

1. **Create MonitoringService.ts** with unified interface
2. **Copy essential logic** from:
   - ActivityMonitor: Status detection
   - InactivityMonitor: Timeout detection
   - TerminalOutputMonitor: Output parsing
   - AgentHealthMonitor: Health checks
3. **Update consumers**:
   - AgentManager: Use MonitoringService
   - AgentLifecycleManager: Use MonitoringService
4. **Delete old services**:
   - ActivityMonitor.ts
   - SystemHealthMonitor.ts
   - AgentHealthMonitor.ts
   - InactivityMonitor.ts
   - TerminalMonitor.ts
   - TerminalOutputMonitor.ts

## Conclusion
The monitoring services show significant redundancy with 6 services doing overlapping work. Consolidating into a single MonitoringService will reduce code by ~500 lines while maintaining all functionality.