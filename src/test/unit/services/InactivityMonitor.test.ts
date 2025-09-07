import { InactivityMonitor, InactivityConfig, InactivityStatus } from '../../../services/InactivityMonitor';

describe('InactivityMonitor', () => {
    let monitor: InactivityMonitor;
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.useFakeTimers();
        monitor = new InactivityMonitor();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        monitor.dispose();
        jest.clearAllTimers();
        jest.useRealTimers();
        consoleLogSpy.mockRestore();
    });

    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            const monitor = new InactivityMonitor();
            const status = monitor.getAllStatus();
            expect(status).toEqual([]);
        });

        it('should initialize with custom configuration', () => {
            const config: InactivityConfig = {
                warningThreshold: 60,
                alertThreshold: 300,
                heartbeatInterval: 30
            };
            const monitor = new InactivityMonitor(config);
            expect(monitor).toBeDefined();
        });

        it('should merge partial configuration with defaults', () => {
            const monitor = new InactivityMonitor({ warningThreshold: 45 });
            expect(monitor).toBeDefined();
        });
    });

    describe('startMonitoring', () => {
        it('should start monitoring an agent', () => {
            monitor.startMonitoring('agent-1');
            const status = monitor.getInactivityStatus('agent-1');
            expect(status).not.toBeNull();
            expect(status?.agentId).toBe('agent-1');
            expect(status?.status).toBe('active');
            expect(status?.inactiveSeconds).toBe(0);
        });

        it('should set up all timers', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            const setIntervalSpy = jest.spyOn(global, 'setInterval');

            monitor.startMonitoring('agent-1');

            // Should set up warning timer and alert timer
            expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
            // Should set up heartbeat interval
            expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        });

        it('should log monitoring start', () => {
            monitor.startMonitoring('agent-1');
            expect(consoleLogSpy).toHaveBeenCalledWith('[InactivityMonitor] Started monitoring agent agent-1');
        });
    });

    describe('recordActivity', () => {
        beforeEach(() => {
            monitor.startMonitoring('agent-1');
            jest.clearAllTimers();
        });

        it('should update last activity timestamp', () => {
            const initialStatus = monitor.getInactivityStatus('agent-1');
            const initialTime = initialStatus!.lastActivity;

            jest.advanceTimersByTime(1000);
            monitor.recordActivity('agent-1');

            const updatedStatus = monitor.getInactivityStatus('agent-1');
            expect(updatedStatus!.lastActivity.getTime()).toBeGreaterThan(initialTime.getTime());
        });

        it('should reset timers on activity', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

            // Advance time to make agent inactive
            jest.advanceTimersByTime(35000);

            monitor.recordActivity('agent-1');

            // Should clear warning and alert timers
            expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
        });

        it('should update status from inactive to active', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            // Make agent inactive
            jest.advanceTimersByTime(35000);

            monitor.recordActivity('agent-1');

            const status = monitor.getInactivityStatus('agent-1');
            expect(status?.status).toBe('active');
        });

        it('should update status from stuck to active', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            // Make agent stuck
            jest.advanceTimersByTime(125000);

            monitor.recordActivity('agent-1');

            const status = monitor.getInactivityStatus('agent-1');
            expect(status?.status).toBe('active');
        });

        it('should log activity with type', () => {
            monitor.recordActivity('agent-1', 'code-completion');
            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[InactivityMonitor] Activity recorded for agent agent-1: code-completion'
            );
        });

        it('should log activity without type', () => {
            monitor.recordActivity('agent-1');
            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[InactivityMonitor] Activity recorded for agent agent-1: general'
            );
        });

        it('should re-setup timers after recording activity', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            setTimeoutSpy.mockClear();

            monitor.recordActivity('agent-1');

            // Should set up warning and alert timers again
            expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('warning timer', () => {
        it('should emit warning after threshold', () => {
            const warningSpy = jest.fn();
            monitor.on('warning', warningSpy);

            monitor.startMonitoring('agent-1');

            // Advance past warning threshold (30 seconds)
            jest.advanceTimersByTime(30000);

            expect(warningSpy).toHaveBeenCalledWith({
                agentId: 'agent-1',
                message: 'Agent agent-1 has been inactive for 30 seconds',
                status: expect.objectContaining({
                    agentId: 'agent-1',
                    inactiveSeconds: 30
                })
            });
        });

        it('should update status to inactive on warning', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            monitor.startMonitoring('agent-1');
            jest.advanceTimersByTime(30000);

            // The status changes from active -> thinking -> inactive due to heartbeat
            expect(statusChangeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: 'agent-1',
                    newStatus: 'inactive'
                })
            );
        });

        it('should not emit warning if activity recorded before threshold', () => {
            const warningSpy = jest.fn();
            monitor.on('warning', warningSpy);

            monitor.startMonitoring('agent-1');

            // Advance halfway to warning
            jest.advanceTimersByTime(15000);

            // Record activity
            monitor.recordActivity('agent-1');

            // Advance past original warning time
            jest.advanceTimersByTime(20000);

            expect(warningSpy).not.toHaveBeenCalled();
        });
    });

    describe('alert timer', () => {
        it('should emit alert after threshold', () => {
            const alertSpy = jest.fn();
            monitor.on('alert', alertSpy);

            monitor.startMonitoring('agent-1');

            // Advance past alert threshold (120 seconds)
            jest.advanceTimersByTime(120000);

            expect(alertSpy).toHaveBeenCalledWith({
                agentId: 'agent-1',
                message: 'Agent agent-1 needs immediate attention - inactive for 120 seconds',
                status: expect.objectContaining({
                    agentId: 'agent-1',
                    inactiveSeconds: 120
                })
            });
        });

        it('should update status to stuck on alert', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            monitor.startMonitoring('agent-1');
            jest.advanceTimersByTime(120000);

            expect(statusChangeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    newStatus: 'stuck'
                })
            );
        });
    });

    describe('heartbeat', () => {
        it('should emit heartbeat at interval', () => {
            const heartbeatSpy = jest.fn();
            monitor.on('heartbeat', heartbeatSpy);

            monitor.startMonitoring('agent-1');

            // Advance by heartbeat interval (15 seconds)
            jest.advanceTimersByTime(15000);

            expect(heartbeatSpy).toHaveBeenCalledTimes(1);
            expect(heartbeatSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentId: 'agent-1',
                    inactiveSeconds: 15
                })
            );
        });

        it('should emit multiple heartbeats', () => {
            const heartbeatSpy = jest.fn();
            monitor.on('heartbeat', heartbeatSpy);

            monitor.startMonitoring('agent-1');

            // Advance by 3 heartbeat intervals
            jest.advanceTimersByTime(45000);

            expect(heartbeatSpy).toHaveBeenCalledTimes(3);
        });

        it('should update status to active when inactive < 5 seconds', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            monitor.startMonitoring('agent-1');

            // Make agent inactive first
            jest.advanceTimersByTime(30000);
            statusChangeSpy.mockClear();

            // Record activity
            monitor.recordActivity('agent-1');

            // After recording activity, status should be active
            const status = monitor.getInactivityStatus('agent-1');
            expect(status?.status).toBe('active');
        });

        it('should update status to thinking when 5 <= inactive < 30', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            monitor.startMonitoring('agent-1');

            // Advance to 'thinking' range
            jest.advanceTimersByTime(10000);

            // Trigger heartbeat
            jest.advanceTimersByTime(5000);

            expect(statusChangeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    previousStatus: 'active',
                    newStatus: 'thinking'
                })
            );
        });
    });

    describe('getInactivityStatus', () => {
        it('should return null for unmonitored agent', () => {
            const status = monitor.getInactivityStatus('unknown-agent');
            expect(status).toBeNull();
        });

        it('should return correct status for monitored agent', () => {
            monitor.startMonitoring('agent-1');
            jest.advanceTimersByTime(10000);

            const status = monitor.getInactivityStatus('agent-1');
            expect(status).toEqual({
                agentId: 'agent-1',
                lastActivity: expect.any(Date),
                status: 'active',
                inactiveSeconds: 10
            });
        });

        it('should calculate inactive seconds correctly', () => {
            monitor.startMonitoring('agent-1');

            // Advance by 25 seconds
            jest.advanceTimersByTime(25000);

            const status = monitor.getInactivityStatus('agent-1');
            expect(status?.inactiveSeconds).toBe(25);
        });
    });

    describe('getAllStatus', () => {
        it('should return empty array when no agents monitored', () => {
            const statuses = monitor.getAllStatus();
            expect(statuses).toEqual([]);
        });

        it('should return all monitored agents', () => {
            monitor.startMonitoring('agent-1');
            monitor.startMonitoring('agent-2');
            monitor.startMonitoring('agent-3');

            const statuses = monitor.getAllStatus();
            expect(statuses).toHaveLength(3);
            expect(statuses.map(s => s.agentId)).toEqual(['agent-1', 'agent-2', 'agent-3']);
        });

        it('should return correct status for each agent', () => {
            monitor.startMonitoring('agent-1');
            jest.advanceTimersByTime(10000);

            monitor.startMonitoring('agent-2');
            jest.advanceTimersByTime(5000);

            const statuses = monitor.getAllStatus();
            expect(statuses[0].inactiveSeconds).toBe(15);
            expect(statuses[1].inactiveSeconds).toBe(5);
        });
    });

    describe('stopMonitoring', () => {
        it('should clear all timers for agent', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            monitor.startMonitoring('agent-1');
            clearTimeoutSpy.mockClear();
            clearIntervalSpy.mockClear();

            monitor.stopMonitoring('agent-1');

            // Should clear warning and alert timeouts
            expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
            // Should clear heartbeat interval
            expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
        });

        it('should remove agent from tracking', () => {
            monitor.startMonitoring('agent-1');
            monitor.stopMonitoring('agent-1');

            const status = monitor.getInactivityStatus('agent-1');
            expect(status).toBeNull();
        });

        it('should not emit events after stopping', () => {
            const heartbeatSpy = jest.fn();
            monitor.on('heartbeat', heartbeatSpy);

            monitor.startMonitoring('agent-1');
            monitor.stopMonitoring('agent-1');

            jest.advanceTimersByTime(30000);
            expect(heartbeatSpy).not.toHaveBeenCalled();
        });

        it('should log monitoring stop', () => {
            monitor.startMonitoring('agent-1');
            monitor.stopMonitoring('agent-1');

            expect(consoleLogSpy).toHaveBeenCalledWith('[InactivityMonitor] Stopped monitoring agent agent-1');
        });

        it('should handle stopping non-existent agent gracefully', () => {
            expect(() => monitor.stopMonitoring('non-existent')).not.toThrow();
        });
    });

    describe('updateConfig', () => {
        it('should update configuration', () => {
            monitor.startMonitoring('agent-1');

            const newConfig: Partial<InactivityConfig> = {
                warningThreshold: 60,
                alertThreshold: 240
            };

            monitor.updateConfig(newConfig);

            // Agent should be restarted with new config
            const status = monitor.getInactivityStatus('agent-1');
            expect(status).not.toBeNull();
        });

        it('should restart all monitored agents', () => {
            const stopMonitoringSpy = jest.spyOn(monitor, 'stopMonitoring');
            const startMonitoringSpy = jest.spyOn(monitor, 'startMonitoring');

            monitor.startMonitoring('agent-1');
            monitor.startMonitoring('agent-2');

            monitor.updateConfig({ warningThreshold: 45 });

            expect(stopMonitoringSpy).toHaveBeenCalledTimes(2);
            expect(stopMonitoringSpy).toHaveBeenCalledWith('agent-1');
            expect(stopMonitoringSpy).toHaveBeenCalledWith('agent-2');

            expect(startMonitoringSpy).toHaveBeenCalledTimes(4); // 2 initial + 2 restarts
        });

        it('should preserve agent list after config update', () => {
            monitor.startMonitoring('agent-1');
            monitor.startMonitoring('agent-2');

            monitor.updateConfig({ heartbeatInterval: 10 });

            const statuses = monitor.getAllStatus();
            expect(statuses.map(s => s.agentId)).toEqual(['agent-1', 'agent-2']);
        });
    });

    describe('dispose', () => {
        it('should clear all timers', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            monitor.startMonitoring('agent-1');
            monitor.startMonitoring('agent-2');

            clearTimeoutSpy.mockClear();
            clearIntervalSpy.mockClear();

            monitor.dispose();

            // Should clear 2 warning + 2 alert timeouts = 4
            expect(clearTimeoutSpy).toHaveBeenCalledTimes(4);
            // Should clear 2 heartbeat intervals
            expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
        });

        it('should clear all maps', () => {
            monitor.startMonitoring('agent-1');
            monitor.startMonitoring('agent-2');

            monitor.dispose();

            const statuses = monitor.getAllStatus();
            expect(statuses).toEqual([]);
        });

        it('should remove all event listeners', () => {
            const removeAllListenersSpy = jest.spyOn(monitor, 'removeAllListeners');

            monitor.dispose();

            expect(removeAllListenersSpy).toHaveBeenCalled();
        });

        it('should not emit events after disposal', () => {
            const heartbeatSpy = jest.fn();
            monitor.on('heartbeat', heartbeatSpy);

            monitor.startMonitoring('agent-1');
            monitor.dispose();

            jest.advanceTimersByTime(30000);
            expect(heartbeatSpy).not.toHaveBeenCalled();
        });
    });

    describe('status transitions', () => {
        it('should not emit status-change when status remains the same', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            monitor.startMonitoring('agent-1');

            // Stay in active range (< 5 seconds)
            jest.advanceTimersByTime(3000);
            statusChangeSpy.mockClear();

            // Another heartbeat in active range
            monitor.recordActivity('agent-1');
            jest.advanceTimersByTime(3000);

            // Should not emit any status change events when remaining active
            expect(statusChangeSpy).not.toHaveBeenCalled();
        });

        it('should emit status-change only when status actually changes', () => {
            const statusChangeSpy = jest.fn();
            monitor.on('status-change', statusChangeSpy);

            monitor.startMonitoring('agent-1');

            // Change to thinking (5-30 seconds)
            jest.advanceTimersByTime(10000);
            jest.advanceTimersByTime(5000); // Trigger heartbeat

            expect(statusChangeSpy).toHaveBeenCalledTimes(1);
            expect(statusChangeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    previousStatus: 'active',
                    newStatus: 'thinking'
                })
            );
        });
    });

    describe('edge cases', () => {
        it('should handle rapid activity recording', () => {
            monitor.startMonitoring('agent-1');

            // Record activity multiple times rapidly
            for (let i = 0; i < 10; i++) {
                monitor.recordActivity('agent-1');
            }

            const status = monitor.getInactivityStatus('agent-1');
            expect(status?.status).toBe('active');
            expect(status?.inactiveSeconds).toBe(0);
        });

        it('should handle monitoring same agent multiple times', () => {
            monitor.startMonitoring('agent-1');
            monitor.startMonitoring('agent-1');

            const statuses = monitor.getAllStatus();
            expect(statuses).toHaveLength(1);
        });

        it('should handle concurrent timer operations', () => {
            monitor.startMonitoring('agent-1');

            // Trigger warning
            jest.advanceTimersByTime(30000);

            // Immediately record activity
            monitor.recordActivity('agent-1');

            // Should reset properly
            const status = monitor.getInactivityStatus('agent-1');
            expect(status?.status).toBe('active');
        });
    });
});
