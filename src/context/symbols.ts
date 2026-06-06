import fs from 'node:fs/promises';
import path from 'node:path';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'variable'
  | 'method'
  | 'component'
  | 'test'
  | 'unknown';

export interface SymbolInfo {
  exported: boolean;
  file: string;
  kind: SymbolKind;
  line: number;
  name: string;
  signature?: string;
}

const MAX_BYTES = 200_000;
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.tar', '.gz', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mp3', '.exe', '.bin']);

export interface SymbolHints {
  exports: string[];
  imports: string[];
  language: string;
  symbols: string[];
}

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

export const inferLanguageFromPath = (relativePath: string): string => {
  const extension = path.extname(relativePath).toLowerCase();

  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'TypeScript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'JavaScript';
    case '.py':
      return 'Python';
    case '.go':
      return 'Go';
    case '.rs':
      return 'Rust';
    case '.java':
      return 'Java';
    case '.json':
      return 'JSON';
    case '.md':
      return 'Markdown';
    case '.yml':
    case '.yaml':
      return 'YAML';
    default:
      return extension.slice(1) || 'unknown';
  }
};

export const classifyFileKind = (relativePath: string): 'config' | 'doc' | 'generated' | 'source' | 'test' => {
  const lowerPath = relativePath.toLowerCase();

  if (/readme|changelog|security|contributing|\.md$/u.test(lowerPath)) {
    return 'doc';
  }

  if (/test|spec|__tests__|fixtures/u.test(lowerPath)) {
    return 'test';
  }

  if (/dist\/|build\/|coverage\/|\.map$/u.test(lowerPath)) {
    return 'generated';
  }

  if (/config|\.json$|\.ya?ml$|dockerfile|toml|gradle|pom\.xml/u.test(lowerPath)) {
    return 'config';
  }

  return 'source';
};

export const extractSymbolHints = (content: string, relativePath: string): SymbolHints => {
  const imports = unique([
    ...Array.from(content.matchAll(/import\s+[^'"\n]+['"]([^'"]+)['"]/gu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/require\(['"]([^'"]+)['"]\)/gu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/from\s+([a-zA-Z0-9_.]+)/gu), (match) => match[1] ?? ''),
  ]);

  const symbols = unique([
    ...Array.from(content.matchAll(/export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/gu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/(?:function|class|interface|type)\s+([A-Za-z0-9_]+)/gu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/^def\s+([A-Za-z0-9_]+)/gmu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/^class\s+([A-Za-z0-9_]+)/gmu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/^func\s+([A-Za-z0-9_]+)/gmu), (match) => match[1] ?? ''),
  ]);

  const exports = unique([
    ...Array.from(content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface)?\s*([A-Za-z0-9_]+)/gu), (match) => match[1] ?? ''),
    ...Array.from(content.matchAll(/module\.exports\s*=\s*([A-Za-z0-9_]+)/gu), (match) => match[1] ?? ''),
    ...symbols.filter((symbol) => /^test|^it|^describe/u.test(symbol) === false),
  ]);

  return {
    exports,
    imports,
    language: inferLanguageFromPath(relativePath),
    symbols,
  };
};

const safePush = (
  out: SymbolInfo[],
  filePath: string,
  line: number,
  name: string,
  kind: SymbolKind,
  exported: boolean,
  signature?: string,
): void => {
  if (!name || /^[0-9]+$/u.test(name)) return;
  out.push({exported, file: filePath, kind, line, name, signature});
};

const isLikelyComponent = (name: string): boolean => /^[A-Z][A-Za-z0-9]+$/u.test(name);

