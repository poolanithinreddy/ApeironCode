export type ActionMode = 'auto' | 'issue-to-pr' | 'pr-review' | 'ci-fix' | 'mention';

export interface ActionConfig {
  allowedTools: string[];
  configPath?: string;
  dryRun: boolean;
  maxIterations: number;
  mode: ActionMode;
  model?: string;
  provider?: string;
  runTests: boolean;
}

const parseBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  const lower = value.trim().toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  return defaultValue;
};

const parseMode = (value: string | undefined): ActionMode => {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'issue-to-pr':
    case 'issue':
      return 'issue-to-pr';
    case 'pr-review':
    case 'review':
      return 'pr-review';
    case 'ci-fix':
    case 'fix':
      return 'ci-fix';
    case 'mention':
      return 'mention';
    default:
      return 'auto';
  }
};

const parseList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value.split(/[,\s]+/u).map((item) => item.trim()).filter(Boolean);
};

// Resolve an env var, preferring the new APEIRONCODE_* name and falling back
// to the legacy OPENCODE_* name so existing GitHub Action workflows continue
// to work without modification.
const pickEnv = (
  env: Record<string, string | undefined>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

export const loadActionConfigFromEnv = (env: Record<string, string | undefined> = process.env): ActionConfig => ({
  allowedTools: parseList(pickEnv(env, 'APEIRONCODE_ALLOWED_TOOLS', 'OPENCODE_ALLOWED_TOOLS', 'INPUT_ALLOWED_TOOLS')),
  configPath: pickEnv(env, 'APEIRONCODE_CONFIG_PATH', 'OPENCODE_CONFIG_PATH', 'INPUT_APEIRONCODE_CONFIG_PATH', 'INPUT_OPENCODE_CONFIG_PATH'),
  dryRun: parseBool(pickEnv(env, 'INPUT_DRY_RUN', 'APEIRONCODE_DRY_RUN', 'OPENCODE_DRY_RUN'), true),
  maxIterations: Number.parseInt(pickEnv(env, 'INPUT_MAX_ITERATIONS', 'APEIRONCODE_MAX_ITERATIONS', 'OPENCODE_MAX_ITERATIONS') ?? '6', 10) || 6,
  mode: parseMode(pickEnv(env, 'INPUT_MODE', 'APEIRONCODE_MODE', 'OPENCODE_MODE')),
  model: pickEnv(env, 'INPUT_MODEL', 'APEIRONCODE_MODEL', 'OPENCODE_MODEL'),
  provider: pickEnv(env, 'INPUT_PROVIDER', 'APEIRONCODE_PROVIDER', 'OPENCODE_PROVIDER'),
  runTests: parseBool(pickEnv(env, 'INPUT_RUN_TESTS', 'APEIRONCODE_RUN_TESTS', 'OPENCODE_RUN_TESTS'), false),
});
