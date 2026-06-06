import {LspManager} from './manager.js';
import type {LspCacheSnapshot, LspDiagnostic, LspSessionSnapshot, LspSymbol} from './types.js';

export interface LspContextSummary {
  enabled: boolean;
  mode: 'lsp' | 'fallback' | 'disabled';
  languages: string[];
  availableServers: string[];
  missingServers: string[];
  sessions: LspSessionSnapshot[];
  cache: LspCacheSnapshot;
  diagnostics: LspDiagnostic[];
  symbols: LspSymbol[];
  notes: string[];
}

export class LspContextBuilder {
  private manager: LspManager;

  constructor(manager?: LspManager) {
    this.manager = manager ?? new LspManager();
  }

  async buildSummary(projectLanguages: string[]): Promise<LspContextSummary> {
    const isEnabled = this.manager.isEnabled();
    const isFallbackEnabled = this.manager.isFallbackEnabled();

    if (!isEnabled) {
      return {
        enabled: false,
        mode: 'disabled',
        languages: projectLanguages,
        availableServers: [],
        missingServers: [],
        sessions: [],
        cache: {
          byMethod: {},
          entries: 0,
          hits: 0,
          invalidations: 0,
          misses: 0,
          writes: 0,
        },
        diagnostics: [],
        symbols: [],
        notes: ['LSP is disabled'],
      };
    }

    const allStatuses = await this.manager.getAllLanguageStatus();
    const projectStatuses = allStatuses.filter((s) => projectLanguages.includes(s.language));

    const availableServers: string[] = [];
    const missingServers: string[] = [];
    const notes: string[] = [];

    for (const status of projectStatuses) {
      if (status.status === 'available' && status.serverName) {
        availableServers.push(status.serverName);
      } else if (status.status === 'missing' && status.serverName) {
        missingServers.push(status.serverName);
        if (status.installHint) {
          notes.push(`${status.language}: ${status.installHint}`);
        }
      }
    }

    const mode = availableServers.length > 0
      ? 'lsp'
      : isFallbackEnabled ? 'fallback'
      : 'disabled';
    const sessions = this.manager.listSessions();
    const cache = this.manager.getCacheSnapshot();

    if (mode === 'fallback' && missingServers.length > 0) {
      notes.push(`Using fallback symbol index for ${projectLanguages.join(', ')} (LSP unavailable)`);
    }

    if (this.manager.isLongLivedSessionsEnabled()) {
      if (sessions.length > 0) {
        notes.push(`Active LSP sessions: ${sessions.length}`);
      }

      if (cache.entries > 0 || cache.hits > 0 || cache.writes > 0 || cache.invalidations > 0) {
        notes.push(`LSP cache: ${cache.entries} entries, ${cache.hits} hits, ${cache.misses} misses`);
      }
    }

    return {
      enabled: isEnabled,
      mode,
      languages: projectLanguages,
      availableServers,
      missingServers,
      sessions,
      cache,
      diagnostics: [],
      symbols: [],
      notes,
    };
  }

  formatContextForPrompt(summary: LspContextSummary): string {
    if (summary.mode === 'disabled') {
      return '';
    }

    const lines: string[] = [];

    if (summary.mode === 'lsp') {
      lines.push('LSP code intelligence is available:');
      for (const server of summary.availableServers) {
        lines.push(`- ${server}`);
      }
    } else {
      lines.push('LSP is unavailable. Using fallback code intelligence:');
      lines.push('- Regex-based symbol extraction');
      lines.push('- Grep-based definition search');
      lines.push('- Repository map and imports analysis');
    }

    if (summary.sessions.length > 0) {
      lines.push(`- Active sessions: ${summary.sessions.map((session) => `${session.language}:${session.status}`).join(', ')}`);
    }

    if (summary.cache.entries > 0 || summary.cache.hits > 0 || summary.cache.writes > 0) {
      lines.push(`- Cache: ${summary.cache.entries} entries, ${summary.cache.hits} hits, ${summary.cache.misses} misses`);
    }

    if (summary.notes.length > 0) {
      lines.push('');
      for (const note of summary.notes) {
        lines.push(`Note: ${note}`);
      }
    }

    return lines.join('\n');
  }

  formatContextForSummary(summary: LspContextSummary): string {
    if (summary.mode === 'disabled') {
      return 'Code Intelligence: disabled';
    }

    const parts: string[] = [];

    if (summary.mode === 'lsp') {
      parts.push('LSP');
      if (summary.availableServers.length > 0) {
        parts.push(`(${summary.availableServers.join(', ')})`);
      }
    } else {
      parts.push('Fallback code intelligence');
      if (summary.missingServers.length > 0) {
        parts.push(`(${summary.languages.join(', ')} LSP unavailable)`);
      }
    }

    if (this.manager.isLongLivedSessionsEnabled()) {
      parts.push(`sessions:${summary.sessions.length}`);
      parts.push(`cache:${summary.cache.entries}`);
    }

    return `Code Intelligence: ${parts.join(' ')}`;
  }
}
