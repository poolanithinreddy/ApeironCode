import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory} from './fs.js';
import {getAppHomeDir} from './paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface LogEntry {
  fields?: LogFields;
  level: LogLevel;
  message: string;
  module?: string;
  runId?: string;
  sessionId?: string;
  timestamp: string;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
}

interface StructuredLoggerOptions {
  logDir?: string;
  level?: LogLevel;
  module?: string;
  retentionDays?: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {debug: 10, info: 20, warn: 30, error: 40};
const SECRET_KEY_RE = /api[_-]?key|token|secret|password|authorization|credential|bearer|aws.*key|azure.*key|github|linear|jira|slack|anthropic|openai|gemini/iu;
const SECRET_VALUE_RE = /(authorization:\s*bearer\s+)[^\s"']+|((?:api[_-]?key|token|secret|password)\s*=\s*)[^\s"']+/giu;

export const redactLogValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(SECRET_VALUE_RE, (_match, bearerPrefix: string | undefined, envPrefix: string | undefined) =>
      `${bearerPrefix ?? envPrefix ?? ''}[REDACTED]`);
  }
  if (Array.isArray(value)) {
    return value.map(redactLogValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SECRET_KEY_RE.test(key) ? '[REDACTED]' : redactLogValue(nested),
    ]));
  }
  return value;
};

const today = (): string => new Date().toISOString().slice(0, 10);

export const getDefaultLogDir = (): string => path.join(getAppHomeDir(), 'logs');

export const readRecentLogLines = async (logDir = getDefaultLogDir(), limit = 50): Promise<string[]> => {
  try {
    const files = (await fs.readdir(logDir))
      .filter((file) => /^(?:apeironcode|opencode)-\d{4}-\d{2}-\d{2}\.jsonl$/u.test(file))
      .sort();
    const selected = files.slice(-3);
    const lines: string[] = [];
    for (const file of selected) {
      lines.push(...(await fs.readFile(path.join(logDir, file), 'utf8')).split(/\r?\n/u).filter(Boolean));
    }
    return lines.slice(-limit).map((line) => String(redactLogValue(line)));
  } catch {
    return [];
  }
};

export class StructuredLogger implements Logger {
  private readonly logDir: string;
  private readonly level: LogLevel;
  private readonly module?: string;
  private readonly retentionDays: number;

  constructor(options: StructuredLoggerOptions = {}) {
    this.logDir = options.logDir ?? getDefaultLogDir();
    this.level = options.level
      ?? (process.env.APEIRONCODE_LOG_LEVEL as LogLevel | undefined)
      // Legacy fallback for the pre-rebrand env var.
      ?? (process.env.OPENCODE_LOG_LEVEL as LogLevel | undefined)
      ?? 'info';
    this.module = options.module;
    this.retentionDays = options.retentionDays ?? 7;
  }

  debug(message: string, fields?: LogFields): void { this.write('debug', message, fields); }
  info(message: string, fields?: LogFields): void { this.write('info', message, fields); }
  warn(message: string, fields?: LogFields): void { this.write('warn', message, fields); }
  error(message: string, fields?: LogFields): void { this.write('error', message, fields); }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }
    const entry: LogEntry = {
      fields: fields ? redactLogValue(fields) as LogFields : undefined,
      level,
      message: redactLogValue(message) as string,
      module: this.module,
      timestamp: new Date().toISOString(),
    };
    void this.append(entry);
  }

  private async append(entry: LogEntry): Promise<void> {
    try {
      await ensureDirectory(this.logDir);
      await fs.appendFile(path.join(this.logDir, `apeironcode-${today()}.jsonl`), `${JSON.stringify(entry)}\n`, 'utf8');
      await this.rotate();
    } catch {
      // Logging must never break user workflows.
    }
  }

  private async rotate(): Promise<void> {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const files = await fs.readdir(this.logDir);
    await Promise.all(files.map(async (file) => {
      const match = /^(?:apeironcode|opencode)-(\d{4}-\d{2}-\d{2})\.jsonl$/u.exec(file);
      if (!match?.[1] || new Date(`${match[1]}T00:00:00Z`).getTime() >= cutoff) {
        return;
      }
      await fs.rm(path.join(this.logDir, file), {force: true});
    }));
  }
}

export const createLogger = (options?: StructuredLoggerOptions): Logger => new StructuredLogger(options);
export const structuredLogger = createLogger({module: 'core'});
