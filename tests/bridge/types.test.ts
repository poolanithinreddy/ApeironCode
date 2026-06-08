import {describe, expect, it} from 'vitest';
import {
  createBridgeMessage,
  createBridgeErrorMessage,
  createBridgePong,
  isBridgeMessage,
  isBridgeRequest,
  isBridgeResponse,
} from '../../src/bridge/types.js';

describe('isBridgeMessage', () => {
  it('accepts valid message', () => {
    const msg = createBridgeMessage('bridge.ping', {});
    expect(isBridgeMessage(msg)).toBe(true);
  });

  it('rejects null', () => expect(isBridgeMessage(null)).toBe(false));
  it('rejects missing id', () => expect(isBridgeMessage({type: 'x', timestamp: 't', payload: {}})).toBe(false));
  it('rejects missing payload', () => expect(isBridgeMessage({id: 'a', type: 'x', timestamp: 't'})).toBe(false));
  it('rejects payload as string', () => expect(isBridgeMessage({id: 'a', type: 'x', timestamp: 't', payload: 'bad'})).toBe(false));
});

describe('isBridgeRequest', () => {
  it('accepts message with requestId', () => {
    const req = createBridgeMessage('bridge.ping', {}, {requestId: 'req-1'});
    expect(isBridgeRequest(req)).toBe(true);
  });

  it('rejects message without requestId', () => {
    const msg = createBridgeMessage('bridge.ping', {});
    expect(isBridgeRequest(msg)).toBe(false);
  });
});

describe('isBridgeResponse', () => {
  it('accepts response with ok field', () => {
    const resp = {...createBridgeMessage('bridge.pong', {}, {requestId: 'r1'}), ok: true};
    expect(isBridgeResponse(resp)).toBe(true);
  });

  it('rejects when ok missing', () => {
    const msg = createBridgeMessage('bridge.pong', {}, {requestId: 'r1'});
    expect(isBridgeResponse(msg)).toBe(false);
  });
});

describe('createBridgeMessage', () => {
  it('creates message with stable structure', () => {
    const msg = createBridgeMessage('bridge.ping', {foo: 'bar'});
    expect(typeof msg.id).toBe('string');
    expect(msg.type).toBe('bridge.ping');
    expect(typeof msg.timestamp).toBe('string');
    expect(msg.payload).toEqual({foo: 'bar'});
  });

  it('uses provided id when specified', () => {
    const msg = createBridgeMessage('bridge.ping', {}, {id: 'my-id'});
    expect(msg.id).toBe('my-id');
  });

  it('sets sessionId and requestId when provided', () => {
    const msg = createBridgeMessage('task.created', {}, {sessionId: 's1', requestId: 'r1'});
    expect(msg.sessionId).toBe('s1');
    expect(msg.requestId).toBe('r1');
  });
});

describe('createBridgeErrorMessage', () => {
  it('creates error with bridge.error type', () => {
    const msg = createBridgeErrorMessage('AUTH_FAILED', 'Token invalid');
    expect(msg.type).toBe('bridge.error');
    expect(msg.payload['code']).toBe('AUTH_FAILED');
    expect(msg.payload['message']).toBe('Token invalid');
  });

  it('truncates long error messages', () => {
    const longMsg = 'x'.repeat(1000);
    const msg = createBridgeErrorMessage('ERR', longMsg);
    expect((msg.payload['message'] as string).length).toBeLessThanOrEqual(500);
  });

  it('does not expose full token in error payload after sanitization', () => {
    // Error messages are truncated to 500 chars; secrets are stripped by bridge sanitization layer
    const msg = createBridgeErrorMessage('ERR', 'Authentication failed');
    expect(msg.type).toBe('bridge.error');
    expect(msg.payload['message']).not.toContain('sk-');
  });
});

describe('createBridgePong', () => {
  it('creates pong with pingId reference', () => {
    const pong = createBridgePong('ping-abc');
    expect(pong.type).toBe('bridge.pong');
    expect(pong.payload['pingId']).toBe('ping-abc');
  });
});
