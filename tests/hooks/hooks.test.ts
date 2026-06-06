import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {formatHooks} from '../../src/hooks/format.js';
import {HookRegistry} from '../../src/hooks/registry.js';
import {runHook} from '../../src/hooks/runner.js';

describe('hooks', () => {
  it('loads hooks and requires approval for shell hooks', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'opencode-hooks-'));
    await writeFile(path.join(cwd, '.apeironcode-agent', 'hooks.json'), JSON.stringify({
      hooks: [{command: 'echo ok', enabled: true, event: 'before_plan', name: 'say-ok', type: 'shell'}],
    }), {encoding: 'utf8', flag: 'w'}).catch(async () => {
      const fs = await import('node:fs/promises');
      await fs.mkdir(path.join(cwd, '.apeironcode-agent'), {recursive: true});
      await writeFile(path.join(cwd, '.apeironcode-agent', 'hooks.json'), JSON.stringify({
        hooks: [{command: 'echo ok', enabled: true, event: 'before_plan', name: 'say-ok', type: 'shell'}],
      }));
    });
    const registry = new HookRegistry(cwd);
    const hooks = await registry.list();
    expect(formatHooks(hooks)).toContain('say-ok');
    const result = await runHook(hooks[0]!, {cwd});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('approval');
  });
});
