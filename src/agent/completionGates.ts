export interface CompletionGateContext {
  filesChanged: string[];
  toolsExecuted: string[];
  toolFailures: string[];
  rollbackOccurred: boolean;
  userAskedForTests: boolean;
  todoMarkersIntroduced: boolean;
  verificationRan: boolean;
  buildRan: boolean;
  testsRan: boolean;
  /** Optional changed-text summary to scan for TODO/FIXME markers. */
  changedTextSummary?: string;
}

const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX)(\s*[:(]|\s*$)/m;
const THROW_TODO_PATTERN = /throw new Error\(['"`]TODO/i;
const NOT_IMPL_PATTERN = /\bNotImplemented\b/;

/**
 * Detect unresolved code TODO/FIXME/HACK/XXX markers, `throw new Error("TODO …")`,
 * and explicit NotImplemented sentinels. Designed to ignore casual prose like
 * "my todo list".
 */
export const detectTodoMarkers = (text: string): boolean => {
  if (!text) return false;
  return TODO_PATTERN.test(text) || THROW_TODO_PATTERN.test(text) || NOT_IMPL_PATTERN.test(text);
};

export type GateSeverity = 'block' | 'warn';

export interface CompletionGateResult {
  passed: boolean;
  gates: Array<{name: string; passed: boolean; severity: GateSeverity; feedback: string}>;
}

const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|cpp|c|h|hpp|cs)$/u;
const PACKAGE_FILE_RE = /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|requirements\.txt|tsconfig\.json)$/u;

export const evaluateCompletionGates = (ctx: CompletionGateContext): CompletionGateResult => {
  const gates: CompletionGateResult['gates'] = [];

  const sourceFilesChanged = ctx.filesChanged.some((f) => SOURCE_EXT_RE.test(f));
  const packageFilesChanged = ctx.filesChanged.some((f) => PACKAGE_FILE_RE.test(f));

  // 1. src-without-tests
  if (sourceFilesChanged && !ctx.testsRan) {
    gates.push({
      name: 'src-without-tests',
      passed: false,
      severity: 'warn',
      feedback: 'Source files changed but no tests were run. Consider running tests before completing.',
    });
  } else {
    gates.push({name: 'src-without-tests', passed: true, severity: 'warn', feedback: 'ok'});
  }

  // 2. package-without-build
  if (packageFilesChanged && !ctx.buildRan && !ctx.verificationRan) {
    gates.push({
      name: 'package-without-build',
      passed: false,
      severity: 'warn',
      feedback: 'Package/config files changed but no build/typecheck ran.',
    });
  } else {
    gates.push({name: 'package-without-build', passed: true, severity: 'warn', feedback: 'ok'});
  }

  // 3. failed-tool-ignored
  const unrecoveredFailures = ctx.toolFailures.filter(() => !ctx.rollbackOccurred);
  if (unrecoveredFailures.length > 0 && !ctx.rollbackOccurred) {
    gates.push({
      name: 'failed-tool-ignored',
      passed: false,
      severity: 'block',
      feedback: `Tool failure(s) without recovery/rollback: ${unrecoveredFailures.join(', ')}`,
    });
  } else {
    gates.push({name: 'failed-tool-ignored', passed: true, severity: 'block', feedback: 'ok'});
  }

  // 4. rollback-requires-explanation
  if (ctx.rollbackOccurred) {
    gates.push({
      name: 'rollback-requires-explanation',
      passed: false,
      severity: 'block',
      feedback: 'A rollback occurred. Provide a summary of what was rolled back and why before completing.',
    });
  } else {
    gates.push({name: 'rollback-requires-explanation', passed: true, severity: 'block', feedback: 'ok'});
  }

  // 5. user-asked-tests-not-run
  if (ctx.userAskedForTests && !ctx.testsRan) {
    gates.push({
      name: 'user-asked-tests-not-run',
      passed: false,
      severity: 'warn',
      feedback: 'User asked for tests, but no test runner was executed.',
    });
  } else {
    gates.push({name: 'user-asked-tests-not-run', passed: true, severity: 'warn', feedback: 'ok'});
  }

  // 6. unresolved-todo (explicit flag OR detected from changedTextSummary)
  const todoDetectedFromText = ctx.changedTextSummary
    ? detectTodoMarkers(ctx.changedTextSummary)
    : false;
  if (ctx.todoMarkersIntroduced || todoDetectedFromText) {
    gates.push({
      name: 'unresolved-todo',
      passed: false,
      severity: 'warn',
      feedback:
        'Unresolved TODO/FIXME/HACK markers detected in changed code. Consider addressing them before marking complete.',
    });
  } else {
    gates.push({name: 'unresolved-todo', passed: true, severity: 'warn', feedback: 'ok'});
  }

  const passed = gates.every((g) => g.passed || g.severity === 'warn');
  // The overall passed is true only if there's no blocking failure
  const noBlock = !gates.some((g) => !g.passed && g.severity === 'block');
  return {passed: noBlock && passed && gates.every((g) => g.passed), gates};
};

export const formatCompletionGateFeedback = (result: CompletionGateResult): string => {
  const issues = result.gates.filter((g) => !g.passed);
  if (issues.length === 0) return '';
  const lines = ['Completion gates noted the following:'];
  for (const g of issues) {
    lines.push(`- [${g.severity}] ${g.name}: ${g.feedback}`);
  }
  return lines.join('\n');
};
