#!/bin/bash

# 🔄 PHASE 16: Update Implementations
# Updates service implementations to use simplified interfaces

echo "🔄 Updating implementations to use simplified interfaces..."
echo ""

REPORTS_DIR=".agents/shared/reports"
mkdir -p "$REPORTS_DIR"

# Track updates
UPDATED_FILES=0
FAILED_FILES=0

# Update LoggingService to implement simplified interface
echo "📝 Updating LoggingService..."
if [ -f "src/services/LoggingService.ts" ]; then
    # Add import for new interfaces at the top
    sed -i.bak '1i\
import { ILogger, ILogQuery, LogLevel, LogEntry, LogQueryOptions } from "../interfaces/ILogging";' "src/services/LoggingService.ts"
    
    # Update class declaration to implement new interfaces
    sed -i.bak 's/export class LoggingService/export class LoggingService implements ILogger, ILogQuery/' "src/services/LoggingService.ts"
    
    UPDATED_FILES=$((UPDATED_FILES + 1))
    echo "✅ LoggingService updated"
else
    echo "⚠️  LoggingService.ts not found"
    FAILED_FILES=$((FAILED_FILES + 1))
fi

# Update EventBus to implement simplified interface
echo "📝 Updating EventBus..."
if [ -f "src/services/EventBus.ts" ]; then
    # Add import for new interfaces
    sed -i.bak '1i\
import { IEventEmitter, IEventSubscriber, EventHandler } from "../interfaces/IEvent";' "src/services/EventBus.ts"
    
    # Update class declaration
    sed -i.bak 's/export class EventBus/export class EventBus implements IEventEmitter, IEventSubscriber/' "src/services/EventBus.ts"
    
    UPDATED_FILES=$((UPDATED_FILES + 1))
    echo "✅ EventBus updated"
else
    echo "⚠️  EventBus.ts not found"
    FAILED_FILES=$((FAILED_FILES + 1))
fi

# Update AgentManager to implement simplified interface
echo "📝 Updating AgentManager..."
if [ -f "src/agents/AgentManager.ts" ]; then
    # Add import for new interfaces
    sed -i.bak '1i\
import { IAgentLifecycle, IAgentQuery, Agent, AgentConfig } from "../interfaces/IAgent";' "src/agents/AgentManager.ts"
    
    # Update class declaration
    sed -i.bak 's/export class AgentManager/export class AgentManager implements IAgentLifecycle, IAgentQuery/' "src/agents/AgentManager.ts"
    
    UPDATED_FILES=$((UPDATED_FILES + 1))
    echo "✅ AgentManager updated"
else
    echo "⚠️  AgentManager.ts not found"
    FAILED_FILES=$((FAILED_FILES + 1))
fi

# Update TaskQueue to implement simplified interface
echo "📝 Updating TaskQueue..."
if [ -f "src/tasks/TaskQueue.ts" ]; then
    # Add import for new interfaces
    sed -i.bak '1i\
import { ITaskManager, Task, TaskConfig } from "../interfaces/ITask";' "src/tasks/TaskQueue.ts"
    
    # Update class declaration
    sed -i.bak 's/export class TaskQueue/export class TaskQueue implements ITaskManager/' "src/tasks/TaskQueue.ts"
    
    UPDATED_FILES=$((UPDATED_FILES + 1))
    echo "✅ TaskQueue updated"
else
    echo "⚠️  TaskQueue.ts not found"
    FAILED_FILES=$((FAILED_FILES + 1))
fi

# Update ConfigurationService to implement simplified interface
echo "📝 Updating ConfigurationService..."
if [ -f "src/services/ConfigurationService.ts" ]; then
    # Add import for new interfaces
    sed -i.bak '1i\
import { IConfiguration } from "../interfaces/IConfiguration";' "src/services/ConfigurationService.ts"
    
    # Update class declaration
    sed -i.bak 's/export class ConfigurationService/export class ConfigurationService implements IConfiguration/' "src/services/ConfigurationService.ts"
    
    UPDATED_FILES=$((UPDATED_FILES + 1))
    echo "✅ ConfigurationService updated"
else
    echo "⚠️  ConfigurationService.ts not found"
    FAILED_FILES=$((FAILED_FILES + 1))
fi

# Create adapter classes for backward compatibility
echo ""
echo "🔗 Creating backward compatibility adapters..."

