import {redactSecretLikeContent} from '../memory/safety.js';

export interface ContextViewItem {
  path: string;
  included: boolean;
  reason: string;
  tokenEstimate: number;
}

export interface MemoryViewItem {
  id: string;
  kind: string;
  summary: string; // NO raw content
}

export type ContextMode = 'delta' | 'full' | 'compressed' | 'unknown';

export interface RuntimeBrainContextSummary {
  intent: string;
  confidence: number; // 0–100
  useBrain: boolean;
  selectedFiles: string[];
  estimatedTokens: number;
  syncStatus: 'synced' | 'preview-pending' | 'off' | 'unknown';
}

export interface ContextViewReport {
  selectedFiles: ContextViewItem[];
  omittedFiles: ContextViewItem[];
  memoryItems: MemoryViewItem[];
  tokenBudget?: number;
  tokensUsed?: number;
  contextMode: ContextMode;
  toolSchemasExposed?: number;
  provider?: string;
  model?: string;
  warnings: string[];
  projectBrain?: {
    present: boolean;
    status: string;
    safeLoadStatus: string;
  };
  runtimeBrain?: RuntimeBrainContextSummary;
}

const MEMORY_SUMMARY_LIMIT = 80;

export interface BuildContextViewOptions {
  selectedFiles?: Array<{path: string; tokens?: number; reason?: string}>;
  omittedFiles?: Array<{path: string; reason?: string}>;
  memoryItems?: Array<{id: string; kind: string; content: string}>;
  tokenBudget?: number;
  tokensUsed?: number;
  contextMode?: ContextMode;
  toolSchemasExposed?: number;
  provider?: string;
  model?: string;
  projectBrain?: {
    present: boolean;
    status: string;
    safeLoadStatus: string;
  };
  runtimeBrain?: RuntimeBrainContextSummary;
}

export const buildContextViewReport = (options: BuildContextViewOptions): ContextViewReport => {
  return {
    selectedFiles: (options.selectedFiles ?? []).map((f) => ({
      path: f.path,
      included: true,
      reason: f.reason ?? 'selected',
      tokenEstimate: f.tokens ?? 0,
    })),
    omittedFiles: (options.omittedFiles ?? []).map((f) => ({
      path: f.path,
      included: false,
      reason: f.reason ?? 'omitted',
      tokenEstimate: 0,
    })),
    memoryItems: (options.memoryItems ?? []).map((m) => {
      const safe = redactSecretLikeContent(m.content);
      const truncated = safe.slice(0, MEMORY_SUMMARY_LIMIT) + (safe.length > MEMORY_SUMMARY_LIMIT ? '…' : '');
      return {id: m.id, kind: m.kind, summary: truncated};
    }),
    tokenBudget: options.tokenBudget,
    tokensUsed: options.tokensUsed,
    contextMode: options.contextMode ?? 'unknown',
    toolSchemasExposed: options.toolSchemasExposed,
    provider: options.provider,
    model: options.model,
    projectBrain: options.projectBrain,
    runtimeBrain: options.runtimeBrain,
    warnings: [],
  };
};

export const formatContextViewReport = (report: ContextViewReport): string => {
  const lines: string[] = ['=== ApeironCode Context View ==='];
  lines.push(`Context mode: ${report.contextMode}`);
  if (report.provider) {
    lines.push(`Provider/Model: ${report.provider}${report.model ? `/${report.model}` : ''}`);
  }
  if (report.tokenBudget !== undefined) {
    lines.push(`Tokens: ${report.tokensUsed ?? 0} / ${report.tokenBudget}`);
  }
  lines.push(`Files selected: ${report.selectedFiles.length}`);
  for (const f of report.selectedFiles.slice(0, 10)) {
    lines.push(`  + ${f.path} (~${f.tokenEstimate} tokens, ${f.reason})`);
  }
  if (report.selectedFiles.length > 10) {
    lines.push(`  ... and ${report.selectedFiles.length - 10} more`);
  }
  if (report.omittedFiles.length) {
    lines.push(`Files omitted: ${report.omittedFiles.length}`);
    for (const f of report.omittedFiles.slice(0, 5)) {
      lines.push(`  - ${f.path} (${f.reason})`);
    }
  }
  if (report.memoryItems.length) {
    lines.push(`Memory items: ${report.memoryItems.length}`);
    for (const m of report.memoryItems.slice(0, 5)) {
      lines.push(`  [${m.kind}] ${m.summary}`);
    }
  }
  if (report.toolSchemasExposed !== undefined) {
    lines.push(`Tool schemas exposed: ${report.toolSchemasExposed}`);
  }
  if (report.projectBrain) {
    lines.push(`Project Brain: ${report.projectBrain.present ? report.projectBrain.status : 'missing'} (${report.projectBrain.safeLoadStatus})`);
  }
  if (report.runtimeBrain) {
    const rb = report.runtimeBrain;
    lines.push(`Runtime Brain: intent=${rb.intent} (${rb.confidence}%) useBrain=${rb.useBrain} tokens=~${rb.estimatedTokens} sync=${rb.syncStatus}`);
    if (rb.selectedFiles.length > 0) {
      lines.push(`  Brain files: ${rb.selectedFiles.slice(0, 5).join(', ')}`);
    }
  }
  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push(`  ! ${w}`);
  }
  return lines.join('\n');
};
