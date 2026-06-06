import path from 'node:path';

import {buildRelevantMemory, type RelevantMemory} from './relevantMemory.js';
import {ensureDirectory, fileExists, readTextFile, writeTextFile} from '../utils/fs.js';
import {logger} from '../utils/logger.js';
import {compactGlobalMemory, compactProjectMemory, mergeParagraphs, mergeRecentErrors} from './memory/compact.js';
import {
  buildMemorySuggestions,
  describeLoadedMemory,
  formatMemorySuggestionPreview,
  formatMemoryWhy,
  formatProjectMemoryPreview,
  projectMemoryToMarkdown,
} from './memory/formatting.js';
import {parseGlobalMemoryMarkdown, parseProjectMemoryMarkdown} from './memory/parsing.js';
import {
  filterSensitiveMemoryFiles,
  sanitizeText,
  uniqueStrings,
} from './memory/sanitize.js';
import type {
  GlobalMemory,
  LoadedMemoryReason,
  MemorySuggestion,
  ProjectMemory,
  ProjectMemoryExtractionInput,
  SessionMemory,
  SessionMemoryExtractionInput,
} from './memory/types.js';

export type {
  GlobalMemory,
  LoadedMemoryReason,
  MemorySuggestion,
  MemorySuggestionCategory,
  ProjectMemory,
  SessionMemory,
} from './memory/types.js';
export {containsSensitiveMemoryContent} from './memory/sanitize.js';

export type {RelevantMemory} from './relevantMemory.js';

export class MemoryManager {
  private readonly projectDir: string;
  private projectMemoryPath: string;
  private globalMemoryDir: string;
  private globalMemoryPath: string;
  private globalMemoryRoot: string;

  constructor(projectDir: string, globalMemoryDir?: string) {
    this.projectDir = projectDir;
    this.projectMemoryPath = path.join(projectDir, '.apeironcode-agent', 'memory.md');
    this.globalMemoryDir = globalMemoryDir || path.join(process.env.HOME || '/tmp', '.apeironcode-agent', 'memory');
    this.globalMemoryPath = path.join(this.globalMemoryDir, 'global.md');
    this.globalMemoryRoot = path.resolve(this.globalMemoryDir, '..', '..');
  }

  async loadProjectMemory(): Promise<ProjectMemory | null> {
    try {
      if (!(await fileExists(this.projectMemoryPath))) {
        return null;
      }
      const content = await readTextFile(this.projectMemoryPath);
      return parseProjectMemoryMarkdown(content);
    } catch (error) {
      logger.debug(`Failed to load project memory: ${String(error)}`);
      return null;
    }
  }

  async loadGlobalMemory(): Promise<GlobalMemory | null> {
    try {
      if (!(await fileExists(this.globalMemoryPath))) {
        return null;
      }
      const content = await readTextFile(this.globalMemoryPath);
      return parseGlobalMemoryMarkdown(content);
    } catch (error) {
      logger.debug(`Failed to load global memory: ${String(error)}`);
      return null;
    }
  }

  async saveProjectMemory(memory: Partial<ProjectMemory>, append = false): Promise<void> {
    try {
      await ensureDirectory(path.dirname(this.projectMemoryPath));
      const nextMemory = append
        ? this.mergeProjectMemory(await this.loadProjectMemory(), memory)
        : compactProjectMemory(memory);
      await writeTextFile(this.projectMemoryPath, projectMemoryToMarkdown(nextMemory));
    } catch (error) {
      logger.error(`Failed to save project memory: ${String(error)}`);
    }
  }

  async saveGlobalMemory(memory: Partial<GlobalMemory>): Promise<void> {
    try {
      await ensureDirectory(this.globalMemoryDir);
      const existing = await this.loadGlobalMemory();
      const merged = compactGlobalMemory({
        ...existing,
        ...memory,
      });

      const content = [
        '# ApeironCode Global Memory',
        '',
        '## Coding Style',
        merged.codingStyle || 'Not specified',
        '',
        '## Preferred Providers',
        (merged.preferredProviders || []).join('\n') || 'None',
        '',
        '## Preferred Models',
        Object.entries(merged.preferredModels || {})
          .map(([role, model]) => `- ${role}: ${model}`)
          .join('\n') || 'None',
        '',
        '## Test Strategy',
        merged.testStrategy || 'Not specified',
        '',
        '## Commit Style',
        merged.commitStyle || 'plain',
        '',
        '## Explanation Style',
        merged.explanationStyle || 'Not specified',
        '',
        '## Custom Rules',
        (merged.customRules || []).map(r => `- ${r}`).join('\n') || 'None',
      ].join('\n');

      await writeTextFile(this.globalMemoryPath, content);
    } catch (error) {
      logger.error(`Failed to save global memory: ${String(error)}`);
    }
  }

