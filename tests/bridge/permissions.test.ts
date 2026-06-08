import {describe, expect, it} from 'vitest';
import {
  createBridgePermissionRequest,
  resolveBridgePermissionRequest,
  waitForBridgePermissionDecision,
  formatBridgePermissionRequest,
  permissionRequestToBridgeMessage,
} from '../../src/bridge/permissions.js';

describe('createBridgePermissionRequest', () => {
  it('creates request with id and pending status', () => {
    const req = createBridgePermissionRequest('write to src/auth.ts');
    expect(typeof req.id).toBe('string');
    expect(req.status).toBe('pending');
    expect(req.action).toContain('write');
  });

  it('truncates long action text', () => {
    const req = createBridgePermissionRequest('x'.repeat(1000));
    expect(req.action.length).toBeLessThanOrEqual(500);
  });
});

describe('waitForBridgePermissionDecision + resolveBridgePermissionRequest', () => {
  it('resolves approved when decision is approved', async () => {
    const req = createBridgePermissionRequest('edit file');
    const promise = waitForBridgePermissionDecision(req, {timeoutMs: 5000});
    resolveBridgePermissionRequest(req.id, 'approved');
    const decision = await promise;
    expect(decision).toBe('approved');
  });

  it('resolves denied when decision is denied', async () => {
    const req = createBridgePermissionRequest('delete file');
    const promise = waitForBridgePermissionDecision(req, {timeoutMs: 5000});
    resolveBridgePermissionRequest(req.id, 'denied');
    expect(await promise).toBe('denied');
  });

  it('returns timeout after timeout elapses', async () => {
    const req = createBridgePermissionRequest('timed out action');
    const decision = await waitForBridgePermissionDecision(req, {timeoutMs: 50});
    expect(decision).toBe('timeout');
  });

  it('returns false when resolving unknown id', () => {
    const result = resolveBridgePermissionRequest('nonexistent-id', 'approved');
    expect(result).toBe(false);
  });
});

describe('formatBridgePermissionRequest', () => {
  it('includes action text', () => {
    const req = createBridgePermissionRequest('Write to config file');
    const formatted = formatBridgePermissionRequest(req);
    expect(formatted).toContain('Write to config file');
  });

  it('does not include secrets', () => {
    const req = createBridgePermissionRequest('Use token sk-ant-api-secxxxxxxxxxxxxxxxxx');
    const formatted = formatBridgePermissionRequest(req);
    expect(formatted).not.toContain('sk-ant-api-sec');
  });

  it('includes request id prefix', () => {
    const req = createBridgePermissionRequest('test');
    const formatted = formatBridgePermissionRequest(req);
    expect(formatted).toContain('ID:');
  });
});

describe('permissionRequestToBridgeMessage', () => {
  it('creates permission.requested bridge message', () => {
    const req = createBridgePermissionRequest('edit src/main.ts', {toolName: 'editFile', filePath: 'src/main.ts'});
    const msg = permissionRequestToBridgeMessage(req);
    expect(msg.type).toBe('permission.requested');
    expect(msg.payload['requestId']).toBe(req.id);
    expect(msg.payload['toolName']).toBe('editFile');
  });
});
