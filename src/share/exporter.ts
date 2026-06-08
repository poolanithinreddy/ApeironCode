import path from 'node:path';
import {ensureDirectory, writeJsonFile, writeTextFile} from '../utils/fs.js';
import {getProjectSessionsDir} from '../utils/paths.js';
import {redactSecrets} from './redactor.js';
import {formatSessionMarkdown} from './formats/markdown.js';
import {formatSessionHtml} from './formats/html.js';
import type {SessionExport, ExportOptions} from './types.js';
import type {AgentSessionRecord} from '../multisession/types.js';

export class SessionExporter {
  constructor(private readonly cwd: string) {}

  private getShareDir(): string {
    return path.join(getProjectSessionsDir(this.cwd), 'shares');
  }

  async exportSession(
    session: AgentSessionRecord,
    options: ExportOptions = {},
  ): Promise<{filePath: string; fileUrl: string}> {
    const {format = 'json', redactSecrets: shouldRedact = true} = options;

    const sessionExport = this.buildExport(session);

    // Load event logs if available
    try {
      const {SessionLogStore} = await import('../multisession/background/logStore.js');
      const logStore = new SessionLogStore(this.cwd);
      const events = await logStore.readEvents(session.id);
      if (events && events.length > 0) {
        // Cap at last 100 events for large exports
        sessionExport.events = events.slice(Math.max(0, events.length - 100));
      }
    } catch {
      // Event logs are optional; continue if unavailable
    }

    if (shouldRedact) {
      this.redactExport(sessionExport);
    }

    const shareDir = this.getShareDir();
    await ensureDirectory(shareDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const shortId = session.id.slice(0, 8);
    const baseFileName = `session-${shortId}-${timestamp}`;

    let filePath: string;
    let content: string;

    switch (format) {
      case 'markdown':
        filePath = path.join(shareDir, `${baseFileName}.md`);
        content = formatSessionMarkdown(sessionExport);
        await writeTextFile(filePath, content);
        break;

      case 'html':
        filePath = path.join(shareDir, `${baseFileName}.html`);
        content = formatSessionHtml(sessionExport);
        await writeTextFile(filePath, content);
        break;

      case 'json':
      default:
        filePath = path.join(shareDir, `${baseFileName}.json`);
        await writeJsonFile(filePath, sessionExport);
        break;
    }

    return {
      filePath,
      fileUrl: `file://${path.resolve(filePath)}`,
    };
  }

  private buildExport(session: AgentSessionRecord): SessionExport {
    return {
      sessionId: session.id,
      projectPath: session.projectRoot,
      goal: session.goal,
      status: session.status,
      mode: session.mode,
      provider: session.provider,
      model: session.model,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationMs: session.startedAt && session.completedAt
        ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
        : undefined,
      summary: session.summary,
      filesLocked: session.filesLocked,
      filesChanged: session.filesChanged,
      commandsRun: session.commandsRun,
      testsRun: session.testsRun,
      linkedTaskId: session.linkedTaskId,
      exportedAt: new Date().toISOString(),
    };
  }

  private redactExport(sessionExport: SessionExport): void {
    if (sessionExport.summary) {
      sessionExport.summary = redactSecrets(sessionExport.summary);
    }

    sessionExport.commandsRun = sessionExport.commandsRun.map((cmd) => redactSecrets(cmd));

    // Redact event messages and command data
    if (sessionExport.events) {
      sessionExport.events = sessionExport.events.map((event) => ({
        ...event,
        message: event.message ? redactSecrets(event.message) : event.message,
        data: event.data && typeof event.data === 'object'
          ? this.redactEventData(event.data)
          : event.data,
      }));
    }
  }

  private redactEventData(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        redacted[key] = redactSecrets(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
}

/**
 * Export the latest session from the current project.
 */
export async function exportLatestSession(
  cwd: string,
  options: ExportOptions = {},
): Promise<{filePath: string; fileUrl: string} | null> {
  const {MultiAgentSessionManager} = await import('../multisession/manager.js');

  const manager = new MultiAgentSessionManager(cwd);
  const latest = await manager.getLatestSession();

  if (!latest) {
    return null;
  }

  const exporter = new SessionExporter(cwd);
  return exporter.exportSession(latest, options);
}
