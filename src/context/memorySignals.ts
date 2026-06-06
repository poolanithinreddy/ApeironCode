import type {MemoryRelatedResult, MemoryEntity} from '../memory/graphTypes.js';

export interface FileMemorySignal {
  filePath: string;
  score: number;
  confidence: number;
  reasons: string[];
  sources: string[];
}

const isFilePath = (value: string): boolean => {
  return /\.[a-z]{2,4}$/.test(value) || value.includes('/');
};

const extractFilePathsFromEntity = (entity: MemoryEntity): string[] => {
  const paths: string[] = [];

  if (entity.type === 'file' && isFilePath(entity.name)) {
    paths.push(entity.name);
  }

  if (entity.type === 'module' && isFilePath(entity.name)) {
    paths.push(entity.name);
  }

  if (entity.type === 'symbol' && entity.metadata?.filePath && typeof entity.metadata.filePath === 'string') {
    paths.push(entity.metadata.filePath);
  }

  if (entity.metadata?.location && typeof entity.metadata.location === 'string') {
    const match = entity.metadata.location.match(/(.+):(\d+):(\d+)/);
    if (match && match[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
};

const edgeTypeBoosters: Record<string, number> = {
  error_occurred_in_file: 1.5,
  session_modified_file: 1.3,
  test_covers_file: 1.2,
  file_imports_file: 1.1,
  bug_fixed_by_change: 1.2,
  plan_generated_changes: 1.1,
  convention_applies_to_path: 0.9,
};

const calculateFileScore = (
  results: MemoryRelatedResult[],
  filePath: string,
  sourceEntities: Set<MemoryEntity>,
): {score: number; reasons: string[]; confidence: number; sources: string[]} => {
  let totalScore = 0;
  const reasons: string[] = [];
  const sources: Set<string> = new Set();
  let confidenceSum = 0;
  let scoreCount = 0;

  for (const result of results) {
    if (sourceEntities.has(result.entity)) {
      continue;
    }

    const entity = result.entity;
    const baseScore = result.score;
    const confidence = entity.confidence;

    const directPaths = extractFilePathsFromEntity(entity);
    const isDirectMatch = directPaths.some((p) => p === filePath || filePath.includes(p));

    if (isDirectMatch) {
      totalScore += baseScore * 2 * confidence;
      reasons.push(`direct reference in ${entity.type} "${entity.name}"`);
      sources.add(entity.type);
      confidenceSum += confidence;
      scoreCount++;
      continue;
    }

    for (const edge of result.edges) {
      const boosters = edgeTypeBoosters[edge.type] ?? 1;
      let edgeContribution = 0;

      if (edge.type === 'error_occurred_in_file' && edge.metadata?.filePath === filePath) {
        edgeContribution = baseScore * boosters * confidence;
        reasons.push(`error in file via ${edge.type}`);
        sources.add(edge.type);
        confidenceSum += confidence;
        scoreCount++;
      }

      if (edge.type === 'session_modified_file' && edge.metadata?.filePath === filePath) {
        edgeContribution = baseScore * boosters * confidence;
        reasons.push(`modified in session via ${edge.type}`);
        sources.add(edge.type);
        confidenceSum += confidence;
        scoreCount++;
      }

      if (edge.type === 'test_covers_file' && edge.metadata?.filePath === filePath) {
        edgeContribution = baseScore * boosters * confidence;
        reasons.push(`covered by test via ${edge.type}`);
        sources.add(edge.type);
        confidenceSum += confidence;
        scoreCount++;
      }

      totalScore += edgeContribution;
    }
  }

  const avgConfidence = scoreCount > 0 ? confidenceSum / scoreCount : 0;
  return {
    score: totalScore,
    reasons,
    confidence: avgConfidence,
    sources: Array.from(sources),
  };
};

export const extractFileMemorySignals = (
  results: MemoryRelatedResult[],
): Map<string, FileMemorySignal> => {
  const fileSignals = new Map<string, FileMemorySignal>();
  const sourceEntities = new Set(results.map((r) => r.entity));

  const candidateFiles = new Set<string>();

  for (const result of results) {
    const paths = extractFilePathsFromEntity(result.entity);
    for (const path of paths) {
      if (isFilePath(path)) {
        candidateFiles.add(path);
      }
    }

    for (const edge of result.edges) {
      if (edge.metadata?.filePath && typeof edge.metadata.filePath === 'string') {
        candidateFiles.add(edge.metadata.filePath);
      }
    }
  }

  for (const filePath of candidateFiles) {
    const {score, reasons, confidence, sources} = calculateFileScore(results, filePath, sourceEntities);

    if (score > 0 && reasons.length > 0) {
      fileSignals.set(filePath, {
        filePath,
        score: normalizeMemoryScore(score),
        confidence,
        reasons,
        sources,
      });
    }
  }

  return fileSignals;
};

const normalizeMemoryScore = (score: number): number => {
  return Math.min(1, Math.max(0, score / 100));
};

export const buildMemoryFileScores = (signals: Map<string, FileMemorySignal>): Map<string, number> => {
  const scores = new Map<string, number>();

  for (const [filePath, signal] of signals) {
    scores.set(filePath, signal.score * signal.confidence);
  }

  return scores;
};

export const formatMemorySignals = (signals: FileMemorySignal[]): string => {
  if (signals.length === 0) {
    return 'No memory signals for files in this context.';
  }

  return signals
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(
      (signal) =>
        `- ${signal.filePath} (score=${signal.score.toFixed(2)}, confidence=${signal.confidence.toFixed(2)}) — ${signal.sources.join(', ')}`,
    )
    .join('\n');
};
