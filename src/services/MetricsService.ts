import { IMetricsService, MetricType, MetricData, IConfigurationService, ILoggingService, IEventBus, METRICS_CONFIG_KEYS } from './interfaces';

export class MetricsService implements IMetricsService {
    private metrics: MetricData[] = [];
    private timers: Map<string, { name: string; startTime: number; tags?: Record<string, string> }> = new Map();
    private configService: IConfigurationService;
    private logger: ILoggingService;
    private eventBus?: IEventBus;
    private retentionHours: number = 24;
    private cleanupInterval?: NodeJS.Timeout;
    private isEnabled: boolean = false;
    private outputLevel: 'none' | 'basic' | 'detailed' = 'basic';

    constructor(configService: IConfigurationService, logger: ILoggingService, eventBus?: IEventBus) {
        this.configService = configService;
        this.logger = logger;
        this.eventBus = eventBus;
        
        this.initializeConfiguration();
        this.startCleanupTimer();
        
        // Collect initial system metrics
        this.collectSystemMetrics();
        
        this.logger.debug('MetricsService initialized', { 
            enabled: this.isEnabled, 
            outputLevel: this.outputLevel,
            retentionHours: this.retentionHours 
        });
    }

    private initializeConfiguration(): void {
        try {
            this.isEnabled = this.configService.get<boolean>(METRICS_CONFIG_KEYS.ENABLE_METRICS, false);
            this.outputLevel = this.configService.get<'none' | 'basic' | 'detailed'>(METRICS_CONFIG_KEYS.METRICS_OUTPUT_LEVEL, 'basic');
            this.retentionHours = this.configService.get<number>(METRICS_CONFIG_KEYS.METRICS_RETENTION_HOURS, 24);
        } catch (error) {
            this.logger.warn('Failed to initialize configuration, using defaults', { error: error instanceof Error ? error.message : String(error) });
            this.isEnabled = false;
            this.outputLevel = 'basic';
            this.retentionHours = 24;
        }
        
        // Listen for configuration changes
        this.configService.onDidChange((e) => {
            if (e.affectsConfiguration('nofx.enableMetrics')) {
                this.isEnabled = this.configService.get<boolean>(METRICS_CONFIG_KEYS.ENABLE_METRICS, false);
                this.logger.debug('Metrics collection toggled', { enabled: this.isEnabled });
            }
            if (e.affectsConfiguration('nofx.metricsOutputLevel')) {
                this.outputLevel = this.configService.get<'none' | 'basic' | 'detailed'>(METRICS_CONFIG_KEYS.METRICS_OUTPUT_LEVEL, 'basic');
                this.logger.debug('Metrics output level changed', { level: this.outputLevel });
            }
        });
    }

