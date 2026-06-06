import type {GlobalMemory, ProjectMemory} from './types.js';
import {normalizeWhitespace, sanitizeText, uniqueStrings} from './sanitize.js';

export const mergeParagraphs = (existing?: string, next?: string): string | undefined => {
  const values = uniqueStrings([existing, next], 2);
  return values.length > 0 ? values.join('\n\n') : undefined;
};

export const mergeRecentErrors = (
  existing: ProjectMemory['recentErrors'],
  next: ProjectMemory['recentErrors'],
): ProjectMemory['recentErrors'] => {
  const merged = new Map<string, {message: string; fix?: string}>();

  for (const candidate of [...(existing ?? []), ...(next ?? [])]) {
    const message = sanitizeText(candidate.message);
    if (!message) {
      continue;
    }

    const key = normalizeWhitespace(message).toLowerCase();
    const fix = sanitizeText(candidate.fix);
    const current = merged.get(key);
    merged.set(key, {
      message: normalizeWhitespace(message),
      fix: fix ?? current?.fix,
    });
  }

  return Array.from(merged.values()).slice(0, 10);
};

export const compactProjectMemory = (memory: Partial<ProjectMemory>): ProjectMemory => ({
  architecture: mergeParagraphs(undefined, memory.architecture),
  buildCommand: sanitizeText(memory.buildCommand),
  conventions: uniqueStrings(memory.conventions ?? [], 20),
  importantCommands: uniqueStrings(memory.importantCommands ?? [], 20),
  importantFiles: uniqueStrings(memory.importantFiles ?? [], 20),
  lintCommand: sanitizeText(memory.lintCommand),
  pitfalls: uniqueStrings(memory.pitfalls ?? [], 20),
  purpose: mergeParagraphs(undefined, memory.purpose),
  recentErrors: mergeRecentErrors(undefined, memory.recentErrors),
  testCommand: sanitizeText(memory.testCommand),
  userPreferences: uniqueStrings(memory.userPreferences ?? [], 20),
});

export const compactGlobalMemory = (memory: Partial<GlobalMemory>): GlobalMemory => ({
  codingStyle: sanitizeText(memory.codingStyle),
  commitStyle: memory.commitStyle,
  customRules: uniqueStrings(memory.customRules ?? [], 20),
  explanationStyle: sanitizeText(memory.explanationStyle),
  preferredModels: Object.fromEntries(
    Object.entries(memory.preferredModels ?? {}).filter(([, value]) => Boolean(sanitizeText(value))),
  ),
  preferredProviders: uniqueStrings(memory.preferredProviders ?? [], 10),
  testStrategy: sanitizeText(memory.testStrategy),
});
