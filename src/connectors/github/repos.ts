import {execa} from 'execa';

export interface GitHubRepoRef {
  name: string;
  owner: string;
  remoteUrl: string;
}

export const parseGitHubRemote = (remoteUrl: string): GitHubRepoRef | null => {
  const trimmed = remoteUrl.trim();
  const match = trimmed.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/iu);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    name: match[2],
    owner: match[1],
    remoteUrl: trimmed,
  };
};

export const detectGitHubRepo = async (cwd: string): Promise<GitHubRepoRef | null> => {
  try {
    const result = await execa('git', ['remote', 'get-url', 'origin'], {cwd});
    return parseGitHubRemote(result.stdout);
  } catch {
    return null;
  }
};
