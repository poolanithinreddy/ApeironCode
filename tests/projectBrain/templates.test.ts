import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {loadAgentDefinition} from '../../src/workflows/agents/loader.js';
import {loadCommandDefinition} from '../../src/workflows/commands/loader.js';
import {DEFAULT_AGENT_TEMPLATES, DEFAULT_COMMAND_TEMPLATES, renderProjectBrainTemplate} from '../../src/projectBrain/templates.js';

describe('Project Brain templates', () => {
  it('renders core templates without stale branding or secrets', () => {
    const content = renderProjectBrainTemplate('project', {
      now: '2026-01-01T00:00:00.000Z',
      projectName: 'demo',
      projectRootFingerprint: 'demo-123',
    });
    expect(content).toContain('Project Brain');
    expect(content).not.toContain('OpenCode');
    expect(content).not.toMatch(/sk-[A-Za-z0-9_-]+/u);
  });

  it('validates default agent and command templates through workflow loaders', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-brain-templates-'));
    const agentPath = path.join(cwd, 'architect.md');
    const commandPath = path.join(cwd, 'continue-plan.md');
    await fs.writeFile(agentPath, DEFAULT_AGENT_TEMPLATES['architect.md'] ?? '');
    await fs.writeFile(commandPath, DEFAULT_COMMAND_TEMPLATES['continue-plan.md'] ?? '');
    expect(loadAgentDefinition(agentPath, 'project').definition?.name).toBe('architect');
    expect(loadCommandDefinition(commandPath, 'project').definition?.name).toBe('continue-plan');
  });
});
