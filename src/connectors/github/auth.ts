export const getGitHubToken = (env: Record<string, string | undefined> = process.env): string | null =>
  env.GITHUB_TOKEN || env.GH_TOKEN || null;

export const formatGitHubSetupHint = (): string =>
  'GitHub connector is opt-in. Set GITHUB_TOKEN with the smallest required scope; tokens are read from env only and never printed.';
