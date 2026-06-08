import fs from 'node:fs/promises';
import path from 'node:path';

export type ImportGraph = Map<string, Set<string>>;

export interface ImportGraphOptions {
  cwd: string;
  followTransitive?: boolean;
  maxDepth?: number;
}

const TS_IMPORT_PATTERNS = [
  /(?:^|\n)\s*import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)[^;]*from\s+['"]([^'"]+)['"]/gm,
  /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/gm,
  /(?:^|\n)\s*export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm,
  /(?:^|\n)\s*export\s+\*\s+from\s+['"]([^'"]+)['"]/gm,
  /require\(['"]([^'"]+)['"]\)/gm,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
];

const PY_IMPORT_PATTERNS = [
  /(?:^|\n)\s*import\s+([a-zA-Z0-9_.]+)/gm,
  /(?:^|\n)\s*from\s+([a-zA-Z0-9_.]+)\s+import/gm,
];

const GO_IMPORT_PATTERNS = [
  /import\s+\(\s*([^)]+)\s*\)/gs,  // Block imports
  /import\s+["']([^"']+)["']/gm,     // Single imports
];

const extractImportsFromContent = (content: string, fileExt: string): Set<string> => {
  const imports = new Set<string>();
  let patterns: RegExp[] = [];

  if (['.ts', '.tsx', '.js', '.jsx'].includes(fileExt)) {
    patterns = TS_IMPORT_PATTERNS;
  } else if (fileExt === '.py') {
    patterns = PY_IMPORT_PATTERNS;
  } else if (fileExt === '.go') {
    patterns = GO_IMPORT_PATTERNS;
  }

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const importPath = match[1];
      if (importPath && typeof importPath === 'string') {
        // For block imports in Go, extract each line
        if (fileExt === '.go' && importPath.includes('\n')) {
          const lines = importPath.split('\n');
          for (const line of lines) {
            const cleaned = line.trim().replace(/["']/g, '').trim();
            if (cleaned && !cleaned.startsWith('//')) {
              imports.add(cleaned);
            }
          }
        } else {
          imports.add(importPath.trim());
        }
      }
    }
  }

  return imports;
};

const resolveImportPath = (
  importPath: string,
  fromFile: string,
  cwd: string,
  knownFiles: Set<string>,
): string | null => {
  // Skip absolute/external imports
  if (!importPath.startsWith('.')) {
    return null;
  }

  try {
    const baseDir = path.dirname(fromFile);
    const resolved = path.normalize(path.resolve(baseDir, importPath));

    // Check for exact match
    if (knownFiles.has(resolved)) {
      return resolved;
    }

    // Check with extensions
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.py', '.go']) {
      const withExt = resolved + ext;
      if (knownFiles.has(withExt)) {
        return withExt;
      }
    }

    // Check for index file
    const indexPath = path.join(resolved, 'index.ts');
    if (knownFiles.has(indexPath)) {
      return indexPath;
    }

    return null;
  } catch {
    return null;
  }
};

export const buildImportGraph = async (
  files: string[],
  cwd: string,
): Promise<ImportGraph> => {
  const graph: ImportGraph = new Map();
  const knownFiles = new Set(files);
  const maxFileSize = 1_000_000; // 1MB

  for (const file of files) {
    try {
      const filePath = path.join(cwd, file);
      const stats = await fs.stat(filePath).catch(() => null);

      // Skip if file doesn't exist, is a directory, or too large
      if (!stats || stats.isDirectory() || stats.size > maxFileSize) {
        graph.set(file, new Set());
        continue;
      }

      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
      const imports = extractImportsFromContent(content, path.extname(file));
      const dependencies = new Set<string>();

      for (const importPath of imports) {
        const resolved = resolveImportPath(importPath, file, cwd, knownFiles);
        if (resolved) {
          dependencies.add(resolved);
        }
      }

      graph.set(file, dependencies);
    } catch {
      graph.set(file, new Set());
    }
  }

  return graph;
};

export const getTransitiveDependents = (
  file: string,
  graph: ImportGraph,
  depth: number = 2,
): Set<string> => {
  const result = new Set<string>();
  const visited = new Set<string>();
  const queue = [{file, currentDepth: 0}];

  while (queue.length > 0) {
    const {file: current, currentDepth} = queue.shift()!;

    if (visited.has(current) || currentDepth > depth) {
      continue;
    }

    visited.add(current);

    // Find all files that depend on current
    for (const [filePath, deps] of graph.entries()) {
      if (deps.has(current) && !visited.has(filePath)) {
        result.add(filePath);
        queue.push({file: filePath, currentDepth: currentDepth + 1});
      }
    }
  }

  return result;
};

export const getTransitiveDependencies = (
  file: string,
  graph: ImportGraph,
  depth: number = 2,
): Set<string> => {
  const result = new Set<string>();
  const visited = new Set<string>();
  const queue = [{file, currentDepth: 0}];

  while (queue.length > 0) {
    const {file: current, currentDepth} = queue.shift()!;

    if (visited.has(current) || currentDepth > depth) {
      continue;
    }

    visited.add(current);

    const deps = graph.get(current) ?? new Set();
    for (const dep of deps) {
      if (!visited.has(dep)) {
        result.add(dep);
        queue.push({file: dep, currentDepth: currentDepth + 1});
      }
    }
  }

  return result;
};
