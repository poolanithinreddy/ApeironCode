import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mapAgentEventToBridgeMessage, attachBridgeToEventBus, detachBridgeFromEventBus} from '../../src/bridge/eventAdapter.js';
import {sanitizeBridgeMessage} from '../../src/bridge/redaction.js';
import {EventBus} from '../../src/core/events/bus.js';
import {BridgeServer} from '../../src/bridge/server.js';
import {InMemoryTransport} from '../../src/bridge/transport/inMemory.js';
import {createEventTimestamp} from '../../src/core/events/events.js';
import type {AgentEvent} from '../../src/core/events/events.js';
import type {BridgeMessage} from '../../src/bridge/types.js';

const ts = () => createEventTimestamp();

describe('mapAgentEventToBridgeMessage', () => {
  it('maps task.started to task.updated with running status', () => {
    const event: AgentEvent = {type: 'task.started', taskId: 'abc', timestamp: ts()};
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('task.updated');
    expect(msg?.payload['status']).toBe('running');
    expect(msg?.payload['taskId']).toBe('abc');
  });

  it('maps task.created to task.created message', () => {
    const event: AgentEvent = {type: 'task.created', taskId: 't1', kind: 'agent', title: 'Build feature', timestamp: ts()};
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('task.created');
    expect(msg?.payload['taskId']).toBe('t1');
    expect(msg?.payload['kind']).toBe('agent');
  });

  it('maps task.completed to task.completed message', () => {
    const event: AgentEvent = {type: 'task.completed', taskId: 't2', timestamp: ts()};
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('task.completed');
    expect(msg?.payload['status']).toBe('succeeded');
  });

  it('maps task.failed to task.failed message', () => {
    const event: AgentEvent = {type: 'task.failed', taskId: 't3', errorSummary: 'Rate limited', timestamp: ts()};
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('task.failed');
    expect(msg?.payload['taskId']).toBe('t3');
  });

  it('maps worktree.created', () => {
    const event: AgentEvent = {type: 'worktree.created', worktreeId: 'w1', branchName: 'feat/abc', taskId: 't1', timestamp: ts()};
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('worktree.created');
    expect(msg?.payload['branchName']).toBe('feat/abc');
  });

  it('maps loop.progress to agent.progress', () => {
    const event: AgentEvent = {
      type: 'loop.progress',
      iteration: 3,
      budget: 50,
      remainingBudget: 47,
      progress: {} as never,
      timestamp: ts(),
    };
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('agent.progress');
    expect(msg?.payload['iteration']).toBe(3);
  });

  it('sanitizes secret-like payload after sanitizeBridgeMessage is applied', () => {
    // mapAgentEventToBridgeMessage creates raw messages; sanitization occurs at broadcast via sanitizeBridgeMessage.
    const event: AgentEvent = {type: 'task.failed', taskId: 't4', errorSummary: 'sk-ant-api-secretxxxxxxxxxxx used', timestamp: ts()};
    const raw = mapAgentEventToBridgeMessage(event);
    expect(raw).not.toBeNull();
    // After sanitization (as done at broadcast time), secret is redacted
    const sanitized = sanitizeBridgeMessage(raw!);
    expect(sanitized.payload['errorSummary']).not.toContain('sk-ant-api-secret');
  });

  it('returns null for unknown events', () => {
    const unknown = {type: 'unknown.custom.event', timestamp: ts()} as unknown as AgentEvent;
    const msg = mapAgentEventToBridgeMessage(unknown);
    expect(msg).toBeNull();
  });

  it('maps error event to bridge.error', () => {
    const event: AgentEvent = {type: 'error', message: 'Something went wrong', scope: 'agent', timestamp: ts()};
    const msg = mapAgentEventToBridgeMessage(event);
    expect(msg?.type).toBe('bridge.error');
    expect(msg?.payload['scope']).toBe('agent');
  });
});

describe('attachBridgeToEventBus / detachBridgeFromEventBus', () => {
  let transport: InMemoryTransport;
  let server: BridgeServer;
  let bus: EventBus;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    server = new BridgeServer({transport});
    await server.start();
    bus = new EventBus();
  });

  afterEach(async () => { await server.stop(); });

  it('broadcasts task.created event to authenticated clients', async () => {
    const sub = attachBridgeToEventBus(bus, server);
    const connId = transport.connect({authenticated: true});

    bus.emit({type: 'task.created', taskId: 't5', kind: 'agent', title: 'Test', timestamp: createEventTimestamp()});
    await new Promise((r) => setTimeout(r, 10)); // let async handler settle

    const msgs = transport.getClientMessages(connId);
    expect(msgs.some((m: BridgeMessage) => m.type === 'task.created')).toBe(true);
    detachBridgeFromEventBus(sub);
  });

  it('stops broadcasting after detach', async () => {
    const sub = attachBridgeToEventBus(bus, server);
    detachBridgeFromEventBus(sub);

    const connId = transport.connect({authenticated: true});
    bus.emit({type: 'task.created', taskId: 't6', kind: 'shell', title: 'After detach', timestamp: createEventTimestamp()});
    await new Promise((r) => setTimeout(r, 10));

    const msgs = transport.getClientMessages(connId);
    expect(msgs).toHaveLength(0);
  });
});
