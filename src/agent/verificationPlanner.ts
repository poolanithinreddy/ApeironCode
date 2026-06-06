import type {AgentMode} from './types.js';

export interface VerificationCommand {
  command: string;
  reason: string;
  type: 'test' | 'typecheck' | 'lint' | 'build';
}

export interface VerificationContext {
  buildCommand?: string;
  changedFiles: string[];
  failingCommand?: string;
  lintCommand?: string;
  memoryCommands?: string[];
  mode?: AgentMode;
  testCommand?: string;
  testFiles?: string[];
  userInstruction?: string;
}

export interface VerificationPlan {
  commands: VerificationCommand[];
  lint: boolean;
  maxRuntimeMs: number;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
  tests: string[];
  typecheck: boolean;
}

const isSource = (file: string): boolean => /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift)$/u.test(file);
const isTsSource = (file: string): boolean => /\.(?:ts|tsx)$/u.test(file);
const isDocs = (file: string): boolean => /\.(?:md|txt|adoc)$/u.test(file);
const isConfig = (file: string): boolean => /(^|\/)(package\.json|[^/]+\.(?:config|rc)\.(?:js|ts|json)|tsconfig\.json|vite\.config\.ts)$/u.test(file);

export const shouldRunTestsForChange = (
  changedFiles: string[],
  context: Pick<VerificationContext, 'mode' | 'userInstruction'> = {},
): boolean => {
  if (context.mode === 'test-fix' || /\btest|verify|failing\b/iu.test(context.userInstruction ?? '')) return true;
  if (changedFiles.length === 0) return false;
  if (changedFiles.every(isDocs)) return false;
  return changedFiles.some((file) => isSource(file) || isConfig(file));
};

export const selectVerificationCommands = (
  changedFiles: string[],
  context: VerificationContext,
): VerificationCommand[] => {
  const commands: VerificationCommand[] = [];
  const add = (command: string | undefined, type: VerificationCommand['type'], reason: string): void => {
    if (command && !commands.some((entry) => entry.command === command)) {
      commands.push({command, reason, type});
    }
  };

  if (context.mode === 'test-fix') add(context.failingCommand ?? context.testCommand, 'test', 'rerun failing test first');
  if (shouldRunTestsForChange(changedFiles, context)) add(context.testCommand ?? context.memoryCommands?.[0], 'test', 'source or config changed');
  if (changedFiles.some(isTsSource)) add('npm run typecheck', 'typecheck', 'TypeScript source changed');
  if (changedFiles.some(isConfig)) add(context.buildCommand ?? 'npm run build', 'build', 'configuration/package file changed');
  if (changedFiles.some(isSource)) add(context.lintCommand ?? 'npm run lint', 'lint', 'source file changed');
  return commands.slice(0, 4);
};

export const planVerification = (context: VerificationContext): VerificationPlan => {
  const commands = selectVerificationCommands(context.changedFiles, context);
  const docsOnly = context.changedFiles.length > 0 && context.changedFiles.every(isDocs);
  const configTouched = context.changedFiles.some(isConfig);
  const sourceTouched = context.changedFiles.some(isSource);
  const riskLevel = configTouched ? 'high' : sourceTouched ? 'medium' : 'low';
  return {
    commands,
    lint: commands.some((command) => command.type === 'lint'),
    maxRuntimeMs: riskLevel === 'high' ? 180_000 : riskLevel === 'medium' ? 120_000 : 30_000,
    reason: docsOnly
      ? 'Documentation-only change; tests can be skipped unless requested.'
      : commands.length > 0
        ? `Selected ${commands.length} verification command(s) for ${context.changedFiles.length} changed file(s).`
        : 'No changed files require automated verification.',
    riskLevel,
    tests: [...(context.testFiles ?? []), ...commands.filter((command) => command.type === 'test').map((command) => command.command)],
    typecheck: commands.some((command) => command.type === 'typecheck'),
  };
};

export const formatVerificationPlan = (plan: VerificationPlan): string => [
  `Verification risk: ${plan.riskLevel}`,
  plan.reason,
  plan.commands.length > 0
    ? plan.commands.map((command) => `- ${command.command} (${command.reason})`).join('\n')
    : '- No commands selected.',
].join('\n');
