import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {ToolRegistry} from '../../src/tools/registry.js';
import {defineTool} from '../../src/tools/types.js';

describe('ToolRegistry provider definitions', () => {
  it('returns minified provider definitions with savings metadata', () => {
    const registry = new ToolRegistry([
      defineTool({
        description: 'Search files thoroughly',
        inputSchema: z.object({
          path: z.string().describe('short'),
          query: z.string().describe('this is a longer description that should remain'),
        }),
        name: 'grep',
        requiresApproval: false,
        riskLevel: 'low',
        run: () => Promise.resolve({ok: true, output: '', summary: ''}),
      }),
      defineTool({
        description: 'Edit files carefully',
        inputSchema: z.object({path: z.string().describe('short')}),
        name: 'edit_file',
        requiresApproval: true,
        riskLevel: 'high',
        run: () => Promise.resolve({ok: true, output: '', summary: ''}),
      }),
    ]);

    const bundle = registry.getProviderToolDefinitionsBundleFor(['grep', 'edit_file'], {
      minifyForProvider: 'openai',
    });
    expect(bundle.definitions).toHaveLength(2);
    expect(bundle.tokensSaved).toBeGreaterThanOrEqual(0);
    const grepSchema = bundle.definitions.find((entry) => entry.name === 'grep')?.input_schema as {
      properties?: Record<string, {description?: string}>;
    };
    expect(grepSchema.properties?.path?.description).toBeUndefined();
    expect(bundle.definitions.some((entry) => entry.name === 'edit_file')).toBe(true);
  });
});
