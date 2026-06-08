import path from 'node:path';

import {readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';
import type {HookConfig, HookDefinition} from './types.js';

export const getHooksPath = (cwd: string): string => path.join(getProjectConfigDir(cwd), 'hooks.json');

export class HookRegistry {
  constructor(private readonly cwd: string) {}

  async load(): Promise<HookConfig> {
    const config = await readJsonFile<HookConfig>(getHooksPath(this.cwd), {hooks: []});
    return {hooks: Array.isArray(config.hooks) ? config.hooks : []};
  }

  async save(config: HookConfig): Promise<void> {
    await writeJsonFile(getHooksPath(this.cwd), config);
  }

  async list(): Promise<HookDefinition[]> {
    return (await this.load()).hooks;
  }

  async setEnabled(name: string, enabled: boolean): Promise<boolean> {
    const config = await this.load();
    let changed = false;
    const hooks = config.hooks.map((hook) => {
      if (hook.name !== name) {
        return hook;
      }
      changed = true;
      return {...hook, enabled};
    });
    if (changed) {
      await this.save({hooks});
    }
    return changed;
  }
}
