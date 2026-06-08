export const getSlackBotToken = (env: Record<string, string | undefined> = process.env): string | null =>
  env.SLACK_BOT_TOKEN || null;

export const formatSlackSetupHint = (): string =>
  'Slack connector is opt-in. Set SLACK_BOT_TOKEN (a bot token starting with xoxb-). Tokens are read from env only and never printed.';
