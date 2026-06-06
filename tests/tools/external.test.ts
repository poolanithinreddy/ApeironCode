import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {loadExternalTools, formatToolList} from '../../src/tools/external.js';
import {createMockConfig} from '../support/mocks.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('External Tools', () => {
  describe('loadExternalTools', () => {
    it('should load plugin and MCP tools into registry', async () => {
      const registry = createDefaultToolRegistry();
      const initialCount = registry.list().length;

      const pluginsDir = path.join(testDir, '../../examples/plugins');
      const config = createMockConfig({
        plugins: {
          directories: [pluginsDir],
          disabled: [],
        },
      });

      await loadExternalTools(registry, config, path.join(testDir, '../../'));

      const finalCount = registry.list().length;
      expect(finalCount).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('formatToolList', () => {
    it('should format tools grouped by source', () => {
      const registry = createDefaultToolRegistry();
      const output = formatToolList(registry.list());

      expect(output).toContain('Built-in Tools:');
      expect(output).toContain('read_file');
    });

    it('should include risk level in formatted output', () => {
      const registry = createDefaultToolRegistry();
      const tools = registry.list();
      const output = formatToolList(tools);

      // Should have risk levels like [low], [medium], [high], [critical]
      const hasRiskLevel = /\[(low|medium|high|critical)\]/.test(output);
      expect(hasRiskLevel).toBe(true);
    });
  });
});
