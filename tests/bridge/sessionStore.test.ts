import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {BridgeSessionStore} from '../../src/bridge/sessionStore.js';
import {createBridgeMessage} from '../../src/bridge/types.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-bridge-session-'));

describe('BridgeSessionStore', () => {
  let tmpDir: string;
  let store: BridgeSessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp();
    store = new BridgeSessionStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('creates a session', async () => {
    const session = await store.createSession({cwd: tmpDir});
    expect(session.id).toBeTruthy();
    expect(session.status).toBe('active');
    expect(session.counters.messages).toBe(0);
  });

  it('gets a session by id', async () => {
    const created = await store.createSession({cwd: tmpDir});
    const fetched = await store.getSession(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('returns null for unknown session', async () => {
    const result = await store.getSession('nonexistent-id');
    expect(result).toBeNull();
  });

  it('updates session status', async () => {
    const session = await store.createSession({cwd: tmpDir});
    const updated = await store.updateSession(session.id, {status: 'completed'});
    expect(updated?.status).toBe('completed');
    const fetched = await store.getSession(session.id);
    expect(fetched?.status).toBe('completed');
  });

  it('lists sessions', async () => {
    await store.createSession({cwd: tmpDir});
    await store.createSession({cwd: tmpDir});
    const sessions = await store.listSessions();
    expect(sessions.length).toBe(2);
  });

  it('filters sessions by status', async () => {
    const s1 = await store.createSession({cwd: tmpDir});
    await store.updateSession(s1.id, {status: 'completed'});
    await store.createSession({cwd: tmpDir});
    const active = await store.listSessions({status: 'active'});
    expect(active.length).toBe(1);
  });

  it('appends message and increments counter', async () => {
    const session = await store.createSession({cwd: tmpDir});
    const msg = createBridgeMessage('task.created', {taskId: 't1'});
    await store.appendMessage(session.id, msg);
    const updated = await store.getSession(session.id);
    expect(updated?.counters.messages).toBe(1);
    expect(updated?.lastMessage).toBe('task.created');
  });

  it('increments toolCalls counter on tool.completed', async () => {
    const session = await store.createSession({cwd: tmpDir});
    await store.appendMessage(session.id, createBridgeMessage('tool.completed', {toolName: 'readFile'}));
    const updated = await store.getSession(session.id);
    expect(updated?.counters.toolCalls).toBe(1);
  });

  it('increments errors counter on bridge.error', async () => {
    const session = await store.createSession({cwd: tmpDir});
    await store.appendMessage(session.id, createBridgeMessage('bridge.error', {code: 'ERR'}));
    const updated = await store.getSession(session.id);
    expect(updated?.counters.errors).toBe(1);
  });

  it('redacts secrets from metadata', async () => {
    const session = await store.createSession({
      cwd: tmpDir,
      metadata: {token: 'sk-ant-api-secretxxxxxxxxxx1234567'},
    });
    expect(session.metadata['token']).toBe('[REDACTED]');
  });
});
