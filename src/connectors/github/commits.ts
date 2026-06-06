import type {GitHubClient} from './client.js';

export interface CommitFileInput {
  content: string;
  path: string;
}

interface RawTreeEntry {
  mode: string;
  path: string;
  sha?: string;
  type: 'blob' | 'tree';
  content?: string;
}

interface RawTreeResponse {
  sha: string;
  url?: string;
}

interface RawCommitResponse {
  html_url?: string;
  sha: string;
}

interface RawRefResponse {
  object?: {sha?: string};
  ref?: string;
}

const getBranchCommitSha = async (client: GitHubClient, branch: string): Promise<string> => {
  const data = await client.request<RawRefResponse>(`/git/ref/heads/${branch}`);
  if (!data.object?.sha) {
    throw new Error(`Branch ref not found: ${branch}`);
  }
  return data.object.sha;
};

const getCommitTreeSha = async (client: GitHubClient, commitSha: string): Promise<string> => {
  const data = await client.request<{tree?: {sha?: string}}>(`/git/commits/${commitSha}`);
  if (!data.tree?.sha) {
    throw new Error(`Commit tree not found: ${commitSha}`);
  }
  return data.tree.sha;
};

export const commitFiles = async (
  client: GitHubClient,
  branchName: string,
  files: CommitFileInput[],
  message: string,
): Promise<{sha: string; htmlUrl?: string}> => {
  if (files.length === 0) {
    throw new Error('No files provided to commit.');
  }

  const parentSha = await getBranchCommitSha(client, branchName);
  const baseTreeSha = await getCommitTreeSha(client, parentSha);

  const treeEntries: RawTreeEntry[] = files.map((file) => ({
    content: file.content,
    mode: '100644',
    path: file.path,
    type: 'blob',
  }));

  const newTree = await client.request<RawTreeResponse>('/git/trees', {
    body: JSON.stringify({base_tree: baseTreeSha, tree: treeEntries}),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });

  const commit = await client.request<RawCommitResponse>('/git/commits', {
    body: JSON.stringify({message, parents: [parentSha], tree: newTree.sha}),
    headers: {'content-type': 'application/json'},
    method: 'POST',
  });

  await client.request<RawRefResponse>(`/git/refs/heads/${branchName}`, {
    body: JSON.stringify({sha: commit.sha}),
    headers: {'content-type': 'application/json'},
    method: 'PATCH',
  });

  return {htmlUrl: commit.html_url, sha: commit.sha};
};
