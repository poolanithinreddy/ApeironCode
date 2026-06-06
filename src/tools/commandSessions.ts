import {spawn, type ChildProcess} from 'node:child_process';
import crypto from 'node:crypto';

export interface CommandSessionRecord {
  command: string;
  cwd: string;
  endedAt?: string;
  exitCode?: number | null;
  id: string;
  output: string[];
  pid?: number;
  startedAt: string;
  status: 'exited' | 'failed' | 'killed' | 'running';
}

interface ManagedCommandSession {
  process: ChildProcess;
  record: CommandSessionRecord;
}

export class CommandSessionManager {
  private readonly sessions = new Map<string, ManagedCommandSession>();

  start(command: string, cwd: string): CommandSessionRecord {
    const id = crypto.randomUUID();
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const record: CommandSessionRecord = {
      command,
      cwd,
      id,
      output: [],
      pid: child.pid,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    const managedSession: ManagedCommandSession = {
      process: child,
      record,
    };
    this.sessions.set(id, managedSession);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      record.output.push(chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      record.output.push(chunk.toString());
    });
    child.on('close', (code, signal) => {
      record.endedAt = new Date().toISOString();
      record.exitCode = code;
      record.status = signal ? 'killed' : code === 0 ? 'exited' : 'failed';
    });

    return record;
  }

  get(sessionId: string): CommandSessionRecord | null {
    return this.sessions.get(sessionId)?.record ?? null;
  }

  getOutput(sessionId: string, maxChars = 6_000): string | null {
    const record = this.get(sessionId);
    if (!record) {
      return null;
    }

    const joined = record.output.join('');
    if (joined.length <= maxChars) {
      return joined;
    }

    return joined.slice(joined.length - maxChars);
  }

  kill(sessionId: string): boolean {
    const managedSession = this.sessions.get(sessionId);
    if (!managedSession) {
      return false;
    }

    managedSession.process.kill('SIGTERM');
    managedSession.record.status = 'killed';
    managedSession.record.endedAt = new Date().toISOString();
    return true;
  }
}

export const commandSessionManager = new CommandSessionManager();