import path from 'node:path';

import {ensureDirectory, readJsonFile, readTextFile, writeJsonFile, writeTextFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';
import type {LoadedSkill, SkillMetadata} from './types.js';
import {validateSkillMetadata, validateSkillName} from './validator.js';

export const getSkillsDir = (cwd: string): string => path.join(getProjectConfigDir(cwd), 'skills');
export const getSkillDir = (cwd: string, name: string): string => path.join(getSkillsDir(cwd), validateSkillName(name));
export const getSkillJsonPath = (cwd: string, name: string): string => path.join(getSkillDir(cwd, name), 'skill.json');
export const getSkillMarkdownPath = (cwd: string, name: string): string => path.join(getSkillDir(cwd, name), 'skill.md');

export class SkillStore {
  constructor(private readonly cwd: string) {}

  async listNames(): Promise<string[]> {
    const fs = await import('node:fs/promises');
    try {
      const entries = await fs.readdir(getSkillsDir(this.cwd), {withFileTypes: true});
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    } catch {
      return [];
    }
  }

  async load(name: string): Promise<LoadedSkill | null> {
    try {
      const metadata = validateSkillMetadata(await readJsonFile<unknown>(getSkillJsonPath(this.cwd, name), null));
      const markdown = await readTextFile(getSkillMarkdownPath(this.cwd, name));
      return {
        directory: getSkillDir(this.cwd, name),
        markdown,
        metadata,
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<LoadedSkill[]> {
    const names = await this.listNames();
    const skills = await Promise.all(names.map((name) => this.load(name)));
    return skills.filter((skill): skill is LoadedSkill => skill !== null);
  }

  async save(metadata: SkillMetadata, markdown: string): Promise<LoadedSkill> {
    const valid = validateSkillMetadata(metadata);
    await ensureDirectory(getSkillDir(this.cwd, valid.name));
    await writeJsonFile(getSkillJsonPath(this.cwd, valid.name), valid);
    await writeTextFile(getSkillMarkdownPath(this.cwd, valid.name), markdown);
    return {
      directory: getSkillDir(this.cwd, valid.name),
      markdown,
      metadata: valid,
    };
  }

  async updateTags(name: string, updater: (tags: string[]) => string[]): Promise<LoadedSkill | null> {
    const skill = await this.load(name);
    if (!skill) {
      return null;
    }
    const tags = Array.from(new Set(updater(skill.metadata.tags).map((tag) => tag.trim()).filter(Boolean))).sort();
    return this.save({...skill.metadata, tags}, skill.markdown);
  }

  async delete(name: string): Promise<boolean> {
    const fs = await import('node:fs/promises');
    try {
      await fs.rm(getSkillDir(this.cwd, name), {force: true, recursive: true});
      return true;
    } catch {
      return false;
    }
  }
}
