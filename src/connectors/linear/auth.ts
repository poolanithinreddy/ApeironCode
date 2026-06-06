export const getLinearApiKey = (env: Record<string, string | undefined> = process.env): string | null =>
  env.LINEAR_API_KEY || null;

export const formatLinearSetupHint = (): string =>
  'Linear connector is opt-in. Set LINEAR_API_KEY (personal API key from https://linear.app/settings/api). The key is read from env only and never printed.';
