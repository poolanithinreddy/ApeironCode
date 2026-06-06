import type {PermissionRule} from './permissionParser.js';
import type {RiskLevel} from './policy.js';

export interface AuditLogEntry {
  timestamp: string;
  sessionId?: string;
  requestId: string;
  actionType: string;
  resource: string;
  toolIdentity?: string;
  decision: 'allow' | 'deny' | 'approved' | 'rejected';
  matchedRule?: PermissionRule | null;
  source: 'global' | 'project' | 'session' | 'default';
  riskLevel: RiskLevel;
  userApproved?: boolean;
  executionStatus?: 'success' | 'error';
  errorMessage?: string;
  durationMs?: number;
  inputSummary?: string;
  mcpServerName?: string;
  mcpToolName?: string;
}

export class AuditLog {
  private entries: AuditLogEntry[] = [];

  record(entry: AuditLogEntry): void {
    this.entries.push(entry);
  }

  getEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  getEntriesForSession(sessionId: string): AuditLogEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  getEntriesForTool(toolIdentity: string): AuditLogEntry[] {
    return this.entries.filter((e) => e.toolIdentity === toolIdentity);
  }

  formatEntry(entry: AuditLogEntry): string {
    const parts = [
      entry.timestamp,
      entry.sessionId || '-',
      entry.requestId,
      entry.actionType,
      entry.resource,
      entry.toolIdentity || '-',
      entry.decision,
      entry.riskLevel,
      entry.userApproved !== undefined ? (entry.userApproved ? 'approved' : 'rejected') : '-',
      entry.executionStatus || '-',
      entry.mcpServerName || '-',
      entry.mcpToolName || '-',
      entry.inputSummary || '-',
      entry.errorMessage ? `"${entry.errorMessage}"` : '-',
      entry.durationMs !== undefined ? `${entry.durationMs}ms` : '-',
    ];

    return parts.join(' | ');
  }

  formatEntries(entries: AuditLogEntry[] = this.entries): string[] {
    return entries.map((e) => this.formatEntry(e));
  }

  toJSON(): AuditLogEntry[] {
    return [...this.entries];
  }
}

export const globalAuditLog = new AuditLog();
