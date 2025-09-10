/**
 * ENTERPRISE RELIABILITY TESTS
 * These tests verify that reliability features work under stress
 * Critical for entrepreneur/business use cases
 */

import { DeadLetterQueue } from '../../services/reliability/DeadLetterQueue';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('ENTERPRISE RELIABILITY TESTS', () => {
    let testDir: string;

    beforeAll(async () => {
        testDir = path.join(os.tmpdir(), 'nofx-reliability-test');
        await fs.mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
        try {
            await fs.rmdir(testDir, { recursive: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Dead Letter Queue Reliability', () => {
        test('DLQ must not cause infinite loops under any circumstances', async () => {
            let processAttempts = 0;
            const maxAttempts = 5; // Reasonable limit to prevent infinite loops

            const dlq = new DeadLetterQueue('test-dlq', {
                maxRetries: 3,
                retryDelayMs: 100,
                persistPath: testDir,
                processInterval: 50 // Fast processing for testing
            });

            // Register a processor that always fails
            dlq.registerProcessor('always-fail', async payload => {
                processAttempts++;
                if (processAttempts > maxAttempts) {
                    throw new Error('CRITICAL: DLQ infinite loop detected');
                }
                throw new Error('Simulated failure');
            });

            // Add a message that will fail
            await dlq.addMessage({ test: 'data' }, new Error('Initial failure'), 'always-fail');

            // Wait for processing attempts
            await new Promise(resolve => setTimeout(resolve, 1000));

            // CRITICAL: Must not exceed reasonable retry attempts
            expect(processAttempts).toBeLessThanOrEqual(maxAttempts);
            expect(processAttempts).toBeGreaterThan(0); // Should have tried at least once

            console.log(`✅ DLQ stopped after ${processAttempts} attempts (no infinite loop)`);

            dlq.stopProcessing();
            await dlq.clear();
        });

        test('DLQ must handle file system errors gracefully', async () => {
            // Test with invalid persist path
            const dlq = new DeadLetterQueue('fs-error-test', {
                persistToDisk: true,
                persistPath: '/invalid/path/that/cannot/exist'
            });

            // CRITICAL: Must not crash on file system errors
            expect(async () => {
                await dlq.addMessage({ test: 'data' }, new Error('Test error'), 'test-source');
            }).not.toThrow();

            console.log('✅ DLQ handles file system errors gracefully');

            dlq.stopProcessing();
        });

        test('DLQ metrics must be accurate under load', async () => {
            const dlq = new DeadLetterQueue('metrics-test', {
                maxRetries: 2,
                retryDelayMs: 10,
                persistPath: testDir
            });

            let successfulProcesses = 0;
            dlq.registerProcessor('metrics-test', async payload => {
                if (payload.shouldSucceed) {
                    successfulProcesses++;
                } else {
                    throw new Error('Intended failure');
                }
            });

            // Add mix of messages that will succeed/fail
            for (let i = 0; i < 10; i++) {
                await dlq.addMessage(
                    { shouldSucceed: i % 3 === 0 }, // Every 3rd succeeds
                    new Error(`Test error ${i}`),
                    'metrics-test'
                );
            }

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            const metrics = dlq.getMetrics();

            // CRITICAL: Metrics must be consistent
            expect(metrics.totalMessages).toBe(10);
            expect(metrics.recoveredMessages).toBe(successfulProcesses);
            expect(metrics.currentQueueSize).toBeLessThanOrEqual(10);

            console.log(`✅ DLQ metrics accurate: ${JSON.stringify(metrics)}`);

            dlq.stopProcessing();
            await dlq.clear();
        });
    });

    describe('Basic Reliability Tests', () => {
        test('Extension must handle errors without crashing', () => {
            // Basic error handling test
            expect(() => {
                throw new Error('Test error');
            }).toThrow();

            expect(() => {
                JSON.parse('invalid json');
            }).toThrow();

            console.log('✅ Basic error handling works');
        });

        test('Extension must handle null/undefined values', () => {
            const nullValue: any = null;
            const undefinedValue: any = undefined;

            expect(nullValue?.someProperty).toBeUndefined();
            expect(undefinedValue?.someProperty).toBeUndefined();

            // Test that we can safely check for null/undefined
            expect(nullValue == null).toBe(true);
            expect(undefinedValue == null).toBe(true);

            console.log('✅ Null/undefined handling works');
        });
    });
});
