import crypto from 'node:crypto';

import {createLogger, redactLogValue} from './structuredLogger.js';

export interface TraceSpan {
  attributes: Record<string, unknown>;
  durationMs?: number;
  endMs?: number;
  error?: string;
  id: string;
  name: string;
  parentId?: string;
  startMs: number;
}

export interface TraceSpanHandle {
  end(attributes?: Record<string, unknown>): TraceSpan;
  fail(error: unknown): TraceSpan;
  span: TraceSpan;
}

const recentSpans: TraceSpan[] = [];
const logger = createLogger({module: 'trace'});
let activeSpanId: string | undefined;

const remember = (span: TraceSpan): void => {
  recentSpans.push(span);
  recentSpans.splice(0, Math.max(0, recentSpans.length - 200));
  logger.debug('trace completed', {durationMs: span.durationMs, name: span.name});
};

export const startSpan = (name: string, attributes: Record<string, unknown> = {}): TraceSpanHandle => {
  const parentId = activeSpanId;
  const span: TraceSpan = {
    attributes: redactLogValue(attributes) as Record<string, unknown>,
    id: crypto.randomUUID(),
    name,
    parentId,
    startMs: Date.now(),
  };
  activeSpanId = span.id;
  return {
    end(extra: Record<string, unknown> = {}) {
      span.endMs = Date.now();
      span.durationMs = span.endMs - span.startMs;
      span.attributes = redactLogValue({...span.attributes, ...extra}) as Record<string, unknown>;
      activeSpanId = parentId;
      remember(span);
      return span;
    },
    fail(error: unknown) {
      span.error = redactLogValue(error instanceof Error ? error.message : String(error)) as string;
      return this.end();
    },
    span,
  };
};

export const trace = async <T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, unknown> = {},
): Promise<T> => {
  const span = startSpan(name, attributes);
  try {
    const result = await fn();
    span.end();
    return result;
  } catch (error) {
    span.fail(error);
    throw error;
  }
};

export const getRecentSpans = (limit = 20): TraceSpan[] => recentSpans.slice(-limit);
export const clearSpans = (): void => { recentSpans.length = 0; activeSpanId = undefined; };

export const formatTraceSummary = (spans: TraceSpan[]): string => {
  if (spans.length === 0) {
    return 'No recent trace spans recorded in this process.';
  }
  return spans.map((span) => {
    const status = span.error ? 'FAIL' : 'OK';
    return `${status} ${span.name} ${span.durationMs ?? 0}ms${span.error ? ` - ${span.error}` : ''}`;
  }).join('\n');
};
