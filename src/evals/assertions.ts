import type {EvalAssertion, EvalAssertionContext} from './types.js';

type Pattern = RegExp | string;

const matchesPattern = (content: string, pattern: Pattern): boolean =>
  typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);

const patternLabel = (pattern: Pattern): string => typeof pattern === 'string' ? JSON.stringify(pattern) : String(pattern);

const assertion = (name: string, run: (context: EvalAssertionContext) => Promise<string[]>): EvalAssertion => ({
  name,
  run,
});

export const fileExists = (filePath: string): EvalAssertion =>
  assertion(`fileExists(${filePath})`, async ({workspace}) =>
    await workspace.exists(filePath) ? [] : [`Expected file to exist: ${filePath}`]);

export const fileNotExists = (filePath: string): EvalAssertion =>
  assertion(`fileNotExists(${filePath})`, async ({workspace}) =>
    await workspace.exists(filePath) ? [`Expected file not to exist: ${filePath}`] : []);

export const fileContains = (filePath: string, pattern: Pattern): EvalAssertion =>
  assertion(`fileContains(${filePath})`, async ({workspace}) => {
    if (!(await workspace.exists(filePath))) {
      return [`Expected file to contain ${patternLabel(pattern)}, but it does not exist: ${filePath}`];
    }
    const content = await workspace.readFile(filePath);
    return matchesPattern(content, pattern)
      ? []
      : [`Expected ${filePath} to contain ${patternLabel(pattern)}`];
  });

export const fileNotContains = (filePath: string, pattern: Pattern): EvalAssertion =>
  assertion(`fileNotContains(${filePath})`, async ({workspace}) => {
    if (!(await workspace.exists(filePath))) {
      return [];
    }
    const content = await workspace.readFile(filePath);
    return matchesPattern(content, pattern)
      ? [`Expected ${filePath} not to contain ${patternLabel(pattern)}`]
      : [];
  });

export const commandSucceeds = (command: string, args: string[] = []): EvalAssertion =>
  assertion(`commandSucceeds(${command})`, async ({workspace}) => {
    const result = await workspace.run(command, args);
    return result.exitCode === 0
      ? []
      : [`Expected command to succeed: ${command} ${args.join(' ')}\n${result.stderr || result.stdout}`.trim()];
  });

export const commandFails = (command: string, args: string[] = []): EvalAssertion =>
  assertion(`commandFails(${command})`, async ({workspace}) => {
    const result = await workspace.run(command, args);
    return result.exitCode !== 0 ? [] : [`Expected command to fail: ${command} ${args.join(' ')}`.trim()];
  });

export const noFileModified = (filePath: string): EvalAssertion =>
  assertion(`noFileModified(${filePath})`, async ({workspace, initialFiles}) => {
    const initial = initialFiles.get(filePath);
    const exists = await workspace.exists(filePath);
    if (initial === undefined) {
      return exists ? [`Expected file to remain absent: ${filePath}`] : [];
    }
    if (!exists) {
      return [`Expected file not to be deleted: ${filePath}`];
    }
    const current = await workspace.readFile(filePath);
    return current === initial ? [] : [`Expected file not to be modified: ${filePath}`];
  });

export const toolWasCalled = (toolName: string): EvalAssertion =>
  assertion(`toolWasCalled(${toolName})`, ({result}) => Promise.resolve(
    result.toolCalls.some((toolCall) => toolCall.toolName === toolName)
      ? []
      : [`Expected tool to be called: ${toolName}`]));

export const toolWasNotCalled = (toolName: string): EvalAssertion =>
  assertion(`toolWasNotCalled(${toolName})`, ({result}) => Promise.resolve(
    result.toolCalls.some((toolCall) => toolCall.toolName === toolName)
      ? [`Expected tool not to be called: ${toolName}`]
      : []));

export const iterationsBelow = (maxExclusive: number): EvalAssertion =>
  assertion(`iterationsBelow(${maxExclusive})`, ({result}) => Promise.resolve(
    result.iterations !== undefined && result.iterations >= maxExclusive
      ? [`Expected iterations below ${maxExclusive}, got ${result.iterations}`]
      : []));

export const customAssertion = (
  name: string,
  run: (context: EvalAssertionContext) => Promise<string[]>,
): EvalAssertion => assertion(name, run);
