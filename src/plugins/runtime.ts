import path from 'node:path';
import {z} from 'zod';

import type {ToolDefinition, ToolExecutionContext, ToolResult} from '../tools/types.js';
import {defineTool} from '../tools/types.js';
import {AppError} from '../utils/errors.js';
import {fileExists} from '../utils/fs.js';
import {executePluginTool, parsePluginOutput} from './executor.js';
import type {LoadedPluginManifest} from './types.js';

export interface PluginToolDefinition extends Omit<ToolDefinition, 'run'> {
  pluginName: string;
  pluginDir: string;
  entrypointPath: string;
  run: (input: unknown, context: ToolExecutionContext) => Promise<ToolResult>;
}

const createPluginToolDefinition = (
  pluginName: string,
  pluginDir: string,
  entrypointPath: string,
  toolManifest: {name: string; description?: string},
): PluginToolDefinition => {
  const tool = defineTool({
    name: `plugin:${pluginName}.${toolManifest.name}`,
    displayName: `${pluginName}/${toolManifest.name}`,
    description: toolManifest.description || `Tool from plugin ${pluginName}`,
    inputSchema: z.record(z.unknown()),
    requiresApproval: true,
    riskLevel: 'high',
    async run(input, context) {
      try {
        const result = await executePluginTool(
          entrypointPath,
          toolManifest.name,
          input,
          context.cwd,
        );

        const output = parsePluginOutput(result);

        return {
          ok: true,
          summary: `Plugin ${pluginName} tool ${toolManifest.name} executed successfully`,
          output: JSON.stringify(output, null, 2),
          metadata: {
            pluginName,
            toolName: toolManifest.name,
          },
        };
      } catch (err) {
        const message = err instanceof AppError ? err.message : String(err);
        return {
          ok: false,
          summary: `Plugin ${pluginName} tool ${toolManifest.name} failed`,
          output: message,
        };
      }
    },
  });

  // Type-safe return: spreading tool and adding required fields
  const pluginTool: PluginToolDefinition = {
    ...tool,
    pluginName,
    pluginDir,
    entrypointPath,
  };
  return pluginTool;
};

export const getPluginTools = async (
  plugin: LoadedPluginManifest,
): Promise<PluginToolDefinition[]> => {
  if (!plugin.enabled) {
    return [];
  }

  if (plugin.errors.length > 0) {
    return [];
  }

  const entrypointPath = path.join(plugin.directory, 'plugin.js');
  const entrypointExists = await fileExists(entrypointPath);

  if (!entrypointExists) {
    return [];
  }

  return plugin.manifest.tools.map((toolManifest) =>
    createPluginToolDefinition(
      plugin.manifest.name,
      plugin.directory,
      entrypointPath,
      toolManifest,
    ),
  );
};

export const loadAllPluginTools = async (
  plugins: LoadedPluginManifest[],
): Promise<PluginToolDefinition[]> => {
  const allTools: PluginToolDefinition[] = [];

  for (const plugin of plugins) {
    const tools = await getPluginTools(plugin);
    allTools.push(...tools);
  }

  return allTools;
};
