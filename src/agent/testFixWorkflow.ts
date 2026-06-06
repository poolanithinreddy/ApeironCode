import {analyzeError, formatErrorAnalysis, suggestNextStep} from './errorAnalysis.js';

export interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  totalTests: number;
  output: string;
  failedTests: string[];
  errors: string[];
  success: boolean;
}

export const isLikelyTestFixPrompt = (prompt: string): boolean => {
  const normalized = prompt.toLowerCase();
  return (
    /failing tests?/u.test(normalized)
    || /tests? (?:are|is)?\s*failing/u.test(normalized)
    || /(fix|debug|repair|resolve) .*tests?/u.test(normalized)
    || /test[-\s]?fix/u.test(normalized)
  );
};

const parseTestOutput = (output: string): TestResult => {
  const lines = output.split('\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failedTests: string[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    if (line.includes('passed')) {
      const match = line.match(/(\d+)\s+passed/);
      if (match) passed = parseInt(match[1]!);
    }
    if (line.includes('failed')) {
      const match = line.match(/(\d+)\s+failed/);
      if (match) failed = parseInt(match[1]!);
    }
    if (line.includes('skipped')) {
      const match = line.match(/(\d+)\s+skipped/);
      if (match) skipped = parseInt(match[1]!);
    }

    if (/^✓|^✔|PASS|PASSED/.test(line.trim())) {
      const testName = line.replace(/^[✓✔]/,'').replace(/PASS/i, '').trim();
      if (testName) passed += 1;
    }

    if (/^✗|^✖|^●|FAIL|FAILED/.test(line.trim())) {
      const testName = line.replace(/^[✗✖●]/,'').replace(/FAIL/i, '').trim();
      if (testName && !testName.startsWith('Tests:')) {
        failedTests.push(testName);
        failed += 1;
      }
    }

    if (/Error:|TypeError:|ReferenceError:/.test(line)) {
      errors.push(line.trim());
    }
  }

  const totalTests = passed + failed;

  return {
    passed,
    failed,
    skipped,
    totalTests,
    output,
    failedTests,
    errors,
    success: failed === 0,
  };
};

export const formatTestResult = (result: TestResult): string => {
  const lines = [
    `## Test Results`,
    '',
    `**Status:** ${result.success ? '✓ All tests passing' : `✗ ${result.failed} test${result.failed === 1 ? '' : 's'} failing`}`,
    `**Breakdown:** ${result.passed} passed, ${result.failed} failed${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`,
  ];

  if (result.failedTests.length > 0) {
    lines.push('');
    lines.push('**Failing Tests:**');
    for (const test of result.failedTests.slice(0, 5)) {
      lines.push(`- ${test}`);
    }
  }

  const analyzed = analyzeError(result.output);
  if (analyzed.length > 0) {
    lines.push('');
    lines.push(formatErrorAnalysis(analyzed));
  }

  const nextStep = suggestNextStep(analyzed);
  if (nextStep) {
    lines.push('');
    lines.push(`**Next:** ${nextStep}`);
  }

  return lines.join('\n');
};

export const shouldRetry = (result: TestResult, attemptCount: number, maxAttempts = 3): boolean => {
  return !result.success && attemptCount < maxAttempts;
};

export const identifyAffectedSourceFiles = (failedTests: string[], output = ''): string[] => {
  const files = new Set<string>();

  const discoveredTestFiles = output.match(/[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?/gu) ?? [];
  for (const testFile of discoveredTestFiles) {
    const normalizedTestFile = testFile.trim();
    const mappedSourceFile = normalizedTestFile
      .replace(/^tests\//u, 'src/')
      .replace(/^__tests__\//u, 'src/')
      .replace(/\.(?:test|spec)\./u, '.');

    if (mappedSourceFile !== normalizedTestFile) {
      files.add(mappedSourceFile);
    }
    files.add(normalizedTestFile);
  }

  for (const test of failedTests) {
    const match = test.match(/(.+?)\s*(?:›|at|in)/);
    if (match) {
      let filePath = match[1]!.trim();
      if (filePath.includes('.test.') || filePath.includes('.spec.')) {
        filePath = filePath
          .replace(/\.test\./, '.')
          .replace(/\.spec\./, '.');
      }
      files.add(filePath);
    }
  }

  return Array.from(files);
};

export class TestFixContext {
  constructor(
    private initialResult: TestResult,
    private maxAttempts = 3,
  ) {}

  getResult(): TestResult {
    return this.initialResult;
  }

  isSuccess(): boolean {
    return this.initialResult.success;
  }

  shouldContinue(attemptCount: number): boolean {
    return shouldRetry(this.initialResult, attemptCount, this.maxAttempts);
  }

  getAffectedFiles(): string[] {
    return identifyAffectedSourceFiles(this.initialResult.failedTests, this.initialResult.output);
  }

  getStrategy(): string {
    const {failedTests, errors} = this.initialResult;

    if (errors.length > 0) {
      return 'Focus on error analysis. Read the failing test and its corresponding source file.';
    }

    if (failedTests.length === 1) {
      return `Single test failing: ${failedTests[0]}. Inspect the test and source code carefully.`;
    }

    return `${failedTests.length} tests failing. Look for common issues: missing imports, API changes, or test setup problems.`;
  }

  getSummary(): string {
    return formatTestResult(this.initialResult);
  }
}

export const createTestFixContext = (testOutput: string, maxAttempts = 3): TestFixContext => {
  const result = parseTestOutput(testOutput);
  return new TestFixContext(result, maxAttempts);
};