  mergeProjectMemory(existing: ProjectMemory | null, updates: Partial<ProjectMemory>): ProjectMemory {
    return compactProjectMemory({
      architecture: mergeParagraphs(existing?.architecture, updates.architecture),
      buildCommand: updates.buildCommand ?? existing?.buildCommand,
      conventions: uniqueStrings([...(existing?.conventions ?? []), ...(updates.conventions ?? [])]),
      importantCommands: uniqueStrings([...(existing?.importantCommands ?? []), ...(updates.importantCommands ?? [])]),
      importantFiles: uniqueStrings([...(existing?.importantFiles ?? []), ...(updates.importantFiles ?? [])]),
      lintCommand: updates.lintCommand ?? existing?.lintCommand,
      pitfalls: uniqueStrings([...(existing?.pitfalls ?? []), ...(updates.pitfalls ?? [])]),
      purpose: mergeParagraphs(existing?.purpose, updates.purpose),
      recentErrors: mergeRecentErrors(existing?.recentErrors, updates.recentErrors),
      testCommand: updates.testCommand ?? existing?.testCommand,
      userPreferences: uniqueStrings([...(existing?.userPreferences ?? []), ...(updates.userPreferences ?? [])]),
    });
  }

  summarizeProjectMemory(memory: ProjectMemory | null): ProjectMemory {
    return compactProjectMemory(memory ?? {});
  }

  summarizeGlobalMemory(memory: GlobalMemory | null): GlobalMemory {
    return compactGlobalMemory(memory ?? {});
  }

  hasMeaningfulProjectMemory(memory: Partial<ProjectMemory>): boolean {
    return Boolean(
      sanitizeText(memory.purpose)
      || sanitizeText(memory.architecture)
      || (memory.importantFiles && memory.importantFiles.length > 0)
      || (memory.importantCommands && memory.importantCommands.length > 0)
      || sanitizeText(memory.testCommand)
      || sanitizeText(memory.buildCommand)
      || sanitizeText(memory.lintCommand)
      || (memory.conventions && memory.conventions.length > 0)
      || (memory.pitfalls && memory.pitfalls.length > 0)
      || (memory.recentErrors && memory.recentErrors.length > 0)
      || (memory.userPreferences && memory.userPreferences.length > 0)
    );
  }

  formatProjectMemoryPreview(memory: Partial<ProjectMemory>): string {
    return formatProjectMemoryPreview(memory);
  }

  buildMemorySuggestions(memory: Partial<ProjectMemory>): Array<Omit<MemorySuggestion, 'decision'>> {
    return buildMemorySuggestions(memory);
  }

  formatMemorySuggestionPreview(memory: Partial<ProjectMemory>): string {
    return formatMemorySuggestionPreview(memory);
  }

  describeLoadedMemory({
    globalMemory,
    projectMemory,
  }: {
    globalMemory: GlobalMemory | null;
    projectMemory: ProjectMemory | null;
  }): LoadedMemoryReason[] {
    return describeLoadedMemory({globalMemory, projectMemory});
  }

  formatMemoryWhy(reasons: LoadedMemoryReason[]): string {
    return formatMemoryWhy(reasons);
  }

  async loadRelevantMemory(prompt: string, limit = 12, maxTokens?: number): Promise<RelevantMemory> {
    const [projectMemory, globalMemory] = await Promise.all([
      this.loadProjectMemory(),
      this.loadGlobalMemory(),
    ]);

    return buildRelevantMemory({
      globalMemory,
      globalMemoryRoot: this.globalMemoryRoot,
      limit,
      maxTokens,
      projectDir: this.projectDir,
      projectMemory,
      prompt,
    });
  }

  async explainRelevantMemory(prompt: string, limit = 12): Promise<RelevantMemory> {
    return this.loadRelevantMemory(prompt, limit);
  }