const extractTsSymbols = (filePath: string, content: string, out: SymbolInfo[]): void => {
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    const exportMatch = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/u.exec(line);
    if (exportMatch) {
      const kind = exportMatch[1] as string;
      const name = exportMatch[2] ?? '';
      const k: SymbolKind = kind === 'function' ? 'function'
        : kind === 'class' ? 'class'
        : kind === 'interface' ? 'interface'
        : kind === 'type' ? 'type'
        : 'const';
      safePush(out, filePath, i + 1, name, k, true, trimmed.slice(0, 200));
      if (k === 'const' && isLikelyComponent(name) && /\.(?:tsx|jsx)$/u.test(filePath) && /\(.*\)\s*=>|React\./u.test(trimmed)) {
        safePush(out, filePath, i + 1, name, 'component', true, trimmed.slice(0, 200));
      }
      continue;
    }

    const internalMatch = /^\s*(function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/u.exec(line);
    if (internalMatch) {
      const kind = internalMatch[1] as string;
      const name = internalMatch[2] ?? '';
      const k: SymbolKind = kind === 'function' ? 'function'
        : kind === 'class' ? 'class'
        : kind === 'interface' ? 'interface'
        : kind === 'type' ? 'type'
        : 'const';
      safePush(out, filePath, i + 1, name, k, false, trimmed.slice(0, 200));
      continue;
    }

    const arrowFn = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*[:=].*=>/u.exec(line);
    if (arrowFn) {
      const name = arrowFn[1] ?? '';
      const exported = /^\s*export\s+/u.test(line);
      const componentLike = isLikelyComponent(name) && filePath.endsWith('.tsx');
      safePush(out, filePath, i + 1, name, componentLike ? 'component' : 'function', exported, trimmed.slice(0, 200));
      continue;
    }

    const testCall = /^\s*(?:test|it|describe)\s*\(\s*['"`]([^'"`]+)['"`]/u.exec(line);
    if (testCall) {
      safePush(out, filePath, i + 1, testCall[1] ?? '', 'test', false, trimmed.slice(0, 200));
      continue;
    }

    const methodMatch = /^\s*(?:public|private|protected|static|async)?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/u.exec(line);
    if (methodMatch && /^\s+/.test(line)) {
      const name = methodMatch[1] ?? '';
      if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'function'].includes(name)) {
        safePush(out, filePath, i + 1, name, 'method', false, trimmed.slice(0, 200));
      }
    }
  }
};

const extractPySymbols = (filePath: string, content: string, out: SymbolInfo[]): void => {
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const fnMatch = /^(\s*)(async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/u.exec(line);
    if (fnMatch) {
      const indent = (fnMatch[1] ?? '').length;
      const name = fnMatch[3] ?? '';
      safePush(out, filePath, i + 1, name, indent === 0 ? 'function' : 'method', !name.startsWith('_'), line.trim().slice(0, 200));
      continue;
    }
    const classMatch = /^(\s*)class\s+([A-Za-z_][\w]*)/u.exec(line);
    if (classMatch) {
      const name = classMatch[2] ?? '';
      safePush(out, filePath, i + 1, name, 'class', !name.startsWith('_'), line.trim().slice(0, 200));
    }
  }
};

const extractGoSymbols = (filePath: string, content: string, out: SymbolInfo[]): void => {
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const fnMatch = /^func\s+(?:\([^)]*\)\s+)?([A-Za-z_][\w]*)\s*\(/u.exec(line);
    if (fnMatch) {
      const name = fnMatch[1] ?? '';
      safePush(out, filePath, i + 1, name, 'function', /^[A-Z]/.test(name), line.trim().slice(0, 200));
      continue;
    }
    const typeMatch = /^type\s+([A-Za-z_][\w]*)\s+(struct|interface)\b/u.exec(line);
    if (typeMatch) {
      const name = typeMatch[1] ?? '';
      const kind: SymbolKind = (typeMatch[2] === 'interface') ? 'interface' : 'type';
      safePush(out, filePath, i + 1, name, kind, /^[A-Z]/.test(name), line.trim().slice(0, 200));
    }
  }
};

const extractJavaSymbols = (filePath: string, content: string, out: SymbolInfo[]): void => {
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const cls = /^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(class|interface|enum)\s+([A-Za-z_][\w]*)/u.exec(line);
    if (cls) {
      const kind = (cls[1] === 'interface') ? 'interface' : 'class';
      const name = cls[2] ?? '';
      safePush(out, filePath, i + 1, name, kind, /public/.test(line), line.trim().slice(0, 200));
      continue;
    }
    const method = /^\s+(public|private|protected)\s+(?:static\s+)?(?:final\s+)?[A-Za-z_<>[\],?\s]+\s+([A-Za-z_][\w]*)\s*\(/u.exec(line);
    if (method) {
      const name = method[2] ?? '';
      safePush(out, filePath, i + 1, name, 'method', method[1] === 'public', line.trim().slice(0, 200));
    }
  }
};

export const extractSymbolsFromText = (filePath: string, content: string): SymbolInfo[] => {
  if (!content || content.length > MAX_BYTES) return [];
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXT.has(ext)) return [];
  const out: SymbolInfo[] = [];
  try {
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
      extractTsSymbols(filePath, content, out);
    } else if (ext === '.py') {
      extractPySymbols(filePath, content, out);
    } else if (ext === '.go') {
      extractGoSymbols(filePath, content, out);
    } else if (ext === '.java') {
      extractJavaSymbols(filePath, content, out);
    }
  } catch {
    return out;
  }
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = `${s.file}:${s.line}:${s.kind}:${s.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const extractSymbolsFromFiles = async (
  files: string[],
  cwd: string,
): Promise<SymbolInfo[]> => {
  const all: SymbolInfo[] = [];
  await Promise.all(files.map(async (file) => {
    try {
      const stats = await fs.stat(path.join(cwd, file));
      if (!stats.isFile() || stats.size > MAX_BYTES) return;
      const content = await fs.readFile(path.join(cwd, file), 'utf8');
      for (const sym of extractSymbolsFromText(file, content)) {
        all.push(sym);
      }
    } catch {
      // ignore unreadable files
    }
  }));
  return all;
};

export const findSymbolsByName = (symbols: SymbolInfo[], query: string): SymbolInfo[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return symbols.filter((s) => {
    const lower = s.name.toLowerCase();
    return lower === q || lower.includes(q);
  }).sort((a, b) => {
    const al = a.name.toLowerCase();
    const bl = b.name.toLowerCase();
    if (al === q && bl !== q) return -1;
    if (bl === q && al !== q) return 1;
    if (a.exported !== b.exported) return a.exported ? -1 : 1;
    return a.name.length - b.name.length;
  });
};