    incrementCounter(name: string, tags?: Record<string, string>): void {
        if (!this.isEnabled) return;
        
        this.addMetric({
            name,
            type: MetricType.COUNTER,
            value: 1,
            tags,
            timestamp: new Date()
        });
        
        try {
            this.eventBus?.publish('metrics.counter.incremented', { name, tags });
        } catch (error) {
            this.logger.warn('Failed to publish counter event', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    recordDuration(name: string, duration: number, tags?: Record<string, string>): void {
        if (!this.isEnabled) return;
        
        this.addMetric({
            name,
            type: MetricType.HISTOGRAM,
            value: duration,
            tags,
            timestamp: new Date()
        });
        
        try {
            this.eventBus?.publish('metrics.duration.recorded', { name, duration, tags });
        } catch (error) {
            this.logger.warn('Failed to publish duration event', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    setGauge(name: string, value: number, tags?: Record<string, string>): void {
        if (!this.isEnabled) return;
        
        this.addMetric({
            name,
            type: MetricType.GAUGE,
            value,
            tags,
            timestamp: new Date()
        });
        
        try {
            this.eventBus?.publish('metrics.gauge.set', { name, value, tags });
        } catch (error) {
            this.logger.warn('Failed to publish gauge event', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    startTimer(name: string): string {
        if (!this.isEnabled) return '';
        
        const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.timers.set(timerId, { name, startTime: Date.now() });
        
        this.logger.debug('Timer started', { timerId, name });
        return timerId;
    }

    endTimer(timerId: string): void {
        if (!this.isEnabled || !timerId) return;
        
        const timer = this.timers.get(timerId);
        if (!timer) {
            this.logger.warn('Timer not found', { timerId });
            return;
        }
        
        const { name, startTime, tags } = timer;
        const duration = Date.now() - startTime;
        this.recordDuration(name, duration, tags);
        
        this.timers.delete(timerId);
        this.logger.debug('Timer ended', { timerId, duration });
    }

    getMetrics(): MetricData[] {
        return [...this.metrics];
    }

    resetMetrics(): void {
        this.metrics = [];
        this.timers.clear();
        this.logger.info('Metrics reset');
        try {
            this.eventBus?.publish('metrics.reset', {});
        } catch (error) {
            this.logger.warn('Failed to publish reset event', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    exportMetrics(format: 'json' | 'csv' = 'json'): string {
        if (format === 'json') {
            return JSON.stringify({
                timestamp: new Date().toISOString(),
                metrics: this.metrics,
                summary: this.getMetricsSummary()
            }, null, 2);
        } else {
            return this.exportAsCSV();
        }
    }

    private addMetric(metric: MetricData): void {
        this.metrics.push(metric);
        
        // Log metrics based on output level
        if (this.outputLevel === 'detailed') {
            this.logger.debug('Metric recorded', metric);
        } else if (this.outputLevel === 'basic' && metric.type === MetricType.COUNTER) {
            this.logger.debug('Counter incremented', { name: metric.name, value: metric.value });
        }
        
        // Publish metric event
        try {
            this.eventBus?.publish('metrics.recorded', metric);
        } catch (error) {
            this.logger.warn('Failed to publish metric event', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    private exportAsCSV(): string {
        if (this.metrics.length === 0) {
            return 'timestamp,name,type,value,tags\n';
        }
        
        const headers = 'timestamp,name,type,value,tags\n';
        const rows = this.metrics.map(metric => {
            const tags = metric.tags ? JSON.stringify(metric.tags) : '';
            return `${metric.timestamp.toISOString()},${metric.name},${metric.type},${metric.value},"${tags}"`;
        }).join('\n');
        
        return headers + rows;
    }

    private getMetricsSummary(): Record<string, any> {
        const summary: Record<string, any> = {
            totalMetrics: this.metrics.length,
            metricsByType: {},
            timeRange: {
                earliest: null as Date | null,
                latest: null as Date | null
            }
        };
        
        // Group metrics by type
        this.metrics.forEach(metric => {
            if (!summary.metricsByType[metric.type]) {
                summary.metricsByType[metric.type] = 0;
            }
            summary.metricsByType[metric.type]++;
            
            // Track time range
            if (!summary.timeRange.earliest || metric.timestamp < summary.timeRange.earliest) {
                summary.timeRange.earliest = metric.timestamp;
            }
            if (!summary.timeRange.latest || metric.timestamp > summary.timeRange.latest) {
                summary.timeRange.latest = metric.timestamp;
            }
        });
        
        // Calculate averages for histograms
        const histograms = this.metrics.filter(m => m.type === MetricType.HISTOGRAM);
        if (histograms.length > 0) {
            const totalDuration = histograms.reduce((sum, m) => sum + m.value, 0);
            summary.averageDuration = totalDuration / histograms.length;
        }
        
        return summary;
    }

    private startCleanupTimer(): void {
        // Clean up old metrics every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
            // Also collect system metrics during cleanup
            this.collectSystemMetrics();
        }, 60 * 60 * 1000); // 1 hour
    }

    private cleanupOldMetrics(): void {
        const cutoffTime = new Date(Date.now() - (this.retentionHours * 60 * 60 * 1000));
        const initialCount = this.metrics.length;
        
        this.metrics = this.metrics.filter(metric => metric.timestamp > cutoffTime);
        
        const removedCount = initialCount - this.metrics.length;
        if (removedCount > 0) {
            this.logger.debug('Cleaned up old metrics', { 
                removed: removedCount, 
                remaining: this.metrics.length,
                retentionHours: this.retentionHours 
            });
        }
    }

    // System metrics collection
    private collectSystemMetrics(): void {
        if (!this.isEnabled || this.outputLevel === 'none') return;
        
        // Memory usage
        const memUsage = process.memoryUsage();
        this.setGauge('system.memory.heap.used', memUsage.heapUsed, { unit: 'bytes' });
        this.setGauge('system.memory.heap.total', memUsage.heapTotal, { unit: 'bytes' });
        this.setGauge('system.memory.external', memUsage.external, { unit: 'bytes' });
        
        // Event loop lag (if available)
        if (typeof process.hrtime === 'function') {
            const start = process.hrtime();
            setImmediate(() => {
                const delta = process.hrtime(start);
                const lag = delta[0] * 1000 + delta[1] / 1000000; // Convert to milliseconds
                this.setGauge('system.eventloop.lag', lag, { unit: 'ms' });
            });
        }
    }

    // Performance monitoring for high-frequency events
    private shouldSampleMetric(name: string): boolean {
        // Sample high-frequency metrics to avoid performance impact
        const highFrequencyMetrics = ['message.received', 'message.sent', 'heartbeat.sent'];
        return !highFrequencyMetrics.includes(name) || Math.random() < 0.1; // 10% sampling
    }

    // Get metrics dashboard data
    getDashboardData(): Record<string, any> {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        
        const recentMetrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
        
        return {
            enabled: this.isEnabled,
            outputLevel: this.outputLevel,
            totalMetrics: this.metrics.length,
            recentMetrics: recentMetrics.length,
            metricsByType: this.getMetricsSummary().metricsByType,
            topCounters: this.getTopCounters(recentMetrics),
            averageDurations: this.getAverageDurations(recentMetrics),
            systemMetrics: this.getSystemMetrics()
        };
    }

    private getTopCounters(metrics: MetricData[]): Array<{ name: string; count: number }> {
        const counterMap = new Map<string, number>();
        
        metrics
            .filter(m => m.type === MetricType.COUNTER)
            .forEach(m => {
                const current = counterMap.get(m.name) || 0;
                counterMap.set(m.name, current + m.value);
            });
        
        return Array.from(counterMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }

    private getAverageDurations(metrics: MetricData[]): Array<{ name: string; average: number }> {
        const durationMap = new Map<string, { total: number; count: number }>();
        
        metrics
            .filter(m => m.type === MetricType.HISTOGRAM)
            .forEach(m => {
                const current = durationMap.get(m.name) || { total: 0, count: 0 };
                current.total += m.value;
                current.count += 1;
                durationMap.set(m.name, current);
            });
        
        return Array.from(durationMap.entries())
            .map(([name, data]) => ({ name, average: data.total / data.count }))
            .sort((a, b) => b.average - a.average)
            .slice(0, 10);
    }

    private getSystemMetrics(): Record<string, any> {
        const memUsage = process.memoryUsage();
        return {
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            },
            uptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform
        };
    }

    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        
        this.metrics = [];
        this.timers.clear();
        
        this.logger.debug('MetricsService disposed');
    }
}
