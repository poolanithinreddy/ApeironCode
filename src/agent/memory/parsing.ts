import {compactGlobalMemory, compactProjectMemory} from './compact.js';
import type {GlobalMemory, ProjectMemory} from './types.js';

export const parseProjectMemoryMarkdown = (content: string): ProjectMemory => {
  const memory: ProjectMemory = {};
  const sections = content.split(/^##\s+/m);

  for (const section of sections) {
    const [header, ...lines] = section.split('\n');
    const body = lines.join('\n').trim();

    switch (header?.toLowerCase()) {
      case 'purpose':
        memory.purpose = body;
        break;
      case 'architecture':
        memory.architecture = body;
        break;
      case 'important files':
        memory.importantFiles = body.split('\n').filter(line => line.startsWith('-')).map(line => line.replace(/^-\s+/, '').trim());
        break;
      case 'important commands':
        memory.importantCommands = body.split('\n').filter(line => line.startsWith('-')).map(line => line.replace(/^-\s+/, '').trim());
        break;
      case 'commands':
        for (const line of body.split('\n').filter(line => line.includes(':'))) {
          const [key, value] = line.split(':');
          if (key?.includes('test')) memory.testCommand = value?.trim();
          if (key?.includes('build')) memory.buildCommand = value?.trim();
          if (key?.includes('lint')) memory.lintCommand = value?.trim();
        }
        break;
      case 'coding conventions':
      case 'conventions':
        memory.conventions = body.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.replace(/^-\s+/, '').trim());
        break;
      case 'known pitfalls':
      case 'pitfalls':
        memory.pitfalls = body.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.replace(/^-\s+/, '').trim());
        break;
      case 'recent errors & fixes':
        memory.recentErrors = body
          .split('\n')
          .filter(line => line.startsWith('-'))
          .map((line) => line.replace(/^-\s+/, '').trim())
          .flatMap((line) => {
            const [message, fix] = line.split('→').map((value) => value.replace(/^\*\*|\*\*$/gu, '').trim());
            return message ? [{fix, message}] : [];
          })
          .slice(0, 10);
        break;
      case 'user preferences':
        memory.userPreferences = body.split('\n').filter(line => line.startsWith('-')).map(line => line.replace(/^-\s+/, '').trim());
        break;
    }
  }

  return compactProjectMemory(memory);
};

export const parseGlobalMemoryMarkdown = (content: string): GlobalMemory => {
  const memory: GlobalMemory = {};
  const sections = content.split(/^##\s+/m);

  for (const section of sections) {
    const [header, ...lines] = section.split('\n');
    const body = lines.join('\n').trim();

    switch (header?.toLowerCase()) {
      case 'coding style':
        memory.codingStyle = body;
        break;
      case 'preferred providers':
        memory.preferredProviders = body.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        break;
      case 'preferred models':
        memory.preferredModels = {};
        for (const line of body.split('\n')) {
          const match = line.match(/^-\s+(\w+):\s+(.+)$/);
          if (match?.[1] && match[2]) {
            memory.preferredModels[match[1]] = match[2];
          }
        }
        break;
      case 'test strategy':
        memory.testStrategy = body;
        break;
      case 'commit style':
        memory.commitStyle = body.toLowerCase() === 'conventional' ? 'conventional' : 'plain';
        break;
      case 'explanation style':
        memory.explanationStyle = body;
        break;
      case 'custom rules':
        memory.customRules = body.split('\n').filter(line => line.startsWith('-')).map(line => line.replace(/^-\s+/, '').trim());
        break;
    }
  }

  return compactGlobalMemory(memory);
};
