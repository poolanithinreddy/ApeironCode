import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import crypto from 'node:crypto';
import {ensureDirectory} from '../../utils/fs.js';
import type {AgentSessionEvent, AgentSessionEventType, LogStreamOptions} from './types.js';

export class SessionLogStore {
  private readonly logsDir: string;

  constructor(cwd: string) {
    this.logsDir = join(cwd, '.apeironcode-agent', 'sessions', 'logs');
  }

  async appendEvent(sessionId: string, type: AgentSessionEventType, message?: string, data?: Record<string, unknown>): Promise<void> {
    await ensureDirectory(this.logsDir);

    const event: AgentSessionEvent = {
      id: crypto.randomUUID(),
      sessionId,
      type,
      timestamp: new Date().toISOString(),
      message,
      data,
    };

    const logFile = this.getLogFilePath(sessionId);
    const eventLine = JSON.stringify(event) + '\n';
    await fs.appendFile(logFile, eventLine, 'utf8');
  }

  async readEvents(sessionId: string): Promise<AgentSessionEvent[]> {
    const logFile = this.getLogFilePath(sessionId);
    try {
      const content = await fs.readFile(logFile, 'utf8');
      return content
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as AgentSessionEvent);
    } catch {
      return [];
    }
  }

  async getTailEvents(sessionId: string, count: number = 50): Promise<AgentSessionEvent[]> {
    const events = await this.readEvents(sessionId);
    return events.slice(Math.max(0, events.length - count));
  }

  async getRecentEvents(sessionId: string, sinceTimestamp?: string): Promise<AgentSessionEvent[]> {
    const events = await this.readEvents(sessionId);
    if (!sinceTimestamp) {
      return events;
    }
    return events.filter(e => new Date(e.timestamp) > new Date(sinceTimestamp));
  }

  streamEvents(
    sessionId: string,
    options: LogStreamOptions = {},
  ): AsyncIterable<AgentSessionEvent> {
    const {tail = 50, follow = false, timeout = 30000} = options;

    return this.createEventStream(sessionId, tail, follow, timeout);
  }

  private async *createEventStream(
    sessionId: string,
    tail: number,
    follow: boolean,
    timeout: number,
  ): AsyncIterable<AgentSessionEvent> {
    const events = await this.getTailEvents(sessionId, tail);
    const emitted = new Set<string>();

    for (const event of events) {
      emitted.add(event.id);
      yield event;
    }

    if (!follow) {
      return;
    }

    const startTime = Date.now();

    // Poll for new events
    while (Date.now() - startTime < timeout) {
      try {
        const allEvents = await this.readEvents(sessionId);
        for (const event of allEvents) {
          if (!emitted.has(event.id)) {
            emitted.add(event.id);
            yield event;
          }
        }
      } catch {
        // Silently continue on read errors
      }

      // Small delay to avoid busy polling
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async deleteEventLog(sessionId: string): Promise<void> {
    const logFile = this.getLogFilePath(sessionId);
    try {
      await fs.unlink(logFile);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private getLogFilePath(sessionId: string): string {
    return join(this.logsDir, `${sessionId}.jsonl`);
  }
}
