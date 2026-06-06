import path from 'node:path';

import {ensureDirectory, writeTextFile} from '../../utils/fs.js';
import type {AgentEvent} from './events.js';

interface TranscriptDocument {
  events: AgentEvent[];
  formatVersion: 1;
  sessionId: string;
}

export class TranscriptRecorder {
  private readonly events: AgentEvent[] = [];

  constructor(
    private readonly sessionId: string,
    private readonly transcriptPath: string,
  ) {}

  get path(): string {
    return this.transcriptPath;
  }

  record(event: AgentEvent): void {
    this.events.push(event);
  }

  async save(): Promise<void> {
    const document: TranscriptDocument = {
      events: [...this.events],
      formatVersion: 1,
      sessionId: this.sessionId,
    };

    await ensureDirectory(path.dirname(this.transcriptPath));
    await writeTextFile(this.transcriptPath, `${JSON.stringify(document, null, 2)}\n`);
  }
}