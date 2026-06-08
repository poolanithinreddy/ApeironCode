import type {AgentSessionRecord, AgentSessionSnapshot} from './types.js';
import type {FileLock} from './locks.js';

export const formatSessionSnapshot = (snapshot: AgentSessionSnapshot): string => {
  const lines = [
    `Session: ${snapshot.id}`,
    `Goal: ${snapshot.goal}`,
    `Status: ${snapshot.status}`,
  ];

  if (snapshot.mode) {
    lines.push(`Mode: ${snapshot.mode}`);
  }

  if (snapshot.filesChanged.length > 0) {
    lines.push(`Files changed: ${snapshot.filesChanged.length}`);
  }

  if (snapshot.filesLocked.length > 0) {
    lines.push(`Files locked: ${snapshot.filesLocked.join(', ')}`);
  }

  if (snapshot.commandsRun.length > 0) {
    lines.push(`Commands run: ${snapshot.commandsRun.length}`);
  }

  if (snapshot.testsRun.length > 0) {
    lines.push(`Tests run: ${snapshot.testsRun.length}`);
  }

  if (snapshot.durationMs !== undefined) {
    const seconds = Math.round(snapshot.durationMs / 1000);
    lines.push(`Duration: ${seconds}s`);
  }

  return lines.join('\n');
};

export const formatSessionsList = (sessions: AgentSessionRecord[]): string => {
  if (sessions.length === 0) {
    return 'No agent sessions.';
  }

  const lines = ['Agent Sessions:', ''];

  for (const session of sessions) {
    const parts = [
      session.goal.length > 50 ? `${session.goal.slice(0, 47)}...` : session.goal,
      `[${session.status}]`,
    ];

    if (session.filesChanged.length > 0) {
      parts.push(`files:${session.filesChanged.length}`);
    }

    if (session.filesLocked.length > 0) {
      parts.push(`locked:${session.filesLocked.length}`);
    }

    const createdTime = new Date(session.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdTime.getTime();
    const diffSec = Math.round(diffMs / 1000);
    let timeStr = '';
    if (diffSec < 60) {
      timeStr = `${diffSec}s ago`;
    } else if (diffSec < 3600) {
      timeStr = `${Math.round(diffSec / 60)}m ago`;
    } else {
      timeStr = `${Math.round(diffSec / 3600)}h ago`;
    }
    parts.push(timeStr);

    lines.push(`• ${session.id.slice(0, 8)} — ${parts.join(' ')}`);
  }

  return lines.join('\n');
};

export const formatFileLocks = (locks: FileLock[]): string => {
  if (locks.length === 0) {
    return 'No file locks.';
  }

  const lines = ['File Locks:', ''];

  for (const lock of locks) {
    const createdTime = new Date(lock.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdTime.getTime();
    const diffSec = Math.round(diffMs / 1000);
    let timeStr = '';
    if (diffSec < 60) {
      timeStr = `${diffSec}s`;
    } else if (diffSec < 3600) {
      timeStr = `${Math.round(diffSec / 60)}m`;
    } else {
      timeStr = `${Math.round(diffSec / 3600)}h`;
    }

    lines.push(`• ${lock.filePath}`);
    lines.push(`  Session: ${lock.sessionId.slice(0, 8)} (${lock.goal})`);
    lines.push(`  Locked for: ${timeStr}`);
  }

  return lines.join('\n');
};

export const formatSessionDetail = (record: AgentSessionRecord): string => {
  const lines = [
    `Agent Session: ${record.id}`,
    '',
    `Goal: ${record.goal}`,
    `Status: ${record.status}`,
  ];

  if (record.mode) {
    lines.push(`Mode: ${record.mode}`);
  }

  if (record.provider) {
    lines.push(`Provider: ${record.provider}`);
  }

  if (record.model) {
    lines.push(`Model: ${record.model}`);
  }

  lines.push('');
  lines.push('Progress:');

  if (record.filesChanged.length > 0) {
    lines.push(`  Files changed: ${record.filesChanged.length}`);
    for (const file of record.filesChanged.slice(0, 5)) {
      lines.push(`    - ${file}`);
    }
    if (record.filesChanged.length > 5) {
      lines.push(`    ... and ${record.filesChanged.length - 5} more`);
    }
  } else {
    lines.push(`  Files changed: 0`);
  }

  if (record.filesLocked.length > 0) {
    lines.push(`  Files locked: ${record.filesLocked.length}`);
    for (const file of record.filesLocked) {
      lines.push(`    - ${file}`);
    }
  }

  lines.push(`  Commands run: ${record.commandsRun.length}`);
  lines.push(`  Tests run: ${record.testsRun.length}`);

  if (record.startedAt) {
    lines.push('');
    lines.push('Timeline:');
    lines.push(`  Started: ${new Date(record.startedAt).toLocaleString()}`);
    if (record.completedAt) {
      lines.push(`  Completed: ${new Date(record.completedAt).toLocaleString()}`);
      const durationMs = new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime();
      const seconds = Math.round(durationMs / 1000);
      lines.push(`  Duration: ${seconds}s`);
    } else {
      lines.push(`  Elapsed: ${Math.round((Date.now() - new Date(record.startedAt).getTime()) / 1000)}s`);
    }
  }

  if (record.summary) {
    lines.push('');
    lines.push('Summary:');
    lines.push(record.summary);
  }

  if (record.error) {
    lines.push('');
    lines.push(`Error: ${record.error}`);
  }

  return lines.join('\n');
};
