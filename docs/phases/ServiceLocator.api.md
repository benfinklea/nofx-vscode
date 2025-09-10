# 📚 ServiceLocator API Documentation

## Class: ServiceLocator

Simple service registry for dependency management.

### Static Methods

#### `initialize(context: vscode.ExtensionContext): void`
Initialize the service locator with VS Code context.

**Parameters:**
- `context` - VS Code extension context

**Example:**
```typescript
ServiceLocator.initialize(context);
```

#### `register<T>(name: string, instance: T): void`
Register a service instance with a string name.

**Parameters:**
- `name` - Service name (human-readable string)
- `instance` - Service instance

**Example:**
```typescript
const logger = new LoggingService();
ServiceLocator.register('LoggingService', logger);
```

#### `get<T>(name: string): T`
Get a service by name. Throws if not found.

**Parameters:**
- `name` - Service name

**Returns:**
- Service instance

**Throws:**
- `Error` if service not found

**Example:**
```typescript
const logger = ServiceLocator.get<ILoggingService>('LoggingService');
```

#### `tryGet<T>(name: string): T | undefined`
Try to get a service by name. Returns undefined if not found.

**Parameters:**
- `name` - Service name

**Returns:**
- Service instance or undefined

**Example:**
```typescript
const optional = ServiceLocator.tryGet<IOptionalService>('OptionalService');
if (optional) {
    optional.doSomething();
}
```

#### `clear(): void`
Clear all registered services. Useful for testing.

**Example:**
```typescript
ServiceLocator.clear(); // Clean slate for tests
```

#### `listServices(): string[]`
List all registered service names. Useful for debugging.

**Returns:**
- Array of service names

**Example:**
```typescript
console.log('Available services:', ServiceLocator.listServices());
```
