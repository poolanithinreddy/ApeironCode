import {describe, expect, it} from 'vitest';

import {
  detectTodoMarkers,
  evaluateCompletionGates,
  formatCompletionGateFeedback,
  type CompletionGateContext,
} from '../../src/agent/completionGates.js';

const baseCtx = (overrides: Partial<CompletionGateContext> = {}): CompletionGateContext => ({
  filesChanged: [],
  toolsExecuted: [],
  toolFailures: [],
  rollbackOccurred: false,
  userAskedForTests: false,
  todoMarkersIntroduced: false,
  verificationRan: false,
  buildRan: false,
  testsRan: false,
  ...overrides,
});

describe('completionGates', () => {
  it('source edit without tests triggers warn gate', () => {
    const r = evaluateCompletionGates(baseCtx({filesChanged: ['src/foo.ts']}));
    const gate = r.gates.find((g) => g.name === 'src-without-tests');
    expect(gate?.passed).toBe(false);
  });

  it('docs-only change does not trigger src gate', () => {
    const r = evaluateCompletionGates(baseCtx({filesChanged: ['README.md']}));
    const gate = r.gates.find((g) => g.name === 'src-without-tests');
    expect(gate?.passed).toBe(true);
  });

  it('package change without build triggers gate', () => {
    const r = evaluateCompletionGates(baseCtx({filesChanged: ['package.json']}));
    expect(r.gates.find((g) => g.name === 'package-without-build')?.passed).toBe(false);
  });

  it('failed tool not recovered blocks', () => {
    const r = evaluateCompletionGates(baseCtx({toolFailures: ['edit_file']}));
    const gate = r.gates.find((g) => g.name === 'failed-tool-ignored');
    expect(gate?.passed).toBe(false);
    expect(gate?.severity).toBe('block');
  });

  it('rollback occurred blocks', () => {
    const r = evaluateCompletionGates(baseCtx({rollbackOccurred: true}));
    expect(r.gates.find((g) => g.name === 'rollback-requires-explanation')?.passed).toBe(false);
  });

  it('user asked tests not run warns', () => {
    const r = evaluateCompletionGates(baseCtx({userAskedForTests: true}));
    expect(r.gates.find((g) => g.name === 'user-asked-tests-not-run')?.passed).toBe(false);
  });

  it('TODO introduced warns', () => {
    const r = evaluateCompletionGates(baseCtx({todoMarkersIntroduced: true}));
    expect(r.gates.find((g) => g.name === 'unresolved-todo')?.passed).toBe(false);
  });

  it('detectTodoMarkers identifies code TODO/FIXME/HACK markers', () => {
    expect(detectTodoMarkers('// TODO: fix this')).toBe(true);
    expect(detectTodoMarkers('// FIXME: broken edge case')).toBe(true);
    expect(detectTodoMarkers('// HACK: workaround')).toBe(true);
    expect(detectTodoMarkers('throw new Error("TODO: implement")')).toBe(true);
    expect(detectTodoMarkers('class Foo extends NotImplemented {}')).toBe(true);
  });

  it('detectTodoMarkers ignores prose mentions', () => {
    expect(detectTodoMarkers('my todo list for the week')).toBe(false);
    expect(detectTodoMarkers('all done, no markers here')).toBe(false);
    expect(detectTodoMarkers('')).toBe(false);
  });

  it('changedTextSummary with TODO marker triggers unresolved-todo gate', () => {
    const r = evaluateCompletionGates(baseCtx({changedTextSummary: '// TODO: remove this hack'}));
    const gate = r.gates.find((g) => g.name === 'unresolved-todo');
    expect(gate?.passed).toBe(false);
  });

  it('changedTextSummary without markers leaves unresolved-todo gate green', () => {
    const r = evaluateCompletionGates(baseCtx({changedTextSummary: 'function foo() { return 1; }'}));
    const gate = r.gates.find((g) => g.name === 'unresolved-todo');
    expect(gate?.passed).toBe(true);
  });

  it('all clean passes', () => {
    const r = evaluateCompletionGates(baseCtx({
      filesChanged: ['src/x.ts'],
      testsRan: true,
      buildRan: true,
    }));
    expect(r.passed).toBe(true);
    expect(formatCompletionGateFeedback(r)).toBe('');
  });
});
