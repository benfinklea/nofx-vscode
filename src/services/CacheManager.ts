/**
 * Cache Manager for Performance Optimization
 */

export class CacheManager {
    private static caches = new Map<string, any>();
    private static timestamps = new Map<string, number>();
    private static readonly TTL = 5 * 60 * 1000; // 5 minutes

    static get<T>(key: string): T | undefined {
        const timestamp = this.timestamps.get(key);
        if (timestamp && Date.now() - timestamp > this.TTL) {
            this.invalidate(key);
            return undefined;
        }
        return this.caches.get(key);
    }

    static set<T>(key: string, value: T): void {
        this.caches.set(key, value);
        this.timestamps.set(key, Date.now());
    }

    static invalidate(key: string): void {
        this.caches.delete(key);
        this.timestamps.delete(key);
    }

    static clear(): void {
        this.caches.clear();
        this.timestamps.clear();
    }

    static memoize<T extends (...args: any[]) => any>(fn: T, keyGenerator?: (...args: Parameters<T>) => string): T {
        return ((...args: Parameters<T>) => {
            const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
            const cached = this.get(key);
            if (cached !== undefined) {
                return cached;
            }
            const result = fn(...args);
            this.set(key, result);
            return result;
        }) as T;
    }
}
