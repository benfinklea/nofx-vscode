/**
 * Memory Optimization Utilities
 */
import * as vscode from 'vscode';

// Type declaration for WeakRef if not available
declare global {
    var WeakRef: {
        new <T extends object>(target: T): WeakRef<T>;
    };
    interface WeakRef<T extends object> {
        deref(): T | undefined;
    }
}

export class MemoryOptimizer {
    private static weakRefs = new WeakMap();
    private static disposables: vscode.Disposable[] = [];

    /**
     * Use weak references for large objects
     */
    static weakRef<T extends object>(obj: T): WeakRef<T> | T {
        // Check if WeakRef is available
        if (typeof WeakRef !== 'undefined') {
            const ref = new WeakRef(obj);
            this.weakRefs.set(ref, Date.now());
            return ref;
        } else {
            // Fallback to regular reference if WeakRef is not available
            return obj;
        }
    }

    /**
     * Cleanup unused references
     */
    static cleanup(): void {
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        // Clear disposables
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }

    /**
     * Monitor memory usage
     */
    static getMemoryUsage(): NodeJS.MemoryUsage {
        return process.memoryUsage();
    }

    /**
     * Auto-cleanup when memory is high
     */
    static startAutoCleanup(threshold = 100 * 1024 * 1024): void {
        setInterval(() => {
            const usage = this.getMemoryUsage();
            if (usage.heapUsed > threshold) {
                console.warn('High memory usage detected, running cleanup...');
                this.cleanup();
            }
        }, 30000); // Check every 30 seconds
    }
}
