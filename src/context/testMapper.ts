import path from 'node:path';
import {extractSymbolHints} from './symbols.js';

export interface TestSourceMap {
  sourceForTest: Map<string, string[]>;
  testsForSource: Map<string, string[]>;
  unmatchedTests: string[];
}

const TEST_PATTERNS: RegExp[] = [
  /\.test\.(?:ts|tsx|js|jsx|mjs|cjs)$/u,
  /\.spec\.(?:ts|tsx|js|jsx|mjs|cjs)$/u,
  /(?:^|\/)tests?\//u,
  /(?:^|\/)__tests__\//u,
  /(?:^|\/)test_[^/]+\.py$/u,
  /_test\.py$/u,
  /_test\.go$/u,
  /Test\.java$/u,
];

export const inferTestFiles = (files: string[]): string[] => {
  return files.filter((f) => TEST_PATTERNS.some((re) => re.test(f))).sort();
};

const stripTestSuffix = (filename: string): {base: string; ext: string} => {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let base = stem
    .replace(/\.(?:test|spec)$/u, '')
    .replace(/_test$/u, '')
    .replace(/Test$/u, '');
  if (filename.startsWith('test_')) {
    base = stem.replace(/^test_/u, '');
  }
  return {base, ext};
};

const candidateSourcePaths = (testFile: string): string[] => {
  const dir = path.dirname(testFile);
  const file = path.basename(testFile);
  const {base, ext} = stripTestSuffix(file);
  const candidates: string[] = [];
  const exts = [ext, '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java'];
  const uniqueExts = Array.from(new Set(exts.filter(Boolean)));
  const dirCandidates = new Set<string>([dir]);
  if (dir.includes('/__tests__')) dirCandidates.add(dir.replace(/\/__tests__(\/|$)/u, '$1'));
  if (dir.startsWith('tests/')) dirCandidates.add(dir.replace(/^tests/u, 'src'));
  if (dir.startsWith('test/')) dirCandidates.add(dir.replace(/^test/u, 'src'));
  if (dir.startsWith('tests')) dirCandidates.add('src');
  for (const d of dirCandidates) {
    for (const e of uniqueExts) {
      candidates.push(path.posix.normalize(`${d}/${base}${e}`));
    }
  }
  return Array.from(new Set(candidates));
};

const candidateTestPaths = (sourceFile: string): string[] => {
  const dir = path.dirname(sourceFile);
  const ext = path.extname(sourceFile);
  const stem = path.basename(sourceFile, ext);
  const tsExts = ['.test.ts', '.test.tsx', '.spec.ts', '.test.js', '.test.jsx'];
  const candidates: string[] = [];
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    for (const e of tsExts) {
      candidates.push(path.posix.normalize(`${dir}/${stem}${e}`));
      candidates.push(path.posix.normalize(`${dir}/__tests__/${stem}${e}`));
      const mirrored = dir === 'src' ? 'tests'
        : dir.startsWith('src/') ? dir.replace(/^src/u, 'tests')
        : dir === '.' ? 'tests'
        : `tests/${dir}`;
      candidates.push(path.posix.normalize(`${mirrored}/${stem}${e}`));
    }
  }
  if (ext === '.py') {
    candidates.push(path.posix.normalize(`${dir}/test_${stem}.py`));
    candidates.push(path.posix.normalize(`${dir}/${stem}_test.py`));
    candidates.push(path.posix.normalize(`tests/test_${stem}.py`));
  }
  if (ext === '.go') {
    candidates.push(path.posix.normalize(`${dir}/${stem}_test.go`));
  }
  if (ext === '.java') {
    candidates.push(path.posix.normalize(`${dir}/${stem}Test.java`));
  }
  return Array.from(new Set(candidates));
};

export const inferSourceForTest = (
  testFile: string,
  files: string[],
  _cwd: string,
): string[] => {
  void _cwd;
  const known = new Set(files);
  return candidateSourcePaths(testFile).filter((c) => known.has(c) && c !== testFile);
};

export const inferTestsForSource = (
  sourceFile: string,
  files: string[],
  _cwd: string,
): string[] => {
  void _cwd;
  const known = new Set(files);
  return candidateTestPaths(sourceFile).filter((c) => known.has(c) && c !== sourceFile);
};

const STAR_TEST_IMPORT_RE = /from\s+['"]([^'"]+)['"]/gu;

const resolveRelative = (importPath: string, fromFile: string, knownFiles: Set<string>): string | null => {
  if (!importPath.startsWith('.')) return null;
  const baseDir = path.dirname(fromFile);
  const resolved = path.posix.normalize(`${baseDir}/${importPath}`);
  for (const e of ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.js', '.py', '.go']) {
    const candidate = `${resolved}${e}`;
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
};

export interface BuildTestSourceMapOptions {
  fileContents?: Map<string, string>;
}

const importedSources = (
  testFile: string,
  files: Set<string>,
  fileContents: Map<string, string> | undefined,
): string[] => {
  const content = fileContents?.get(testFile);
  if (!content) return [];
  const matches = content.matchAll(STAR_TEST_IMPORT_RE);
  const out: string[] = [];
  for (const m of matches) {
    const resolved = resolveRelative(m[1] ?? '', testFile, files);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
};

export const buildTestSourceMap = (
  files: string[],
  cwd: string,
  options: BuildTestSourceMapOptions = {},
): Promise<TestSourceMap> => Promise.resolve(buildTestSourceMapSync(files, cwd, options));

const buildTestSourceMapSync = (
  files: string[],
  cwd: string,
  options: BuildTestSourceMapOptions = {},
): TestSourceMap => {
  void cwd;
  void extractSymbolHints;
  const set = new Set(files);
  const sourceForTest = new Map<string, string[]>();
  const testsForSource = new Map<string, string[]>();
  const unmatched: string[] = [];

  const tests = inferTestFiles(files);
  for (const test of tests) {
    const heuristic = inferSourceForTest(test, files, cwd);
    const fromImports = importedSources(test, set, options.fileContents);
    const merged = Array.from(new Set([...heuristic, ...fromImports.filter((p) => !TEST_PATTERNS.some((re) => re.test(p)))]));
    if (merged.length === 0) {
      unmatched.push(test);
    }
    sourceForTest.set(test, merged);
    for (const src of merged) {
      const list = testsForSource.get(src) ?? [];
      if (!list.includes(test)) list.push(test);
      testsForSource.set(src, list);
    }
  }
  return {
    sourceForTest,
    testsForSource,
    unmatchedTests: unmatched,
  };
};
