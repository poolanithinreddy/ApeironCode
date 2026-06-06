import {describe, expect, it, vi} from 'vitest';

import {buildProgram} from '../../src/cli/commands.js';
import {formatConnectorStatus} from '../../src/connectors/github/format.js';
import {validateConnectorEnv} from '../../src/connectors/envValidation.js';

describe('connector CLI commands', () => {
  it('routes connector list and env commands without exposing env values', async () => {
    const connectorList = vi.fn(() => Promise.resolve());
    const connectorEnv = vi.fn(() => Promise.resolve());
    const handlers = new Proxy({connectorEnv, connectorList}, {
      get: (target, property: string) => property in target
        ? target[property as keyof typeof target]
        : vi.fn(() => Promise.resolve()),
    }) as never;
    const program = buildProgram(handlers);

    await program.parseAsync(['node', 'opencode', 'connector', 'list']);
    await program.parseAsync(['node', 'opencode', 'connector', 'env', 'slack']);

    expect(connectorList).toHaveBeenCalledTimes(1);
    expect(connectorEnv).toHaveBeenCalledWith('slack');
  });

  it('shows connector names and env variable names, not values', () => {
    const validation = validateConnectorEnv('slack', {SLACK_BOT_TOKEN: 'xoxb-secret-value'});
    const output = [
      formatConnectorStatus({configured: true, detail: 'SLACK_BOT_TOKEN configured', name: 'slack', permissions: ['SlackRead']}),
      ...validation.requirements.map((requirement) => requirement.name),
    ].join('\n');

    expect(output).toContain('slack');
    expect(output).toContain('SLACK_BOT_TOKEN');
    expect(output).not.toContain('xoxb-secret-value');
  });
});
