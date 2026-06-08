import {describe, expect, it} from 'vitest';
import {
  redactBridgePayload,
  sanitizeBridgeMessage,
  formatBridgePayloadPreview,
} from '../../src/bridge/redaction.js';
import {createBridgeMessage} from '../../src/bridge/types.js';

describe('redactBridgePayload', () => {
  it('passes through safe strings', () => {
    expect(redactBridgePayload('hello world')).toBe('hello world');
  });

  it('redacts sk- style API keys', () => {
    const result = redactBridgePayload('token: sk-ant-api-key-secretabc123def456');
    expect(result).toBe('[REDACTED]');
  });

  it('redacts AWS access keys', () => {
    const result = redactBridgePayload('key: AKIAIOSFODNN7EXAMPLE');
    expect(result).toBe('[REDACTED]');
  });

  it('redacts bearer tokens', () => {
    const result = redactBridgePayload('Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6Ikp');
    expect(result).toBe('[REDACTED]');
  });

  it('truncates large strings', () => {
    const big = 'a'.repeat(3000);
    const result = redactBridgePayload(big) as string;
    expect(result.length).toBeLessThanOrEqual(2100);
    expect(result).toContain('[truncated]');
  });

  it('handles nested objects', () => {
    const input = {a: {b: {c: {d: {e: {f: 'deep'}}}}}};
    const result = redactBridgePayload(input) as Record<string, unknown>;
    expect(result).toBeDefined();
  });

  it('limits array length', () => {
    const arr = Array.from({length: 100}, (_, i) => i);
    const result = redactBridgePayload(arr) as unknown[];
    expect(result.length).toBeLessThanOrEqual(51); // 50 items + truncation note
  });

  it('redacts nested secrets', () => {
    const result = redactBridgePayload({
      config: {apiKey: 'sk-ant-api-secret-xxxxxxxxxxx1234567'},
    }) as Record<string, unknown>;
    const config = result['config'] as Record<string, unknown>;
    expect(config['apiKey']).toBe('[REDACTED]');
  });

  it('preserves safe metadata fields', () => {
    const result = redactBridgePayload({
      taskId: 'abc-123',
      status: 'succeeded',
      count: 5,
    }) as Record<string, unknown>;
    expect(result['taskId']).toBe('abc-123');
    expect(result['status']).toBe('succeeded');
    expect(result['count']).toBe(5);
  });

  it('does not mutate original object', () => {
    const original = {key: 'sk-ant-api-secret-xxxxxxxxxxx1234567', safe: 'hello'};
    redactBridgePayload(original);
    expect(original.key).toBe('sk-ant-api-secret-xxxxxxxxxxx1234567');
  });

  it('handles null', () => expect(redactBridgePayload(null)).toBeNull());
  it('handles numbers', () => expect(redactBridgePayload(42)).toBe(42));
  it('handles booleans', () => expect(redactBridgePayload(true)).toBe(true));
});

describe('sanitizeBridgeMessage', () => {
  it('returns new message with redacted payload', () => {
    const msg = createBridgeMessage('task.created', {
      token: 'sk-ant-api-key-secretxxxxxxxxxx123456',
      taskId: 'abc',
    });
    const sanitized = sanitizeBridgeMessage(msg);
    expect(sanitized.payload['token']).toBe('[REDACTED]');
    expect(sanitized.payload['taskId']).toBe('abc');
  });

  it('does not mutate original message', () => {
    const original = createBridgeMessage('bridge.ping', {secret: 'sk-ant-api-xxxxxxxxxxxxxxx'});
    sanitizeBridgeMessage(original);
    expect(original.payload['secret']).toBe('sk-ant-api-xxxxxxxxxxxxxxx');
  });
});

describe('formatBridgePayloadPreview', () => {
  it('truncates large payloads', () => {
    const large = {data: 'x'.repeat(1000)};
    const preview = formatBridgePayloadPreview(large, {maxLength: 100});
    expect(preview.length).toBeLessThanOrEqual(105);
    expect(preview).toContain('…');
  });

  it('redacts secrets from preview', () => {
    const preview = formatBridgePayloadPreview({key: 'sk-ant-api-secretxxxxxxxxxxxxxxxxxx'});
    expect(preview).not.toContain('sk-ant-api-secret');
  });
});
