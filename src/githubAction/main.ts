import {loadActionConfigFromEnv} from './config.js';
import {loadActionEvent} from './events.js';
import {runActionFromEvent} from './runner.js';

export const runGitHubAction = async (
  env: Record<string, string | undefined> = process.env,
): Promise<number> => {
  const event = await loadActionEvent(env);
  if (!event) {
    process.stderr.write(
      'ApeironCode Action could not load GITHUB_EVENT_NAME/GITHUB_EVENT_PATH.\n',
    );
    return 1;
  }

  try {
    const result = await runActionFromEvent({
      config: loadActionConfigFromEnv(env),
      env,
      event,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'failed' ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ApeironCode Action failed: ${message}\n`);
    return 1;
  }
};

const isDirectRun = process.argv[1]?.endsWith('/src/githubAction/main.ts') ||
  process.argv[1]?.endsWith('\\src\\githubAction\\main.ts');

if (isDirectRun) {
  runGitHubAction().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`ApeironCode Action failed: ${message}\n`);
      process.exitCode = 1;
    },
  );
}
