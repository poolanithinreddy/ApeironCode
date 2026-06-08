import path from 'node:path';

import type {FileSummary} from './fileSummaries.js';

export interface DependencyGraphEdge {
  from: string;
  to: string;
}

export const inferDependencyGraph = (summaries: FileSummary[]): DependencyGraphEdge[] => {
  const known = new Set(summaries.map((summary) => summary.path));
  const edges: DependencyGraphEdge[] = [];
  for (const summary of summaries) {
    const matches = summary.summary.matchAll(/from ['"]([^'"]+)['"]/gu);
    for (const match of matches) {
      const specifier = match[1];
      if (!specifier?.startsWith('.')) {
        continue;
      }
      const candidate = path.normalize(path.join(path.dirname(summary.path), specifier));
      const target = [...known].find((file) => file === candidate || file === `${candidate}.ts` || file === `${candidate}.tsx` || file === path.join(candidate, 'index.ts'));
      if (target) {
        edges.push({from: summary.path, to: target});
      }
    }
  }
  return edges;
};
