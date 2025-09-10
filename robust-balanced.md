---
name: robust
description: Make code stable and production-ready with appropriate error handling and validation
---

## Scope Determination

Analyzing scope based on command arguments: $ARGUMENTS

{{if contains $ARGUMENTS "--all"}}
**Mode: FULL CODEBASE ANALYSIS** 
Scanning entire project for stability improvements...
{{else}}
**Mode: RECENT CHANGES ONLY**
Focusing on recently modified code in the current session. I will:
1. Check files modified in the last commit or staging area
2. Analyze code you've recently shown me or discussed
3. Focus on the current working context

To analyze the entire codebase instead, use: `/robust --all`
{{/if}}

Make this code stable and production-ready with appropriate error handling and validation. Focus on **practical reliability** without over-engineering.

## Core Reliability Patterns

### 1. **Smart Error Handling**
- Add try-catch for operations that can reasonably fail
- Provide meaningful error messages to users
- Log errors with enough context for debugging
- **Avoid**: Wrapping every single operation in try-catch

### 2. **Input Validation** 
- Validate user inputs and external data
- Check for null/undefined where it matters
- Validate array bounds and object properties
- **Avoid**: Complex validation schemas for simple operations

### 3. **Resource Management**
- Clean up file handles, connections, timers
- Use proper disposal patterns (IDisposable, finally blocks)
- Avoid memory leaks with event listeners
- **Avoid**: Complex resource pooling for simple operations

### 4. **Graceful Degradation**
- Provide fallbacks for non-critical features
- Fail gracefully with user-friendly messages
- Continue working when possible, fail safely when not
- **Avoid**: Complex self-healing and recovery systems

## Context-Specific Patterns

### **VS Code Extensions**
- Simple error handling (no distributed patterns)
- Clear user notifications for failures  
- Proper cleanup on deactivation
- **Don't add**: Circuit breakers, retry queues, health checks

### **File Operations**
- Check file existence before operations
- Handle permission errors gracefully
- Clean up temporary files
- **Don't add**: Complex locking mechanisms

### **Network/API Calls**
- Basic timeout handling (5-30 seconds)
- Simple retry for transient failures (max 3 attempts)
- Handle network unavailable gracefully
- **Don't add**: Exponential backoff, circuit breakers

### **UI Components**
- Handle missing data gracefully
- Show loading states and error messages
- Validate form inputs before submission
- **Don't add**: Complex state machines

## Implementation Guidelines

### ✅ **DO ADD:**
- Basic null checks: `if (!value) return;`
- Try-catch for file/network operations
- Input validation for user data
- Clear error messages
- Resource cleanup (dispose, finally)
- Simple timeouts for async operations

### ❌ **DON'T ADD:**
- Circuit breaker patterns
- Dead letter queues  
- Exponential backoff retry logic
- Complex health check systems
- Self-healing mechanisms
- Enterprise monitoring patterns
- Performance metrics collection
- Distributed system patterns

## Decision Framework

**Ask yourself:**
1. **Can this operation reasonably fail?** → Add error handling
2. **Will users be confused if this fails silently?** → Add user feedback  
3. **Could invalid input break the system?** → Add validation
4. **Are we creating resources that need cleanup?** → Add disposal
5. **Is this a VS Code extension or distributed system?** → Choose appropriate patterns

**Target:** Stable code that handles real-world scenarios without unnecessary complexity.

## Command Completion

✅ `/robust $ARGUMENTS` command complete.

Summary: Applied practical reliability patterns with appropriate error handling and validation for the given context.