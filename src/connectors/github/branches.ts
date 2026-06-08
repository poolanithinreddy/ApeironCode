import type {GitHubClient} from './client.js';

export interface GitHubBranchRef {
  name: string;
  sha: string;
}

interface RawBranch {
  commit?: {sha?: string};
  name?: string;
}

interface RawRef {
  object?: {sha?: string; type?: string};
  ref?: string;
}

interface RawRepo {
  default_branch?: string;
  full_name?: string;
  html_url?: string;
}

export const getRepository = async (client: GitHubClient): Promise<{defaultBranch: string; fullName?: string; htmlUrl?: string}> => {
  const repo = await client.request<RawRepo>('');
  return {
    defaultBranch: repo.default_branch ?? 'main',
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
  };
};

export const getDefaultBranch = async (client: GitHubClient): Promise<string> =>
  (await getRepository(client)).defaultBranch;

export const getBranch = async (client: GitHubClient, name: string): Promise<GitHubBranchRef | null> => {
  try {
    const branch = await client.request<RawBranch>(`/branches/${encodeURIComponent(name)}`);
    if (!branch.name || !branch.commit?.sha) {
      return null;
    }
    return {name: branch.name, sha: branch.commit.sha};
  } catch {
    return null;
  }
};

export const getRefSha = async (client: GitHubClient, ref: string): Promise<string | null> => {
  try {
    const data = await client.request<RawRef>(`/git/ref/${ref.replace(/^refs\//, '')}`);
    return data.object?.sha ?? null;
  } catch {
    return null;
  }
};

export const createBranch = async (
  client: GitHubClient,
  branchName: string,
  fromRef?: string,
): Promise<GitHubBranchRef> => {
  const sourceRef = fromRef ?? `heads/${await getDefaultBranch(client)}`;
  const sha = await getRefSha(client, sourceRef);
  if (!sha) {
    throw new Error(`Source ref not found: ${sourceRef}`);
  }
  const response = await client.request<RawRef>('/git/refs', {
    body: JSON.stringify({ref: `refs/heads/${branchName}`, sha}),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });
  if (!response.object?.sha) {
    throw new Error(`Failed to create branch: ${branchName}`);
  }
  return {name: branchName, sha: response.object.sha};
};
