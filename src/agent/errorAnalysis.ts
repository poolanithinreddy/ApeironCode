export interface ParsedError {
  type: 'typescript' | 'eslint' | 'test' | 'runtime' | 'syntax' | 'module' | 'unknown';
  file?: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

const typeScriptErrorPattern = /(?:src|lib|tests)\/[\w/.]+\.tsx?:(\d+):(\d+).*-(.*)/;
const eslintErrorPattern = /\s+(\d+):\d+\s+(error|warning)\s+(.*)/;
const jestFailurePattern = /●\s+(.+?)\n([\s\S]+?)(?=●|Tests:)/g;
const pytestFailurePattern = /FAILED\s+(.+?)\s+-\s+(.+)/g;
const moduleNotFoundPattern = /Cannot find module|ModuleNotFoundError|No module named/i;
const syntaxErrorPattern = /SyntaxError|ParseError|Unexpected token/i;

export const analyzeError = (errorOutput: string): ParsedError[] => {
  const errors: ParsedError[] = [];

  if (syntaxErrorPattern.test(errorOutput)) {
    const lines = errorOutput.split('\n');
    for (const line of lines) {
      const match = line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (match) {
        errors.push({
          type: 'syntax',
          file: match[1],
          line: parseInt(match[2]!),
          message: line,
          severity: 'error',
          suggestion: 'Check for missing brackets, quotes, or semicolons',
        });
      }
    }
  }

  if (moduleNotFoundPattern.test(errorOutput)) {
    const match = errorOutput.match(/Cannot find module ['"](.*?)['"]/);
    if (match) {
      errors.push({
        type: 'module',
        message: `Missing module: ${match[1]}`,
        severity: 'error',
        suggestion: `Run npm install or verify the module path`,
      });
    }
  }

  for (const line of errorOutput.split('\n')) {
    const tsMatch = line.match(typeScriptErrorPattern);
    if (tsMatch) {
      errors.push({
        type: 'typescript',
        file: line.split(':')[0],
        line: parseInt(tsMatch[1]!),
        message: tsMatch[3]!.trim(),
        severity: 'error',
      });
    }

    const eslintMatch = line.match(eslintErrorPattern);
    if (eslintMatch) {
      errors.push({
        type: 'eslint',
        line: parseInt(eslintMatch[1]!),
        message: eslintMatch[3]!.trim(),
        severity: eslintMatch[2]! as 'error' | 'warning',
      });
    }
  }

  const jestMatches = errorOutput.matchAll(jestFailurePattern);
  for (const match of jestMatches) {
    errors.push({
      type: 'test',
      message: `Test failed: ${match[1]!.trim()}`,
      severity: 'error',
      suggestion: 'Check the assertion or test setup',
    });
  }

  const pytestMatches = errorOutput.matchAll(pytestFailurePattern);
  for (const match of pytestMatches) {
    errors.push({
      type: 'test',
      file: match[1],
      message: match[2]!.trim(),
      severity: 'error',
    });
  }

  if (errors.length === 0 && errorOutput.length > 0) {
    errors.push({
      type: 'unknown',
      message: errorOutput.substring(0, 200),
      severity: 'error',
    });
  }

  return errors;
};

export const formatErrorAnalysis = (errors: ParsedError[]): string => {
  if (errors.length === 0) return 'No errors detected.';

  const grouped = errors.reduce((acc, err) => {
    if (!acc[err.type]) acc[err.type] = [];
    acc[err.type]!.push(err);
    return acc;
  }, {} as Record<string, ParsedError[]>);

  const lines: string[] = [];

  for (const [type, typeErrors] of Object.entries(grouped)) {
    lines.push(`**${type.toUpperCase()} Errors** (${typeErrors.length})`);
    for (const err of typeErrors) {
      const location = err.file ? ` at ${err.file}:${err.line}` : '';
      lines.push(`- ${err.message}${location}`);
      if (err.suggestion) lines.push(`  → ${err.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

export const suggestNextStep = (errors: ParsedError[]): string | null => {
  if (errors.length === 0) return null;

  const types = new Set(errors.map(e => e.type));

  if (types.has('typescript')) {
    return 'Run `npm run typecheck` to see all type errors, then inspect the files mentioned.';
  }

  if (types.has('eslint')) {
    return 'Run `npm run lint -- --fix` to auto-fix style issues, then fix remaining manually.';
  }

  if (types.has('test')) {
    return 'Inspect the failing test file and the code it tests. Run the test in isolation to debug.';
  }

  if (types.has('module')) {
    return 'Run `npm install` to ensure all dependencies are available.';
  }

  if (types.has('syntax')) {
    const fileErrors = errors.filter(e => e.type === 'syntax');
    const firstFile = fileErrors[0]?.file;
    return firstFile ? `Check syntax in ${firstFile} around line ${fileErrors[0]?.line}.` : 'Fix syntax errors in the mentioned files.';
  }

  return 'Review the error messages above and identify the root cause.';
};
