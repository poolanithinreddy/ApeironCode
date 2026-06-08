import type {ChatMessage} from './types.js';
import type {ProjectMemory, GlobalMemory} from './memoryManager.js';

export const buildProjectMemorySection = (memory: ProjectMemory | null): string => {
  if (!memory) {
    return 'No project memory available yet.';
  }

  const sections = [
    memory.purpose && `**Project Purpose:** ${memory.purpose}`,
    memory.architecture && `**Architecture:** ${memory.architecture}`,
    memory.testCommand && `**Test:** \`${memory.testCommand}\``,
    memory.buildCommand && `**Build:** \`${memory.buildCommand}\``,
    memory.conventions && memory.conventions.length > 0 && `**Conventions:** ${memory.conventions.join(', ')}`,
    memory.pitfalls && memory.pitfalls.length > 0 && `**Known Pitfalls:** ${memory.pitfalls.join(', ')}`,
  ].filter(Boolean);

  return sections.length > 0 ? sections.join('\n') : 'Project memory available but minimal.';
};

export const buildGlobalMemorySection = (memory: GlobalMemory | null): string => {
  if (!memory) {
    return '';
  }

  const sections = [
    memory.codingStyle && `**Your Style:** ${memory.codingStyle}`,
    memory.commitStyle && `**Commits:** ${memory.commitStyle}`,
    memory.testStrategy && `**Testing:** ${memory.testStrategy}`,
  ].filter(Boolean);

  return sections.length > 0 ? `\n\nYour Preferences:\n${sections.join('\n')}` : '';
};

export const summarizeHistory = (messages: ChatMessage[], limit = 8): string => {
  const recentMessages = messages.slice(-limit);

  if (recentMessages.length === 0) {
    return 'No prior conversation history.';
  }

  return recentMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');
};