  extractProjectMemoryFromRun({
    goal,
    mode,
    projectScan,
    relevantFiles = [],
    summary,
    taskState,
  }: ProjectMemoryExtractionInput): Partial<ProjectMemory> {
    const importantFiles = filterSensitiveMemoryFiles(uniqueStrings([
      ...(taskState?.filesChanged ?? []),
      ...(taskState?.filesRead ?? []),
      ...relevantFiles,
    ], 8));
    const importantCommands = uniqueStrings([
      ...(taskState?.commandsRun ?? []),
      ...(taskState?.testsRun ?? []),
    ], 8);
    // Provider/auth/transport failures are environment problems, not durable
    // project knowledge. Never persist them as pitfalls or recent errors.
    const providerOrAuthFailure = /\b401\b|\b403\b|\b400\b|\b422\b|unauthorized|forbidden|authentication failed|invalid api key|invalid token|expired token|missing models: read|provider returned \d|rejected the request payload|provider_bad_request|rate limit|quota exceeded|provider_auth_error/iu;
    const durableErrors = (taskState?.errors ?? []).filter(
      (message) => !providerOrAuthFailure.test(message),
    );
    const recentErrors = durableErrors.slice(0, 5).map((message) => ({
      fix: summary && taskState?.filesChanged?.length
        ? `Updated ${taskState.filesChanged.slice(0, 3).join(', ')}`
        : undefined,
      message,
    }));

    const architectureFacts = projectScan
      ? [
          projectScan.frameworks.length ? `Frameworks: ${projectScan.frameworks.join(', ')}` : null,
          projectScan.languages.length ? `Languages: ${projectScan.languages.join(', ')}` : null,
          projectScan.sourceDirectories.length ? `Source directories: ${projectScan.sourceDirectories.join(', ')}` : null,
        ].filter(Boolean).join('\n')
      : undefined;

    const pitfalls = uniqueStrings([
      ...(mode === 'test-fix' && durableErrors.length
        ? ['If local test dependencies are missing, confirm the project test command resolves binaries correctly.']
        : []),
      ...durableErrors,
    ], 6);

    return compactProjectMemory({
      architecture: architectureFacts,
      buildCommand: projectScan?.buildCommand ?? undefined,
      importantCommands,
      importantFiles,
      lintCommand: projectScan?.lintCommand ?? undefined,
      pitfalls,
      purpose: sanitizeText(goal),
      recentErrors,
      testCommand: projectScan?.testCommand ?? undefined,
      userPreferences: mode === 'review'
        ? ['Prefer review findings grouped by severity and backed by concrete evidence.']
        : undefined,
    });
  }

  extractMemoryFromTask(goal: string, filesChanged: string[], successSummary?: string): Partial<ProjectMemory> {
    const extracted: Partial<ProjectMemory> = {};

    if (filesChanged.length > 0 && !extracted.importantFiles) {
      extracted.importantFiles = filterSensitiveMemoryFiles(filesChanged.slice(0, 5));
    }

    if (successSummary) {
      const testMatch = successSummary.match(/test.*command[:\s]+([^\n]+)/i);
      const buildMatch = successSummary.match(/build.*command[:\s]+([^\n]+)/i);
      const lintMatch = successSummary.match(/lint.*command[:\s]+([^\n]+)/i);

      if (testMatch) extracted.testCommand = testMatch[1]?.trim();
      if (buildMatch) extracted.buildCommand = buildMatch[1]?.trim();
      if (lintMatch) extracted.lintCommand = lintMatch[1]?.trim();
    }

    return extracted;
  }

  extractSessionMemoryFromRun({
    goal,
    mode,
    finalResult,
    memorySuggestions = [],
    memoryWhy = [],
    taskState,
    toolCalls = [],
  }: SessionMemoryExtractionInput): SessionMemory {
    const createdAt = taskState?.startedAt ?? new Date().toISOString();
    const completedAt = new Date().toISOString();
    const decisionsMade = uniqueStrings([
      ...toolCalls
        .filter((toolCall) => toolCall.permissionDecision)
        .map((toolCall) => `${toolCall.toolName}:${toolCall.permissionDecision}`),
      ...memorySuggestions.map((suggestion) => `${suggestion.category}:${suggestion.decision}`),
    ], 20);
    const failedAttempts = uniqueStrings([
      ...(taskState?.errors ?? []),
      ...toolCalls
        .filter((toolCall) => toolCall.status === 'error')
        .map((toolCall) => `${toolCall.toolName}: ${toolCall.error ?? 'failed'}`),
    ], 12);
    const followUpTasks = uniqueStrings([
      ...(taskState?.todos ?? [])
        .filter((todo) => todo.status === 'failed' || todo.status === 'pending')
        .map((todo) => todo.content),
      ...(taskState?.filesChanged?.length && !(taskState.testsRun?.length)
        ? ['Run the narrowest relevant validation for the changed files.']
        : []),
      ...(failedAttempts.length > 0 ? ['Resolve the recorded errors before expanding scope.'] : []),
    ], 8);

    return {
      commandsRun: uniqueStrings(taskState?.commandsRun ?? [], 20),
      completedAt,
      createdAt,
      decisionsMade,
      failedAttempts,
      filesInspected: filterSensitiveMemoryFiles(uniqueStrings(taskState?.filesRead ?? [], 20)),
      filesModified: filterSensitiveMemoryFiles(uniqueStrings(taskState?.filesChanged ?? [], 20)),
      finalResult: sanitizeText(finalResult),
      followUpTasks,
      goal,
      memorySuggestions,
      memoryWhy,
      mode,
      summary: sanitizeText(finalResult)?.slice(0, 280),
      tags: uniqueStrings([
        mode,
        ...memorySuggestions.map((suggestion) => suggestion.category),
      ], 10),
      testsRun: uniqueStrings(taskState?.testsRun ?? [], 20),
    };
  }

}
