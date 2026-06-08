import crypto from 'node:crypto';

import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {compressToolOutput} from '../tools/outputCompressor.js';
import {
  formatToolResultForModel,
  normalizeToolResult,
  type NormalizedToolResult,
} from '../tools/resultContract.js';
import type {ToolResult} from '../tools/types.js';
import type {ChatMessage} from './types.js';

export interface BuildToolResultOptions {
  compressionEnabled: boolean;
  maxTokens: number;
}

export interface BuiltToolResult {
  message: ChatMessage;
  normalized: NormalizedToolResult;
  compressedRatio?: number;
  originalTokenEstimate?: number;
  compressedTokenEstimate?: number;
}

/**
 * Build the chat message that represents a tool result for the model.
 * Uses resultContract.normalizeToolResult to redact secrets and bound output,
 * applies tokenEfficiency-based compression, then preserves the historical
 * `Tool result for <name>:` prefix that downstream tests/providers rely on.
 */
export const buildToolResultMessage = (
  toolName: string,
  rawResult: ToolResult,
  options: BuildToolResultOptions,
): BuiltToolResult => {
  const normalized = normalizeToolResult(toolName, rawResult);
  const formatted = formatToolResultForModel(normalized);

  let bodyText = formatted;
  let compressedRatio: number | undefined;
  let originalTokenEstimate: number | undefined;
  let compressedTokenEstimate: number | undefined;

  if (options.compressionEnabled) {
    const compressed = compressToolOutput(toolName, formatted, {
      maxTokens: options.maxTokens,
      preserveErrors: true,
      preserveFailingTests: true,
      preserveStackTraces: true,
    });
    if (compressed.compressionRatio < 1) {
      bodyText = compressed.content;
      compressedRatio = compressed.compressionRatio;
      originalTokenEstimate = compressed.originalTokenEstimate;
      compressedTokenEstimate = compressed.compressedTokenEstimate;
    }
  }

  const message: ChatMessage = {
    content: `Tool result for ${toolName}:\n\n${bodyText}`,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'tool',
  };

  return {message, normalized, compressedRatio, originalTokenEstimate, compressedTokenEstimate};
};

export const emitNormalizedToolResultEvent = (
  eventBus: EventBus | undefined,
  normalized: NormalizedToolResult,
): void => {
  if (!eventBus) return;
  eventBus.emit({
    severity: normalized.severity,
    timestamp: createEventTimestamp(),
    toolName: normalized.toolName,
    truncated: normalized.truncated,
    type: 'tool_result.normalized',
  });
};

export interface ParallelGroupNotifier {
  start: (toolNames: string[]) => void;
  complete: (toolNames: string[], succeeded: number, failed: number) => void;
}

export const createParallelGroupNotifier = (
  eventBus: EventBus | undefined,
): ParallelGroupNotifier => ({
  start: (toolNames) => {
    if (!eventBus || toolNames.length < 2) return;
    eventBus.emit({
      timestamp: createEventTimestamp(),
      toolNames,
      type: 'tool_call.parallel_group_started',
    });
  },
  complete: (toolNames, succeeded, failed) => {
    if (!eventBus || toolNames.length < 2) return;
    eventBus.emit({
      failed,
      succeeded,
      timestamp: createEventTimestamp(),
      toolNames,
      type: 'tool_call.parallel_group_completed',
    });
  },
});
