import {estimateTokensFromBytes} from '../context/budget.js';
import {readProjectBrain} from './reader.js';
import {redactProjectBrainText, truncateForPrompt} from './safety.js';

export interface ProjectBrainContextChunk {
  id: string;
  kind: string;
  path: string;
  content: string;
  tokenEstimate: number;
}

export interface ProjectBrainIndexOptions {
  maxTokens?: number;
  includeWorkflows?: boolean;
}

const kindFromPath = (relativePath: string): string =>
  relativePath.replace(/^\.apeironcode\//u, '').replace(/\.md$/u, '').toLowerCase();

export const indexProjectBrainForContext = async (
  cwd: string,
  options: ProjectBrainIndexOptions = {},
): Promise<ProjectBrainContextChunk[]> => {
  const budget = options.maxTokens ?? 900;
  const brain = await readProjectBrain(cwd, {maxCharsPerFile: 3_000});
  if (!brain.exists) return [];

  const priority = ['MEMORY.md', 'PLAN.md', 'TASKS.md', 'DECISIONS.md', 'VERIFY.md', 'REFERENCES.md'];
  const files = brain.files
    .filter((file) => priority.some((name) => file.relativePath.endsWith(name)))
    .sort((left, right) => {
      const li = priority.findIndex((name) => left.relativePath.endsWith(name));
      const ri = priority.findIndex((name) => right.relativePath.endsWith(name));
      return li - ri;
    });

  const chunks: ProjectBrainContextChunk[] = [];
  let used = 0;
  for (const file of files) {
    const content = truncateForPrompt(file.content, 2_000);
    const tokenEstimate = estimateTokensFromBytes(Buffer.byteLength(content, 'utf8'));
    if (chunks.length > 0 && used + tokenEstimate > budget) continue;
    chunks.push({
      content: redactProjectBrainText(content),
      id: `project-brain:${file.relativePath}`,
      kind: kindFromPath(file.relativePath),
      path: file.relativePath,
      tokenEstimate,
    });
    used += tokenEstimate;
  }
  return chunks;
};
