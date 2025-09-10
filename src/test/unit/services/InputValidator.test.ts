/**
 * Comprehensive unit tests for InputValidator
 * Tests validation rules, sanitization, security features, and edge cases
 */

import { InputValidator } from '../../../services/InputValidator';

describe('InputValidator', () => {
    let validator: InputValidator;

    beforeEach(() => {
        validator = new InputValidator();
    });

    describe('validateEventName', () => {
        describe('Success Cases', () => {
            it('should validate correct event names', () => {
                const validNames = [
                    'agent.created',
                    'task.completed',
                    'orchestration.message.received',
                    'ui.state.changed',
                    'system-status.updated',
                    'module_initialized',
                    'config.validation.passed',
                    'test123.event456'
                ];

                validNames.forEach(name => {
                    const result = validator.validateEventName(name);
                    expect(result.isValid).toBe(true);
                    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
                    expect(result.sanitizedValue).toBe(name.toLowerCase().trim());
                });
            });

            it('should allow warning-level issues', () => {
                const result = validator.validateEventName('simplename'); // No dot notation
                expect(result.isValid).toBe(true);
                expect(result.errors.some(e => e.severity === 'warning')).toBe(true);
                expect(result.errors.some(e => e.severity === 'error')).toBe(false);
            });

            it('should trim and lowercase event names', () => {
                const result = validator.validateEventName('  AGENT.CREATED  ');
                expect(result.isValid).toBe(true);
                expect(result.sanitizedValue).toBe('agent.created');
            });
        });

        describe('Error Cases', () => {
            it('should reject null/undefined/empty names', () => {
                const invalidNames = [null, undefined, '', '   '];

                invalidNames.forEach(name => {
                    const result = validator.validateEventName(name);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.some(e => e.rule === 'required')).toBe(true);
                });
            });

            it('should reject non-string names', () => {
                const invalidTypes = [123, {}, [], true, new Date()];

                invalidTypes.forEach(name => {
                    const result = validator.validateEventName(name);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.some(e => e.rule === 'type')).toBe(true);
                });
            });

            it('should reject names that are too long', () => {
                const longName = 'a'.repeat(256);
                const result = validator.validateEventName(longName);

                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.rule === 'length')).toBe(true);
            });

            it('should reject names with invalid characters', () => {
                const invalidNames = [
                    'event with spaces',
                    'event@domain.com',
                    'event#hash',
                    'event$variable',
                    'event/path',
                    'event\\backslash',
                    'event?query',
                    'event&param',
                    'event<tag>',
                    'event[bracket]',
                    'event{brace}'
                ];

                invalidNames.forEach(name => {
                    const result = validator.validateEventName(name);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.some(e => e.rule === 'format')).toBe(true);
                });
            });

            it('should warn about reserved names', () => {
                const reservedNames = [
                    '__proto__',
                    'constructor',
                    'prototype',
                    'toString',
                    'valueOf',
                    '__constructor__',
                    'prototype.value'
                ];

                reservedNames.forEach(name => {
                    const result = validator.validateEventName(name);
                    expect(result.errors.some(e => e.rule === 'reserved')).toBe(true);
                });
            });

            it('should warn about naming convention violations', () => {
                const poorNames = ['.startswithdot', 'endswithrot.', 'double..dots', 'nodots'];

                poorNames.forEach(name => {
                    const result = validator.validateEventName(name);
                    expect(result.errors.some(e => e.rule === 'conventions')).toBe(true);
                });
            });
        });

        describe('Metadata', () => {
            it('should provide processing metadata', () => {
                const result = validator.validateEventName('test.event');

                expect(result.metadata.originalType).toBe('string');
                expect(result.metadata.sanitizedType).toBe('string');
                expect(result.metadata.byteLength).toBeGreaterThan(0);
                expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
            });

            it('should measure processing time', () => {
                const result = validator.validateEventName('test.event');
                expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
                expect(result.metadata.processingTimeMs).toBeLessThan(100); // Should be very fast
            });
        });
    });

    describe('validateEventData', () => {
        describe('Success Cases', () => {
            it('should validate simple data types', () => {
                const validData = [
                    'string',
                    123,
                    true,
                    null,
                    { key: 'value' },
                    [1, 2, 3],
                    { nested: { object: true } }
                ];

                validData.forEach(data => {
                    const result = validator.validateEventData(data);
                    expect(result.isValid).toBe(true);
                    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
                });
            });

            it('should handle undefined data', () => {
                const result = validator.validateEventData(undefined);
                expect(result.isValid).toBe(true);
            });

            it('should sanitize data correctly', () => {
                const inputData = {
                    text: '  trimmed  ',
                    undefined_value: undefined,
                    nan_value: NaN,
                    infinity_value: Infinity,
                    html: '<script>alert("xss")</script>Safe content'
                };

                const result = validator.validateEventData(inputData);

                expect(result.sanitizedValue.text).toBe('trimmed');
                expect(result.sanitizedValue.undefined_value).toBeUndefined();
                expect(result.sanitizedValue.nan_value).toBeNull();
                expect(result.sanitizedValue.infinity_value).toBeNull();
                expect(result.sanitizedValue.html).not.toContain('<script>');
                expect(result.sanitizedValue.html).toContain('Safe content');
            });
        });

        describe('Error Cases', () => {
            it('should reject non-serializable data', () => {
                const nonSerializableData = [() => 'function', Symbol('symbol'), new WeakMap(), new WeakSet()];

                nonSerializableData.forEach(data => {
                    const result = validator.validateEventData(data);
                    expect(result.isValid).toBe(false);
                    expect(result.errors.some(e => e.rule === 'serializable')).toBe(true);
                });
            });

            it('should reject data with circular references', () => {
                const circular: any = { name: 'test' };
                circular.self = circular;

                const result = validator.validateEventData(circular);
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.rule === 'serializable')).toBe(true);
            });

            it('should reject data that is too large', () => {
                const largeData = {
                    data: 'x'.repeat(1024 * 1024 + 1) // 1MB + 1 byte
                };

                const result = validator.validateEventData(largeData);
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.rule === 'size')).toBe(true);
            });

            it('should warn about deeply nested data', () => {
                // Create deeply nested object
                const deepObject: any = {};
                let current = deepObject;
                for (let i = 0; i < 15; i++) {
                    current.nested = {};
                    current = current.nested;
                }

                const result = validator.validateEventData(deepObject);
                expect(result.errors.some(e => e.rule === 'depth')).toBe(true);
            });
        });

        describe('Sanitization', () => {
            it('should trim strings recursively', () => {
                const data = {
                    simple: '  trimmed  ',
                    nested: {
                        text: '  also trimmed  '
                    },
                    array: ['  item1  ', '  item2  ']
                };

                const result = validator.validateEventData(data);

                expect(result.sanitizedValue.simple).toBe('trimmed');
                expect(result.sanitizedValue.nested.text).toBe('also trimmed');
                expect(result.sanitizedValue.array).toEqual(['item1', 'item2']);
            });

            it('should remove undefined values', () => {
                const data = {
                    keep: 'this',
                    remove: undefined,
                    nested: {
                        keep: 'this too',
                        remove: undefined
                    },
                    array: ['keep', undefined, 'this']
                };

                const result = validator.validateEventData(data);

                expect(result.sanitizedValue.keep).toBe('this');
                expect(result.sanitizedValue.remove).toBeUndefined();
                expect(result.sanitizedValue.nested.keep).toBe('this too');
                expect(result.sanitizedValue.nested.remove).toBeUndefined();
                expect(result.sanitizedValue.array).toEqual(['keep', 'this']);
            });

            it('should normalize numbers', () => {
                const data = {
                    normal: 42,
                    nan: NaN,
                    infinity: Infinity,
                    negativeInfinity: -Infinity,
                    nested: {
                        nan: NaN
                    }
                };

                const result = validator.validateEventData(data);

                expect(result.sanitizedValue.normal).toBe(42);
                expect(result.sanitizedValue.nan).toBeNull();
                expect(result.sanitizedValue.infinity).toBeNull();
                expect(result.sanitizedValue.negativeInfinity).toBeNull();
                expect(result.sanitizedValue.nested.nan).toBeNull();
            });

            it('should sanitize HTML content', () => {
                const data = {
                    safe: 'This is safe content',
                    xss: '<script>alert("XSS")</script>Safe part',
                    events: '<div onclick="malicious()">Content</div>',
                    javascript: '<a href="javascript:void(0)">Link</a>',
                    iframe: '<iframe src="evil.com"></iframe>Normal text'
                };

                const result = validator.validateEventData(data);

                expect(result.sanitizedValue.safe).toBe('This is safe content');
                expect(result.sanitizedValue.xss).not.toContain('<script>');
                expect(result.sanitizedValue.xss).toContain('Safe part');
                expect(result.sanitizedValue.events).not.toContain('onclick');
                expect(result.sanitizedValue.events).toContain('Content');
                expect(result.sanitizedValue.javascript).not.toContain('javascript:');
                expect(result.sanitizedValue.iframe).not.toContain('<iframe>');
                expect(result.sanitizedValue.iframe).toContain('Normal text');
            });
        });
    });

    describe('Custom Rules', () => {
        it('should allow adding custom event name validation rules', () => {
            validator.addEventNameRule({
                name: 'custom-prefix',
                validate: value => typeof value === 'string' && value.startsWith('custom.'),
                message: 'Event name must start with "custom."',
                severity: 'error'
            });

            const result1 = validator.validateEventName('custom.test');
            expect(result1.isValid).toBe(true);

            const result2 = validator.validateEventName('other.test');
            expect(result2.isValid).toBe(false);
            expect(result2.errors.some(e => e.rule === 'custom-prefix')).toBe(true);
        });

        it('should allow adding custom data validation rules', () => {
            validator.addDataRule({
                name: 'no-passwords',
                validate: value => {
                    const str = JSON.stringify(value);
                    return !str.toLowerCase().includes('password');
                },
                message: 'Data must not contain passwords',
                severity: 'error'
            });

            const safeData = { username: 'user', token: 'abc123' };
            const unsafeData = { username: 'user', password: 'secret' };

            expect(validator.validateEventData(safeData).isValid).toBe(true);
            expect(validator.validateEventData(unsafeData).isValid).toBe(false);
        });

        it('should allow adding custom sanitization rules', () => {
            validator.addSanitizationRule({
                name: 'uppercase-strings',
                sanitize: value => {
                    if (typeof value === 'string') {
                        return value.toUpperCase();
                    }
                    if (typeof value === 'object' && value !== null) {
                        const result: any = Array.isArray(value) ? [] : {};
                        for (const key in value) {
                            result[key] = typeof value[key] === 'string' ? value[key].toUpperCase() : value[key];
                        }
                        return result;
                    }
                    return value;
                },
                description: 'Convert all strings to uppercase'
            });

            const data = { text: 'hello', nested: { text: 'world' } };
            const result = validator.validateEventData(data);

            expect(result.sanitizedValue.text).toBe('HELLO');
            expect(result.sanitizedValue.nested.text).toBe('WORLD');
        });
    });

    describe('Edge Cases', () => {
        it('should handle very large strings', () => {
            const largeString = 'a'.repeat(10000);
            const result = validator.validateEventName(largeString);

            expect(result.isValid).toBe(false);
            expect(result.metadata.byteLength).toBeGreaterThan(10000);
        });

        it('should handle unicode characters', () => {
            const unicodeData = {
                emoji: '🚀💯🎉',
                chinese: '你好世界',
                arabic: 'مرحبا بالعالم',
                mixed: 'Hello 世界 🌍'
            };

            const result = validator.validateEventData(unicodeData);
            expect(result.isValid).toBe(true);
            expect(result.sanitizedValue).toEqual(unicodeData);
        });

        it('should handle special number values', () => {
            const data = {
                zero: 0,
                negativeZero: -0,
                maxSafe: Number.MAX_SAFE_INTEGER,
                minSafe: Number.MIN_SAFE_INTEGER,
                maxValue: Number.MAX_VALUE,
                minValue: Number.MIN_VALUE,
                epsilon: Number.EPSILON
            };

            const result = validator.validateEventData(data);
            expect(result.isValid).toBe(true);
        });

        it('should handle complex nested structures', () => {
            const complexData = {
                users: [
                    { id: 1, name: 'Alice', settings: { theme: 'dark', notifications: true } },
                    { id: 2, name: 'Bob', settings: { theme: 'light', notifications: false } }
                ],
                metadata: {
                    timestamp: new Date().toISOString(),
                    version: '1.0.0',
                    features: ['feature1', 'feature2']
                },
                flags: {
                    enabled: true,
                    experimental: false
                }
            };

            const result = validator.validateEventData(complexData);
            expect(result.isValid).toBe(true);
            expect(result.sanitizedValue).toEqual(complexData);
        });

        it('should handle validation rule errors gracefully', () => {
            // Add a rule that throws an error
            validator.addEventNameRule({
                name: 'broken-rule',
                validate: () => {
                    throw new Error('Rule error');
                },
                message: 'This rule is broken',
                severity: 'error'
            });

            const result = validator.validateEventName('test.event');

            // Should not crash, should record the error
            expect(result.errors.some(e => e.rule === 'broken-rule')).toBe(true);
            expect(result.errors.some(e => e.message.includes('Rule error'))).toBe(true);
        });

        it('should handle sanitization rule errors gracefully', () => {
            // Add a sanitization rule that throws an error
            validator.addSanitizationRule({
                name: 'broken-sanitizer',
                sanitize: () => {
                    throw new Error('Sanitizer error');
                },
                description: 'This sanitizer is broken'
            });

            const result = validator.validateEventData({ test: 'data' });

            // Should not crash, should record the error
            expect(result.errors.some(e => e.rule === 'broken-sanitizer')).toBe(true);
        });

        it('should handle null prototype objects', () => {
            const nullProtoObject = Object.create(null);
            nullProtoObject.key = 'value';

            const result = validator.validateEventData(nullProtoObject);
            expect(result.isValid).toBe(true);
        });

        it('should handle date objects', () => {
            const data = {
                date: new Date(),
                isoString: new Date().toISOString()
            };

            const result = validator.validateEventData(data);
            expect(result.isValid).toBe(true);
        });

        it('should handle regex objects', () => {
            const data = {
                pattern: /test/gi,
                patternString: '/test/gi'
            };

            const result = validator.validateEventData(data);
            expect(result.isValid).toBe(true);
        });

        it('should handle extremely deep objects near limit', () => {
            // Create object exactly at the depth limit
            const deepObject: any = {};
            let current = deepObject;
            for (let i = 0; i < 10; i++) {
                current.nested = {};
                current = current.nested;
            }

            const result = validator.validateEventData(deepObject);
            expect(result.isValid).toBe(true);
            expect(result.errors.some(e => e.rule === 'depth')).toBe(false);
        });
    });

    describe('Performance', () => {
        it('should validate simple data quickly', () => {
            const data = { simple: 'test', count: 42 };

            const startTime = Date.now();
            const result = validator.validateEventData(data);
            const endTime = Date.now();

            expect(result.isValid).toBe(true);
            expect(endTime - startTime).toBeLessThan(50); // Should be very fast
        });

        it('should handle moderate-sized data efficiently', () => {
            const data = {
                items: Array.from({ length: 1000 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`,
                    active: i % 2 === 0
                }))
            };

            const startTime = Date.now();
            const result = validator.validateEventData(data);
            const endTime = Date.now();

            expect(result.isValid).toBe(true);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });
    });
});
