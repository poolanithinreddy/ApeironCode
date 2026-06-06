import {readJsonFile} from '../utils/fs.js';
import type {LoadedPluginManifest, PluginManifest} from './types.js';
import {PluginManifestSchema} from './types.js';

export const isPluginManifestPath = (filePath: string): boolean => filePath.endsWith('.json');

export const readPluginManifest = async (
  filePath: string,
  directory: string,
  enabled: boolean,
): Promise<LoadedPluginManifest> => {
  const raw = await readJsonFile<PluginManifest>(filePath, {} as PluginManifest);
  const parsed = PluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      directory,
      enabled,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
      filePath,
      manifest: {
        mcpServers: [],
        name: filePath.split('/').pop()?.replace(/\.json$/u, '') ?? 'invalid-plugin',
        permissions: [],
        prompts: [],
        schemaVersion: 1,
        tools: [],
        version: 'invalid',
      },
    };
  }

  return {
    directory,
    enabled,
    errors: [],
    filePath,
    manifest: parsed.data,
  };
};