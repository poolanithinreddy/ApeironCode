import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createSession} from '../../src/agent/session.js';
import {SessionStore} from '../../src/sessions/store.js';

describe('SessionStore', () => {
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-session-home-'));
  });

  afterEach(() => {
    process.env.HOME = previousHome;
  });

  it('saves, lists, loads, and deletes sessions', async () => {
    const store = new SessionStore();
    const session = createSession('/tmp/project', 'mock', 'mock-coder');
    session.messages.push({
      content: 'hello',
      createdAt: new Date().toISOString(),
      id: 'message-1',
      role: 'user',
    });

    await store.save(session);

    const listed = await store.list('/tmp/project');
    expect(listed).toHaveLength(1);

    const loaded = await store.load(session.id);
    expect(loaded?.messages[0]?.content).toBe('hello');

    expect(await store.delete(session.id)).toBe(true);
    expect(await store.load(session.id)).toBeNull();
  });

  it('searches sessions by title and goal', async () => {
    const store = new SessionStore();
    const session = createSession('/tmp/project', 'mock', 'mock-coder', {
      prompt: 'Implement command registry',
    });
    session.lastGoal = 'Refactor slash commands';

    await store.save(session);

    const byTitle = await store.search('command registry', '/tmp/project');
    const byGoal = await store.search('slash commands', '/tmp/project');

    expect(byTitle).toHaveLength(1);
    expect(byGoal).toHaveLength(1);
  });

  it('selects sessions by scope and explicit id', async () => {
    const store = new SessionStore();
    const projectSession = createSession('/tmp/project', 'mock', 'mock-coder', {
      prompt: 'Project session',
    });
    const otherSession = createSession('/tmp/other-project', 'mock', 'mock-coder', {
      prompt: 'Other session',
    });

    await store.save(projectSession);
    await store.save(otherSession);

    expect(await store.select({projectPath: '/tmp/project'})).toHaveLength(1);
    expect(await store.select({all: true})).toHaveLength(2);
    expect(await store.select({sessionId: otherSession.id})).toMatchObject([{id: otherSession.id}]);
  });
});