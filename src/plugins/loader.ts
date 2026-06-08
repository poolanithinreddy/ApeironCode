import {readdir} from 'node:fs/promises';
import path from 'node:path';

import type {ApeironCodeConfig} from '../config/config.js';
import {fileExists} from '../utils/fs.js';
import {readPluginManifest, isPluginManifestPath} from './manifest.js';
import type {LoadedPluginManifest} from './types.js';

export const getDefaultPluginDirectories = (cwd: string): string[] => [
  path.resolve(cwd, '.apeironcode-agent/plugins'),
];

export const resolvePluginDirectories = (cwd: string, config: ApeironCodeConfig): string[] => {
  return Array.from(
    new Set(
      [...getDefaultPluginDirectories(cwd), ...config.plugins.directories].map((directory) =>
        path.resolve(cwd, directory),
      ),
    ),
  );
};

export const loadPluginCatalog = async ({
  config,
  cwd,
}: {
  config: ApeironCodeConfig;
  cwd: string;
}): Promise<LoadedPluginManifest[]> => {
  const directories = resolvePluginDirectories(cwd, config);
  const manifests: LoadedPluginManifest[] = [];

  for (const directory of directories) {
    if (!(await fileExists(directory))) {
      continue;
    }

    const entries = await readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(directory, entry.name);
      if (!isPluginManifestPath(filePath)) {
        continue;
      }

      const loaded = await readPluginManifest(
        filePath,
        directory,
        !config.plugins.disabled.includes(entry.name.replace(/\.json$/u, '')),
      );
      manifests.push(loaded);
    }
  }

  return manifests.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
};