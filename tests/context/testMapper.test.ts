import {describe, expect, it} from 'vitest';
import {
  buildTestSourceMap,
  inferSourceForTest,
  inferTestFiles,
  inferTestsForSource,
} from '../../src/context/testMapper.js';

const tsFiles = [
  'src/foo.ts',
  'src/bar.ts',
  'src/baz/index.ts',
  'tests/foo.test.ts',
  'src/bar.test.ts',
  'src/baz/__tests__/index.test.ts',
  'pkg/foo.spec.ts',
  'app/test_foo.py',
  'app/foo.py',
  'lib/foo.go',
  'lib/foo_test.go',
  'java/Foo.java',
  'java/FooTest.java',
];

describe('inferTestFiles', () => {
  it('detects test files across languages', () => {
    const tests = inferTestFiles(tsFiles);
    expect(tests).toContain('tests/foo.test.ts');
    expect(tests).toContain('src/bar.test.ts');
    expect(tests).toContain('src/baz/__tests__/index.test.ts');
    expect(tests).toContain('app/test_foo.py');
    expect(tests).toContain('lib/foo_test.go');
    expect(tests).toContain('java/FooTest.java');
    expect(tests).not.toContain('src/foo.ts');
  });
});

describe('inferSourceForTest', () => {
  it('maps tests/foo.test.ts -> src/foo.ts', () => {
    expect(inferSourceForTest('tests/foo.test.ts', tsFiles, '.')).toContain('src/foo.ts');
  });
  it('maps src/bar.test.ts -> src/bar.ts', () => {
    expect(inferSourceForTest('src/bar.test.ts', tsFiles, '.')).toContain('src/bar.ts');
  });
  it('maps __tests__/index.test.ts -> src/baz/index.ts', () => {
    expect(inferSourceForTest('src/baz/__tests__/index.test.ts', tsFiles, '.')).toContain('src/baz/index.ts');
  });
  it('maps Python test_foo.py -> foo.py', () => {
    expect(inferSourceForTest('app/test_foo.py', tsFiles, '.')).toContain('app/foo.py');
  });
  it('maps Go foo_test.go -> foo.go', () => {
    expect(inferSourceForTest('lib/foo_test.go', tsFiles, '.')).toContain('lib/foo.go');
  });
  it('maps Java FooTest.java -> Foo.java', () => {
    expect(inferSourceForTest('java/FooTest.java', tsFiles, '.')).toContain('java/Foo.java');
  });
});

describe('inferTestsForSource', () => {
  it('finds test files for source ts', () => {
    expect(inferTestsForSource('src/foo.ts', tsFiles, '.')).toContain('tests/foo.test.ts');
    expect(inferTestsForSource('src/bar.ts', tsFiles, '.')).toContain('src/bar.test.ts');
  });
});

describe('buildTestSourceMap', () => {
  it('returns sourceForTest, testsForSource, unmatchedTests', async () => {
    const fileContents = new Map<string, string>([
      ['tests/foo.test.ts', `import {foo} from '../src/foo.js';\n`],
    ]);
    const map = await buildTestSourceMap(tsFiles, '.', {fileContents});
    expect(map.sourceForTest.get('tests/foo.test.ts')).toContain('src/foo.ts');
    expect(map.testsForSource.get('src/foo.ts')).toContain('tests/foo.test.ts');
    expect(map.unmatchedTests).not.toContain('tests/foo.test.ts');
  });

  it('lists tests with no matched source under unmatchedTests', async () => {
    const map = await buildTestSourceMap(['tests/orphan.test.ts'], '.');
    expect(map.unmatchedTests).toContain('tests/orphan.test.ts');
  });
});
