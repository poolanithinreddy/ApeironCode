import {isKnownMentionCommand, listKnownMentionCommands, parseMentionCommand} from '../connectors/github/webhooks.js';
import type {AutomationResult} from './types.js';

export interface ResolvedMention {
  args: string[];
  command: string;
  known: boolean;
  raw: string;
}

export const resolveMentionFromComment = (commentBody: string | undefined): ResolvedMention | null => {
  const parsed = parseMentionCommand(commentBody);
  if (!parsed) {
    return null;
  }
  return {
    args: parsed.args,
    command: parsed.command,
    known: isKnownMentionCommand(parsed.command),
    raw: parsed.raw,
  };
};

export const buildUnknownCommandResult = (mention: ResolvedMention): AutomationResult => ({
  dryRun: true,
  message: [
    `Unknown command: ${mention.command}`,
    `Known commands: ${listKnownMentionCommands().join(', ')}`,
  ].join('\n'),
  status: 'skipped',
  steps: [
    {
      detail: mention.raw,
      name: 'Parse mention command',
      status: 'succeeded',
    },
    {
      detail: `command "${mention.command}" not in known set`,
      name: 'Validate command',
      status: 'failed',
    },
  ],
  workflow: 'mention-command',
});

export const mapMentionToWorkflow = (
  command: string,
): 'issue-to-pr' | 'pr-review' | 'ci-fix' | 'mention-command' => {
  switch (command.toLowerCase()) {
    case 'implement':
    case 'apply-suggestion':
      return 'issue-to-pr';
    case 'review':
      return 'pr-review';
    case 'fix-tests':
      return 'ci-fix';
    default:
      return 'mention-command';
  }
};
