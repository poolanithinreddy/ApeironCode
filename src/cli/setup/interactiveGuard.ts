/**
 * Interactive context detection for ApeironCode.
 * Determines whether the current process is running in an interactive terminal
 * context, to guard against showing interactive prompts in CI or scripted runs.
 */

const NON_INTERACTIVE_SUBCOMMANDS = new Set([
  'doctor',
  'help',
  'bridge',
  'version',
  '--version',
  '-V',
  '--help',
  '-h',
  'export',
  'report',
]);

export interface InteractiveGuardEnv {
  CI?: string;
  CONTINUOUS_INTEGRATION?: string;
  GITHUB_ACTIONS?: string;
  BUILDKITE?: string;
  CIRCLECI?: string;
  TRAVIS?: string;
  JENKINS_URL?: string;
  APEIRONCODE_NO_SETUP?: string;
  [key: string]: string | undefined;
}

/**
 * Returns true when the current context supports interactive prompts.
 * Non-interactive when: CI env vars set, stdout not TTY, --no-setup flag,
 * or a non-interactive subcommand is being run.
 */
export const isInteractiveContext = (
  argv: string[] = process.argv,
  env: InteractiveGuardEnv = process.env,
): boolean => {
  // Check CI environment variables
  if (
    env.CI === '1' ||
    env.CI === 'true' ||
    env.CONTINUOUS_INTEGRATION === 'true' ||
    env.GITHUB_ACTIONS === 'true' ||
    env.BUILDKITE === 'true' ||
    env.CIRCLECI === 'true' ||
    env.TRAVIS === 'true' ||
    env.JENKINS_URL !== undefined ||
    env.APEIRONCODE_NO_SETUP === '1'
  ) {
    return false;
  }

  // Check for --no-setup flag in argv
  if (argv.includes('--no-setup')) {
    return false;
  }

  // Check for non-interactive subcommands
  for (const arg of argv.slice(2)) {
    if (NON_INTERACTIVE_SUBCOMMANDS.has(arg)) {
      return false;
    }
  }

  // Require a real TTY for interactive prompts
  if (process.stdout.isTTY !== true) {
    return false;
  }

  return true;
};

/**
 * Returns a human-readable reason why the context is non-interactive.
 * Returns null if the context is interactive.
 */
export const describeNonInteractiveReason = (
  argv: string[] = process.argv,
  env: InteractiveGuardEnv = process.env,
): string | null => {
  if (
    env.CI === '1' ||
    env.CI === 'true' ||
    env.CONTINUOUS_INTEGRATION === 'true' ||
    env.GITHUB_ACTIONS === 'true' ||
    env.BUILDKITE === 'true' ||
    env.CIRCLECI === 'true' ||
    env.TRAVIS === 'true' ||
    env.JENKINS_URL !== undefined
  ) {
    return 'CI environment detected';
  }

  if (env.APEIRONCODE_NO_SETUP === '1') {
    return '--no-setup environment variable set';
  }

  if (argv.includes('--no-setup')) {
    return '--no-setup flag present';
  }

  for (const arg of argv.slice(2)) {
    if (NON_INTERACTIVE_SUBCOMMANDS.has(arg)) {
      return `non-interactive subcommand: ${arg}`;
    }
  }

  if (process.stdout.isTTY !== true) {
    return 'stdout is not a TTY';
  }

  return null;
};
