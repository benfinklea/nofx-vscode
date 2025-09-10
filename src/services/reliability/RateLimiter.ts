/**
 * Enterprise-Grade Rate Limiter with Token Bucket Algorithm
 *
 * Production-ready rate limiting with multiple strategies,
 * distributed rate limiting support, and comprehensive monitoring.
 */

export enum RateLimitStrategy {
    TOKEN_BUCKET = 'TOKEN_BUCKET', // Token bucket algorithm
    SLIDING_WINDOW = 'SLIDING_WINDOW', // Sliding window log
    FIXED_WINDOW = 'FIXED_WINDOW', // Fixed window counter
    LEAKY_BUCKET = 'LEAKY_BUCKET' // Leaky bucket algorithm
}

export interface RateLimitConfig {
    strategy?: RateLimitStrategy;
    maxRequests?: number;
    windowMs?: number;
    blockDurationMs?: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    keyGenerator?: (context: any) => string;
    onLimitReached?: (key: string, retryAfter: number) => void;
    distributed?: boolean;
    redis?: any; // Redis client for distributed rate limiting
}

interface RateLimitEntry {
    tokens: number;
    lastRefill: number;
    requests: number[];
    blocked: boolean;
    blockUntil: number;
}

interface RateLimitMetrics {
    totalRequests: number;
    allowedRequests: number;
    blockedRequests: number;
    currentlyBlocked: number;
    averageTokensUsed: number;
}

/**
 * Production-ready rate limiter with multiple strategies
 */
export class RateLimiter {
    private readonly config: Required<Omit<RateLimitConfig, 'redis' | 'onLimitReached'>>;
    private readonly store: Map<string, RateLimitEntry> = new Map();
    private readonly metrics: RateLimitMetrics = {
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
        currentlyBlocked: 0,
        averageTokensUsed: 0
    };

    private cleanupInterval: NodeJS.Timeout;
    private readonly onLimitReached?: (key: string, retryAfter: number) => void;
    private readonly redis?: any;

