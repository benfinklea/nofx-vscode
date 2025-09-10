# Interface Migration Guide

## Quick Reference

| Old Interface | New Interface(s) | Key Changes |
|--------------|------------------|-------------|
| ILoggingService | ILogger, ILogQuery | Split into focused interfaces |
| IEventBus | IEventEmitter, IEventSubscriber | Separated emit from subscribe |
| IAgentManager | IAgentLifecycle, IAgentQuery | Split lifecycle from queries |
| ITaskQueue | ITaskManager | Simplified to 3 core methods |
| IConfigurationService | IConfiguration | Single get/set/has pattern |

## Code Migration Examples

### Before (Complex)
```typescript
import { ILoggingService } from './services/interfaces';

class MyService {
    constructor(private logger: ILoggingService) {}
    
    doWork() {
        this.logger.logInfo('Starting work');
        this.logger.logError('Error occurred', error);
        this.logger.logDebug('Debug info');
    }
}
```

### After (Simple)
```typescript
import { ILogger } from '../interfaces';

class MyService {
    constructor(private logger: ILogger) {}
    
    doWork() {
        this.logger.log('Starting work', 'info');
        this.logger.error('Error occurred', error);
        this.logger.log('Debug info', 'debug');
    }
}
```

## Benefits
- **72% fewer methods** to implement
- **Clearer responsibilities** for each interface
- **Easier to test** with focused interfaces
- **Better for entrepreneurs** - simpler to understand
