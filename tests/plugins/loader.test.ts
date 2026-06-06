import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {loadPluginCatalog, resolvePluginDirectories} from '../../src/plugins/loader.js';

describe('plugin loader', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-plugin-'));
    await fs.mkdir(path.join(projectDir, '.apeironcode-agent', 'plugins'), {recursive: true});
    await fs.writeFile(
      path.join(projectDir, '.apeironcode-agent', 'plugins', 'demo.json'),
      JSON.stringify(
        {
          description: 'Demo plugin',
          mcpServers: [{args: ['server.js'], command: 'node', name: 'demo-mcp', type: 'stdio'}],
          name: 'demo',
          prompts: [{name: 'summarize', template: 'Summarize {{input}}'}],
          tools: [{name: 'demo_tool'}],
          version: '1.0.0',
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('loads plugin manifests from the default plugin directory', async () => {
    const plugins = await loadPluginCatalog({config: DEFAULT_CONFIG, cwd: projectDir});

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.manifest.name).toBe('demo');
    expect(plugins[0]?.manifest.mcpServers).toHaveLength(1);
  });

  it('marks disabled plugins from config', async () => {
    const plugins = await loadPluginCatalog({
      config: {
        ...DEFAULT_CONFIG,
        plugins: {directories: [], disabled: ['demo']},
      },
      cwd: projectDir,
    });

    expect(plugins[0]?.enabled).toBe(false);
  });

  it('resolves configured plugin directories relative to the workspace', () => {
    const directories = resolvePluginDirectories(projectDir, {
      ...DEFAULT_CONFIG,
      plugins: {directories: ['custom-plugins'], disabled: []},
    });

    expect(directories).toContain(path.join(projectDir, '.apeironcode-agent', 'plugins'));
    expect(directories).toContain(path.join(projectDir, 'custom-plugins'));
  });
});