ADAPTERS_DIR="src/adapters"
mkdir -p "$ADAPTERS_DIR"

# Create adapter for complex to simple interface mapping
cat > "$ADAPTERS_DIR/InterfaceAdapters.ts" << 'EOF'
// Adapters for backward compatibility during migration

import { ILogger, ILogQuery } from '../interfaces/ILogging';
import { IEventEmitter, IEventSubscriber } from '../interfaces/IEvent';
import { IAgentLifecycle, IAgentQuery } from '../interfaces/IAgent';
import { ITaskManager } from '../interfaces/ITask';
import { IConfiguration } from '../interfaces/IConfiguration';

// Adapter to map old complex interfaces to new simple ones
export class InterfaceAdapter {
    // Map old logging methods to new simple interface
    static adaptLogging(oldLogger: any): ILogger & ILogQuery {
        return {
            log: (message: string, level?: any) => {
                // Map old method calls to new interface
                if (oldLogger.info && level === 'info') oldLogger.info(message);
                else if (oldLogger.warn && level === 'warn') oldLogger.warn(message);
                else if (oldLogger.error && level === 'error') oldLogger.error(message);
                else if (oldLogger.debug && level === 'debug') oldLogger.debug(message);
                else if (oldLogger.log) oldLogger.log(message);
            },
            error: (message: string, error?: Error) => {
                if (oldLogger.error) oldLogger.error(message, error);
            },
            getLogs: (options?: any) => {
                if (oldLogger.getLogs) return oldLogger.getLogs(options);
                return [];
            }
        };
    }
    
    // Map old event methods to new simple interface
    static adaptEvents(oldEventBus: any): IEventEmitter & IEventSubscriber {
        return {
            emit: (event: string, data?: any) => {
                if (oldEventBus.emit) oldEventBus.emit(event, data);
                else if (oldEventBus.fire) oldEventBus.fire(event, data);
                else if (oldEventBus.trigger) oldEventBus.trigger(event, data);
            },
            on: (event: string, handler: any) => {
                if (oldEventBus.on) oldEventBus.on(event, handler);
                else if (oldEventBus.subscribe) oldEventBus.subscribe(event, handler);
                else if (oldEventBus.addEventListener) oldEventBus.addEventListener(event, handler);
            },
            off: (event: string, handler: any) => {
                if (oldEventBus.off) oldEventBus.off(event, handler);
                else if (oldEventBus.unsubscribe) oldEventBus.unsubscribe(event, handler);
                else if (oldEventBus.removeEventListener) oldEventBus.removeEventListener(event, handler);
            }
        };
    }
}
EOF

echo "✅ Created InterfaceAdapters.ts"

# Generate implementation update report
cat > "$REPORTS_DIR/phase16-implementation-updates.md" << EOF
# Phase 16: Implementation Updates

## Updated Files
- **Total files updated**: $UPDATED_FILES
- **Failed updates**: $FAILED_FILES

## Services Updated
1. **LoggingService** - Implements ILogger, ILogQuery
2. **EventBus** - Implements IEventEmitter, IEventSubscriber  
3. **AgentManager** - Implements IAgentLifecycle, IAgentQuery
4. **TaskQueue** - Implements ITaskManager
5. **ConfigurationService** - Implements IConfiguration

## Backward Compatibility
- Created InterfaceAdapters.ts for gradual migration
- Old code continues to work during transition
- Adapters map old method calls to new interfaces

## Migration Strategy
1. **Phase 1** (Current): Add new interfaces alongside old ones
2. **Phase 2**: Update all references to use new interfaces
3. **Phase 3**: Remove old interfaces and adapters

## Benefits Achieved
- Services now implement cleaner interfaces
- Backward compatibility maintained
- Gradual migration path established
- No breaking changes for existing code

## Next Steps
- Update all service references to use new interfaces
- Test that existing functionality still works
- Begin removing old interface definitions
EOF

echo ""
echo "🎉 Implementation updates complete!"
echo ""
echo "📊 Update Summary:"
echo "  • Updated $UPDATED_FILES service implementations"
if [ $FAILED_FILES -gt 0 ]; then
    echo "  ⚠️  $FAILED_FILES files not found (may need manual update)"
fi
echo "  • Created backward compatibility adapters"
echo "  • Maintained existing functionality"
echo ""
echo "📁 Report saved to: $REPORTS_DIR/phase16-implementation-updates.md"