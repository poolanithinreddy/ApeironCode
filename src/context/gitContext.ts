import {execa} from 'execa';

export interface GitContext {
  currentBranch: string | null;
  recentAuthors: string[];
  recentCommitMessages: string[];
  recentFiles: string[];
  stagedFiles: string[];
  uncommittedFiles: string[];
}

const parseGitStatus = (output: string): {staged: string[]; uncommitted: string[]} => {
  const staged: string[] = [];
  const uncommitted: string[] = [];

  const lines = output.split('\n');
  for (const line of lines) {
    if (line.length < 3) continue;

    const status = line.substring(0, 2);
    const file = line.substring(3).trim();

    // First character: staged changes
    if (status[0] !== ' ' && status[0] !== '?') {
      staged.push(file);
    }

    // Second character: unstaged changes
    if (status[1] !== ' ' && status[1] !== '?') {
      uncommitted.push(file);
    }

    // Both '?': untracked
    if (status === '??') {
      uncommitted.push(file);
    }
  }

  return {staged, uncommitted};
};

const parseBranch = (output: string): string | null => {
  // Output format: "## branch-name"
  const match = output.match(/^## (.+)/);
  if (match && match[1]) {
    const branchName = match[1];
    // Handle detached HEAD
    if (branchName.includes('...')) {
      return null;
    }
    return branchName;
  }
  return null;
};

const parseRecentFiles = (output: string): string[] => {
  const files = new Set<string>();
  const lines = output.split('\n');

  for (const line of lines) {
    // Format: "commit-hash file1 file2 ..."
    const parts = line.split(/\s+/);
    if (parts.length > 1) {
      // Skip the commit hash
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part) {
          files.add(part);
        }
      }
    }
  }

  return Array.from(files).slice(0, 20);
};

const parseAuthorsAndMessages = (output: string): {authors: string[]; messages: string[]} => {
  const authors = new Set<string>();
  const messages: string[] = [];

  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]+)\s+(.+?)\s+(.+)$/);
    if (match && match[2] && match[3]) {
      const authorMatch = match[3].match(/\((.+?)\)$/);
      if (authorMatch && authorMatch[1]) {
        authors.add(authorMatch[1]);
      }
      messages.push(match[2]);
    }
  }

  return {authors: Array.from(authors), messages};
};

export const buildGitContext = async (cwd: string): Promise<GitContext> => {
  const context: GitContext = {
    currentBranch: null,
    recentAuthors: [],
    recentCommitMessages: [],
    recentFiles: [],
    stagedFiles: [],
    uncommittedFiles: [],
  };

  try {
    // Get git status
    const statusResult = await execa('git', ['status', '--short', '--branch'], {
      cwd,
      reject: false,
    });

    if (statusResult.exitCode === 0) {
      const statusLines = statusResult.stdout.split('\n');
      // First line has branch info
      if (statusLines[0]) {
        context.currentBranch = parseBranch(statusLines[0]);
      }

      // Parse file statuses from remaining lines
      const fileStatus = parseGitStatus(statusLines.slice(1).join('\n'));
      context.stagedFiles = fileStatus.staged;
      context.uncommittedFiles = fileStatus.uncommitted;
    }

    // Get recent files changed (last 5 commits)
    const filesResult = await execa(
      'git',
      ['log', '--pretty=format:', '--name-only', '-5'],
      {cwd, reject: false},
    );

    if (filesResult.exitCode === 0) {
      context.recentFiles = parseRecentFiles(filesResult.stdout);
    }

    // Get recent authors and commit messages
    const logResult = await execa(
      'git',
      ['log', '--pretty=format:%H %s (%an)', '-10'],
      {cwd, reject: false},
    );

    if (logResult.exitCode === 0) {
      const parsed = parseAuthorsAndMessages(logResult.stdout);
      context.recentAuthors = parsed.authors;
      context.recentCommitMessages = parsed.messages;
    }
  } catch {
    // Not a git repo or git not available - return empty context
  }

  return context;
};
