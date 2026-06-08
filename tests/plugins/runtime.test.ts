import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {getPluginTools, loadAllPluginTools} from '../../src/plugins/runtime.js';
import {readPluginManifest} from '../../src/plugins/manifest.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('Plugin Runtime', () => {
  describe('getPluginTools', () => {
    it('should return empty array when plugin is disabled', async () => {
      const manifest = await readPluginManifest(
        path.resolve(import.meta.url, '../../../examples/plugins/echo-plugin/plugin.json'),
        path.resolve(import.meta.url, '../../../examples/plugins/echo-plugin'),
        false, // disabled
      );
      const tools = await getPluginTools(manifest);
      expect(tools).toHaveLength(0);
    });

    it('should return empty array when plugin has errors', async () => {
      const errorManifest = {
        filePath: 'test.json',
        directory: '/nonexistent',
        enabled: true,
        errors: ['Invalid manifest'],
        manifest: {
          name: 'test-plugin',
          version: '0.0.0',
          tools: [
            {name: 'test-tool', description: 'Test', permissions: []},
          ],
          mcpServers: [],
          permissions: [],
          prompts: [],
          schemaVersion: 1 as const,
        },
      };
      const tools = await getPluginTools(errorManifest);
      expect(tools).toHaveLength(0);
    });

    it('should load tools from enabled plugin with entrypoint', async () => {
      const pluginDir = path.join(testDir, '../../examples/plugins/echo-plugin');
      const manifest = await readPluginManifest(
        path.join(pluginDir, 'plugin.json'),
        pluginDir,
        true, // enabled
      );
      const tools = await getPluginTools(manifest);
      expect(tools.length).toBeGreaterThan(0);
      const firstTool = tools[0];
      expect(firstTool).toBeDefined();
      if (firstTool) {
        expect(firstTool.name).toContain('echo-plugin');
        expect(firstTool.name).toContain('echo');
      }
    });

    it('should return empty array when entrypoint does not exist', async () => {
      const manifest = await readPluginManifest(
        path.resolve(import.meta.url, '../../../examples/plugins/echo-plugin/plugin.json'),
        '/nonexistent-plugin-dir',
        true, // enabled
      );
      const tools = await getPluginTools(manifest);
      expect(tools).toHaveLength(0);
    });
  });

  describe('loadAllPluginTools', () => {
    it('should load tools from multiple plugins', async () => {
      const pluginDir = path.join(testDir, '../../examples/plugins/echo-plugin');
      const manifest1 = await readPluginManifest(
        path.join(pluginDir, 'plugin.json'),
        pluginDir,
        true,
      );
      const manifest2 = {
        filePath: 'test.json',
        directory: '/nonexistent',
        enabled: false,
        errors: [],
        manifest: {
          name: 'disabled-plugin',
          version: '0.0.0',
          tools: [{name: 'disabled-tool', description: 'Disabled', permissions: []}],
          mcpServers: [],
          permissions: [],
          prompts: [],
          schemaVersion: 1 as const,
        },
      };

      const allTools = await loadAllPluginTools([manifest1, manifest2]);
      expect(allTools.length).toBeGreaterThan(0);
      expect(allTools.some((t) => t.name.includes('echo-plugin'))).toBe(true);
    });
  });
});
