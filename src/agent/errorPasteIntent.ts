/**
 * Detects and parses pasted runtime/build errors so the runtime can debug
 * them deterministically (search → read → fix plan → approve → patch →
 * validate) instead of delegating to malformed model tool calls.
 */

export type PastedErrorType =
  | 'type-error'
  | 'reference-error'
  | 'syntax-error'
  | 'undefined-property'
  | 'module-not-found'
  | 'next-build'
  | 'react-hydration'
  | 'stack-trace'
  | 'generic';

export interface PastedErrorInfo {
  isError: true;
  errorType: PastedErrorType;
  message: string;
  /** Property/identifier extracted from the message (e.g. bodyBackgroundColor). */
  symbol?: string;
  likelySearchTerms: string[];
  likelyFiles: string[];
  shouldRunBuild: boolean;
  shouldSearchWorkspace: boolean;
  shouldUseFilePlan: boolean;
}

export type ErrorPasteResult = PastedErrorInfo | {isError: false};

const LIKELY_APP_FILES = [
  'package.json',
  'pages/index.js',
  'pages/index.tsx',
  'pages/_app.js',
  'pages/_app.tsx',
  'app/page.tsx',
  'app/page.js',
  'src/App.tsx',
  'src/App.jsx',
  'src/main.tsx',
  'styles/globals.css',
];

const IDENT_RE = /[A-Za-z_$][\w$]*/g;
const STOPWORDS = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'undefined', 'null',
  'reading', 'properties', 'property', 'cannot', 'read', 'of', 'is', 'not',
  'a', 'an', 'error', 'at', 'in', 'to', 'be',
]);

const extractSymbol = (text: string): string | undefined => {
  const reading = text.match(/reading\s+['"`]([\w$]+)['"`]/iu);
  if (reading?.[1]) return reading[1];
  const notDefined = text.match(/\b([A-Za-z_$][\w$]*)\s+is not defined/u);
  if (notDefined?.[1]) return notDefined[1];
  const notFunction = text.match(/\b([\w$.]+)\s+is not a function/u);
  if (notFunction?.[1]) return notFunction[1].split('.').pop();
  const moduleName = text.match(/(?:module not found|cannot find module)\s*:?\s*['"`]?([\w@/.-]+)['"`]?/iu);
  if (moduleName?.[1]) return moduleName[1];
  return undefined;
};

const classify = (text: string): PastedErrorType => {
  if (/cannot read propert(?:y|ies) of (?:undefined|null)/iu.test(text)) return 'undefined-property';
  if (/\bReferenceError\b|\bis not defined\b/u.test(text)) return 'reference-error';
  if (/\bSyntaxError\b|unexpected token/iu.test(text)) return 'syntax-error';
  if (/module not found|cannot find module|cannot resolve/iu.test(text)) return 'module-not-found';
  if (/hydration|did not match|text content does not match/iu.test(text)) return 'react-hydration';
  if (/next build|failed to compile|\.next\/|webpack|type error:/iu.test(text)) return 'next-build';
  if (/\bTypeError\b/u.test(text)) return 'type-error';
  if (/\bat\s+.+:\d+:\d+|node_modules|\/[\w./-]+:\d+/u.test(text)) return 'stack-trace';
  return 'generic';
};

const ERROR_SIGNALS =
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|UnhandledPromiseRejection)\b|cannot read propert(?:y|ies) of (?:undefined|null)|is not defined|is not a function|module not found|cannot find module|failed to compile|unhandled runtime error|hydration failed|unexpected token|\bat\s+[\w$.]+\s*\([^)]*:\d+:\d+\)/iu;

const looksLikeCodeRequest =
  /\b(add|build|create|implement|refactor|make|run|fix the app|improve)\b/iu;

/**
 * Returns parsed error info when the prompt is a pasted runtime/build error,
 * otherwise {isError:false}. Conservative: a normal coding request that merely
 * mentions "error" is not treated as a pasted error.
 */
export const detectErrorPaste = (prompt: string): ErrorPasteResult => {
  const text = prompt.trim();
  if (!text || text.length > 8_000) return {isError: false};
  if (!ERROR_SIGNALS.test(text)) return {isError: false};
  // "fix the bug where it throws TypeError ... and also add a feature" is a
  // build request, not a raw paste — let normal coding handle multi-intent.
  const firstLine = text.split('\n')[0] ?? text;
  if (looksLikeCodeRequest.test(firstLine) && !/cannot read propert|is not defined|is not a function|module not found/iu.test(firstLine)) {
    return {isError: false};
  }

  const errorType = classify(text);
  const symbol = extractSymbol(text);
  const message = (text.split('\n').find((l) => l.trim().length > 0) ?? text).slice(0, 300).trim();

  const terms = new Set<string>();
  if (symbol) terms.add(symbol);
  for (const m of message.matchAll(IDENT_RE)) {
    const w = m[0];
    if (w.length >= 4 && !STOPWORDS.has(w.toLowerCase())) terms.add(w);
    if (terms.size >= 6) break;
  }

  return {
    isError: true,
    errorType,
    message,
    symbol,
    likelySearchTerms: Array.from(terms),
    likelyFiles: LIKELY_APP_FILES,
    shouldRunBuild: errorType === 'next-build' || errorType === 'module-not-found' || errorType === 'syntax-error',
    shouldSearchWorkspace: true,
    shouldUseFilePlan: true,
  };
};
