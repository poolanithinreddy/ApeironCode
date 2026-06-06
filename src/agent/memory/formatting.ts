import {compactProjectMemory} from './compact.js';
import type {GlobalMemory, LoadedMemoryReason, MemorySuggestion, ProjectMemory} from './types.js';

export const formatProjectMemoryPreview = (memory: Partial<ProjectMemory>): string => {
  const compacted = compactProjectMemory(memory);
  return [
    compacted.testCommand ? `- Test command: ${compacted.testCommand}` : null,
    compacted.buildCommand ? `- Build command: ${compacted.buildCommand}` : null,
    compacted.lintCommand ? `- Lint command: ${compacted.lintCommand}` : null,
    compacted.importantFiles?.length ? `- Important files: ${compacted.importantFiles.join(', ')}` : null,
    compacted.importantCommands?.length ? `- Important commands: ${compacted.importantCommands.join(', ')}` : null,
    compacted.architecture ? `- Architecture: ${compacted.architecture}` : null,
    compacted.pitfalls?.length ? `- Pitfalls: ${compacted.pitfalls.join('; ')}` : null,
    compacted.recentErrors?.length
      ? `- Recent errors: ${compacted.recentErrors.map((item) => item.fix ? `${item.message} -> ${item.fix}` : item.message).join('; ')}`
      : null,
  ].filter(Boolean).join('\n');
};

export const buildMemorySuggestions = (memory: Partial<ProjectMemory>): Array<Omit<MemorySuggestion, 'decision'>> => {
  const compacted = compactProjectMemory(memory);
  return [
    compacted.architecture ? {category: 'architecture' as const, summary: compacted.architecture} : null,
    compacted.importantFiles?.length ? {category: 'file' as const, summary: compacted.importantFiles.join(', ')} : null,
    [compacted.testCommand, compacted.buildCommand, compacted.lintCommand, ...(compacted.importantCommands ?? [])].filter(Boolean).length
      ? {
          category: 'command' as const,
          summary: [
            compacted.testCommand && `test=${compacted.testCommand}`,
            compacted.buildCommand && `build=${compacted.buildCommand}`,
            compacted.lintCommand && `lint=${compacted.lintCommand}`,
            ...(compacted.importantCommands ?? []).slice(0, 2),
          ].filter(Boolean).join('; '),
        }
      : null,
    compacted.pitfalls?.length ? {category: 'pitfall' as const, summary: compacted.pitfalls.join('; ')} : null,
    compacted.userPreferences?.length ? {category: 'preference' as const, summary: compacted.userPreferences.join('; ')} : null,
  ].filter((value): value is Omit<MemorySuggestion, 'decision'> => Boolean(value));
};

export const formatMemorySuggestionPreview = (memory: Partial<ProjectMemory>): string => {
  const suggestions = buildMemorySuggestions(memory);
  if (suggestions.length === 0) {
    return formatProjectMemoryPreview(memory);
  }

  return suggestions.map((suggestion) => `- ${suggestion.category}: ${suggestion.summary}`).join('\n');
};

export const describeLoadedMemory = ({
  globalMemory,
  projectMemory,
}: {
  globalMemory: GlobalMemory | null;
  projectMemory: ProjectMemory | null;
}): LoadedMemoryReason[] => {
  const reasons: LoadedMemoryReason[] = [];

  if (projectMemory) {
    reasons.push({
      reason: 'Project memory is loaded for the active workspace to preserve repository-specific context.',
      source: 'project',
      summary: formatProjectMemoryPreview(projectMemory) || 'Project memory is available but minimal.',
    });
  }

  if (globalMemory) {
    const summary = [
      globalMemory.codingStyle,
      globalMemory.testStrategy,
      ...(globalMemory.preferredProviders ?? []),
    ].filter(Boolean).join('; ');
    reasons.push({
      reason: 'Global memory is loaded to preserve user-wide coding and tooling preferences.',
      source: 'global',
      summary: summary || 'Global memory is available but minimal.',
    });
  }

  return reasons;
};

export const formatMemoryWhy = (reasons: LoadedMemoryReason[]): string => {
  if (reasons.length === 0) {
    return 'No memory sources were loaded.';
  }

  return reasons.map((reason) => [
    `${reason.source.toUpperCase()} memory`,
    `Reason: ${reason.reason}`,
    `Summary: ${reason.summary}`,
  ].join('\n')).join('\n\n');
};

export const projectMemoryToMarkdown = (memory: Partial<ProjectMemory>): string => {
  const compacted = compactProjectMemory(memory);

  return [
    '# Project Memory',
    '',
    '## Purpose',
    compacted.purpose || 'Not documented',
    '',
    '## Architecture',
    compacted.architecture || 'Not documented',
    '',
    '## Important Files',
    (compacted.importantFiles || []).map(f => `- ${f}`).join('\n') || 'None yet',
    '',
    '## Important Commands',
    (compacted.importantCommands || []).map(command => `- ${command}`).join('\n') || 'None yet',
    '',
    '## Commands',
    [
      compacted.testCommand && `- test: ${compacted.testCommand}`,
      compacted.buildCommand && `- build: ${compacted.buildCommand}`,
      compacted.lintCommand && `- lint: ${compacted.lintCommand}`,
    ].filter(Boolean).join('\n') || 'Not documented',
    '',
    '## Coding Conventions',
    (compacted.conventions || []).map(c => `- ${c}`).join('\n') || 'None',
    '',
    '## Known Pitfalls',
    (compacted.pitfalls || []).map(p => `- ${p}`).join('\n') || 'None',
    '',
    '## Recent Errors & Fixes',
    (compacted.recentErrors || []).map(e => `- **${e.message}**${e.fix ? ` → ${e.fix}` : ''}`).join('\n') || 'None',
    '',
    '## User Preferences',
    (compacted.userPreferences || []).map(preference => `- ${preference}`).join('\n') || 'None',
  ].join('\n');
};