    constructor(config: RateLimitConfig = {}) {
        this.config = {
            strategy: config.strategy ?? RateLimitStrategy.TOKEN_BUCKET,
            maxRequests: config.maxRequests ?? 100,
            windowMs: config.windowMs ?? 60000, // 1 minute
            blockDurationMs: config.blockDurationMs ?? 60000, // 1 minute
            skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
            skipFailedRequests: config.skipFailedRequests ?? true,
            keyGenerator: config.keyGenerator ?? (() => 'default'),
            distributed: config.distributed ?? false
        };

        this.onLimitReached = config.onLimitReached;
        this.redis = config.redis;

        // Validate configuration
        this.validateConfig();

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanup(), 10000);
    }

    /**
     * Check if request is allowed
     */
    async isAllowed(context?: any, cost: number = 1): Promise<{ allowed: boolean; retryAfter?: number }> {
        const key = this.config.keyGenerator(context);
        this.metrics.totalRequests++;

        if (this.config.distributed && this.redis) {
            return this.checkDistributed(key, cost);
        }

        return this.checkLocal(key, cost);
    }

    /**
     * Consume tokens for a request
     */
    async consume(context?: any, cost: number = 1, success: boolean = true): Promise<boolean> {
        // Skip based on configuration
        if (success && this.config.skipSuccessfulRequests) {
            return true;
        }
        if (!success && this.config.skipFailedRequests) {
            return true;
        }

        const result = await this.isAllowed(context, cost);

        if (!result.allowed && this.onLimitReached) {
            const key = this.config.keyGenerator(context);
            this.onLimitReached(key, result.retryAfter || 0);
        }

        return result.allowed;
    }

    /**
     * Check rate limit locally
     */
    private checkLocal(key: string, cost: number): { allowed: boolean; retryAfter?: number } {
        const now = Date.now();
        let entry = this.store.get(key);

        if (!entry) {
            entry = this.createEntry(now);
            this.store.set(key, entry);
        }

        // Check if blocked
        if (entry.blocked && now < entry.blockUntil) {
            this.metrics.blockedRequests++;
            return {
                allowed: false,
                retryAfter: entry.blockUntil - now
            };
        }

        // Unblock if block period expired
        if (entry.blocked && now >= entry.blockUntil) {
            entry.blocked = false;
            entry.blockUntil = 0;
            this.metrics.currentlyBlocked--;
        }

        // Apply strategy
        const result = this.applyStrategy(entry, now, cost);

        if (result.allowed) {
            this.metrics.allowedRequests++;
        } else {
            this.metrics.blockedRequests++;

            // Block the key
            entry.blocked = true;
            entry.blockUntil = now + this.config.blockDurationMs;
            this.metrics.currentlyBlocked++;
        }

        return result;
    }

    /**
     * Check rate limit with distributed store
     */
    private async checkDistributed(key: string, cost: number): Promise<{ allowed: boolean; retryAfter?: number }> {
        if (!this.redis) {
            return this.checkLocal(key, cost);
        }

        try {
            const now = Date.now();
            const redisKey = `ratelimit:${key}`;

            // Use Redis Lua script for atomic operations
            const luaScript = `
                local key = KEYS[1]
                local max_requests = tonumber(ARGV[1])
                local window_ms = tonumber(ARGV[2])
                local now = tonumber(ARGV[3])
                local cost = tonumber(ARGV[4])
                
                local current = redis.call('GET', key)
                if current == false then
                    redis.call('SET', key, cost, 'PX', window_ms)
                    return 1
                end
                
                current = tonumber(current)
                if current + cost <= max_requests then
                    redis.call('INCRBY', key, cost)
                    return 1
                else
                    local ttl = redis.call('PTTL', key)
                    return {0, ttl}
                end
            `;

            const result = await this.redis.eval(
                luaScript,
                1,
                redisKey,
                this.config.maxRequests,
                this.config.windowMs,
                now,
                cost
            );

            if (result === 1) {
                this.metrics.allowedRequests++;
                return { allowed: true };
            } else {
                this.metrics.blockedRequests++;
                return {
                    allowed: false,
                    retryAfter: result[1] || this.config.windowMs
                };
            }
        } catch (error) {
            console.error('[RateLimiter] Distributed check failed, falling back to local:', error);
            return this.checkLocal(key, cost);
        }
    }

    /**
     * Apply rate limiting strategy
     */
    private applyStrategy(entry: RateLimitEntry, now: number, cost: number): { allowed: boolean; retryAfter?: number } {
        switch (this.config.strategy) {
            case RateLimitStrategy.TOKEN_BUCKET:
                return this.tokenBucketStrategy(entry, now, cost);

            case RateLimitStrategy.SLIDING_WINDOW:
                return this.slidingWindowStrategy(entry, now, cost);

            case RateLimitStrategy.FIXED_WINDOW:
                return this.fixedWindowStrategy(entry, now, cost);

            case RateLimitStrategy.LEAKY_BUCKET:
                return this.leakyBucketStrategy(entry, now, cost);

            default:
                return this.tokenBucketStrategy(entry, now, cost);
        }
    }

    /**
     * Token bucket algorithm
     */
    private tokenBucketStrategy(
        entry: RateLimitEntry,
        now: number,
        cost: number
    ): { allowed: boolean; retryAfter?: number } {
        // Refill tokens based on time elapsed
        const elapsed = now - entry.lastRefill;
        const tokensToAdd = Math.floor((elapsed * this.config.maxRequests) / this.config.windowMs);

        if (tokensToAdd > 0) {
            entry.tokens = Math.min(this.config.maxRequests, entry.tokens + tokensToAdd);
            entry.lastRefill = now;
        }

        // Check if enough tokens
        if (entry.tokens >= cost) {
            entry.tokens -= cost;
            return { allowed: true };
        }

        // Calculate retry after
        const tokensNeeded = cost - entry.tokens;
        const retryAfter = Math.ceil((tokensNeeded * this.config.windowMs) / this.config.maxRequests);

        return {
            allowed: false,
            retryAfter
        };
    }

    /**
     * Sliding window log algorithm
     */
    private slidingWindowStrategy(
        entry: RateLimitEntry,
        now: number,
        cost: number
    ): { allowed: boolean; retryAfter?: number } {
        // Remove old requests outside window
        const windowStart = now - this.config.windowMs;
        entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

        // Check if under limit
        if (entry.requests.length + cost <= this.config.maxRequests) {
            // Add new requests
            for (let i = 0; i < cost; i++) {
                entry.requests.push(now);
            }
            return { allowed: true };
        }

        // Calculate retry after
        const oldestRequest = entry.requests[0];
        const retryAfter = oldestRequest ? oldestRequest + this.config.windowMs - now : 0;

        return {
            allowed: false,
            retryAfter: Math.max(0, retryAfter)
        };
    }

    /**
     * Fixed window counter algorithm
     */
    private fixedWindowStrategy(
        entry: RateLimitEntry,
        now: number,
        cost: number
    ): { allowed: boolean; retryAfter?: number } {
        // Reset window if expired
        if (now - entry.lastRefill >= this.config.windowMs) {
            entry.tokens = 0;
            entry.lastRefill = now;
        }

        // Check if under limit
        if (entry.tokens + cost <= this.config.maxRequests) {
            entry.tokens += cost;
            return { allowed: true };
        }

        // Calculate retry after
        const retryAfter = this.config.windowMs - (now - entry.lastRefill);

        return {
            allowed: false,
            retryAfter: Math.max(0, retryAfter)
        };
    }

    /**
     * Leaky bucket algorithm
     */
    private leakyBucketStrategy(
        entry: RateLimitEntry,
        now: number,
        cost: number
    ): { allowed: boolean; retryAfter?: number } {
        // Leak tokens based on time elapsed
        const elapsed = now - entry.lastRefill;
        const tokensToLeak = Math.floor((elapsed * this.config.maxRequests) / this.config.windowMs);

        if (tokensToLeak > 0) {
            entry.tokens = Math.max(0, entry.tokens - tokensToLeak);
            entry.lastRefill = now;
        }

        // Check if bucket has space
        if (entry.tokens + cost <= this.config.maxRequests) {
            entry.tokens += cost;
            return { allowed: true };
        }

        // Calculate retry after
        const overflow = entry.tokens + cost - this.config.maxRequests;
        const retryAfter = Math.ceil((overflow * this.config.windowMs) / this.config.maxRequests);

        return {
            allowed: false,
            retryAfter
        };
    }

    /**
     * Create new rate limit entry
     */
    private createEntry(now: number): RateLimitEntry {
        return {
            tokens: this.config.maxRequests,
            lastRefill: now,
            requests: [],
            blocked: false,
            blockUntil: 0
        };
    }

    /**
     * Clean up old entries
     */
    private cleanup(): void {
        const now = Date.now();
        const expiredThreshold = now - this.config.windowMs * 2;

        for (const [key, entry] of this.store.entries()) {
            // Remove if no recent activity
            if (entry.lastRefill < expiredThreshold && entry.requests.length === 0 && !entry.blocked) {
                this.store.delete(key);
            }

            // Clean old requests in sliding window
            if (this.config.strategy === RateLimitStrategy.SLIDING_WINDOW) {
                const windowStart = now - this.config.windowMs;
                entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
            }
        }
    }

    /**
     * Validate configuration
     */
    private validateConfig(): void {
        if (this.config.maxRequests < 1) {
            throw new Error('maxRequests must be at least 1');
        }

        if (this.config.windowMs < 1000) {
            console.warn('[RateLimiter] Very small window size may cause performance issues');
        }

        if (this.config.distributed && !this.redis) {
            console.warn('[RateLimiter] Distributed mode enabled but no Redis client provided');
        }
    }

    /**
     * Reset rate limit for a key
     */
    reset(context?: any): void {
        const key = this.config.keyGenerator(context);
        this.store.delete(key);

        if (this.config.distributed && this.redis) {
            const redisKey = `ratelimit:${key}`;
            this.redis.del(redisKey).catch((error: any) => {
                console.error('[RateLimiter] Failed to reset distributed key:', error);
            });
        }
    }

    /**
     * Get metrics
     */
    getMetrics(): Readonly<RateLimitMetrics> {
        return { ...this.metrics };
    }

    /**
     * Dispose rate limiter
     */
    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.store.clear();
    }

    /**
     * Create rate limiter for API endpoints
     */
    static forAPI(overrides?: RateLimitConfig): RateLimiter {
        return new RateLimiter({
            strategy: RateLimitStrategy.TOKEN_BUCKET,
            maxRequests: 100,
            windowMs: 60000, // 100 requests per minute
            blockDurationMs: 300000, // 5 minute block
            skipFailedRequests: false,
            keyGenerator: context => context?.ip || 'unknown',
            ...overrides
        });
    }

    /**
     * Create rate limiter for user actions
     */
    static forUser(overrides?: RateLimitConfig): RateLimiter {
        return new RateLimiter({
            strategy: RateLimitStrategy.SLIDING_WINDOW,
            maxRequests: 1000,
            windowMs: 3600000, // 1000 requests per hour
            blockDurationMs: 3600000, // 1 hour block
            skipSuccessfulRequests: false,
            keyGenerator: context => context?.userId || 'anonymous',
            ...overrides
        });
    }

    /**
     * Create rate limiter for expensive operations
     */
    static forExpensiveOps(overrides?: RateLimitConfig): RateLimiter {
        return new RateLimiter({
            strategy: RateLimitStrategy.LEAKY_BUCKET,
            maxRequests: 10,
            windowMs: 60000, // 10 operations per minute
            blockDurationMs: 600000, // 10 minute block
            skipFailedRequests: true,
            keyGenerator: context => context?.operation || 'default',
            ...overrides
        });
    }
}
