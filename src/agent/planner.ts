import {AppError} from '../utils/errors.js';
import type {ToolDirective} from './types.js';

// Legacy XML-style tool-call envelope. The production tool-calling path is
// native ToolSchema/ToolRegistry; this pattern only exists to recognise
// pre-rebrand legacy emissions (`<opencode_tool_call>...`) and the canonical
// generic `<tool_call>...` form.
const TOOL_CALL_BLOCK_PATTERN = /<(?:apeironcode_tool_call|opencode_tool_call|tool_call)>\s*([\s\S]*?)\s*<\/(?:apeironcode_tool_call|opencode_tool_call|tool_call)>/gu;

export interface ToolDirectiveAnalysis {
  directives: ToolDirective[];
  malformed: boolean;
}

const normalizeDirective = (value: unknown): ToolDirective | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<ToolDirective> & {name?: string; toolCalls?: unknown[]};
  const toolName = typeof parsed.toolName === 'string' ? parsed.toolName : parsed.name;
  if (typeof toolName !== 'string' || typeof parsed.input !== 'object' || !parsed.input) {
    return null;
  }

  return {
    explanation: parsed.explanation,
    input: parsed.input,
    toolName,
  };
};

const normalizeDirectives = (value: unknown): ToolDirective[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeDirective(entry))
      .filter((entry): entry is ToolDirective => entry !== null);
  }

  if (value && typeof value === 'object' && Array.isArray((value as {toolCalls?: unknown[]}).toolCalls)) {
    return normalizeDirectives((value as {toolCalls: unknown[]}).toolCalls);
  }

  const directive = normalizeDirective(value);
  return directive ? [directive] : [];
};

const parseStructuredCandidate = (candidate: string): ToolDirectiveAnalysis => {
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return {
      directives: [],
      malformed: false,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const directives = normalizeDirectives(parsed);
    return {
      directives,
      malformed: directives.length === 0,
    };
  } catch {
    return {
      directives: [],
      malformed: true,
    };
  }
};

const looksLikeToolDirective = (raw: string): boolean => {
  const trimmed = raw.trim();
  return trimmed.startsWith('{')
    || trimmed.startsWith('[')
    || trimmed.startsWith('```json')
    || trimmed.includes('<tool_call>')
    || trimmed.includes('<apeironcode_tool_call>')
    || trimmed.includes('<opencode_tool_call>');
};

export const analyzeToolDirectives = (raw: string): ToolDirectiveAnalysis => {
  const trimmed = raw.trim();
  const taggedCandidates = Array.from(trimmed.matchAll(TOOL_CALL_BLOCK_PATTERN), (match) => match[1]?.trim() ?? '');

  if (taggedCandidates.length > 0) {
    const analyses = taggedCandidates.map((candidate) => parseStructuredCandidate(candidate));
    const directives = analyses.flatMap((analysis) => analysis.directives);
    return {
      directives,
      malformed: analyses.some((analysis) => analysis.malformed) || directives.length === 0,
    };
  }

  const fencedJsonMatch = trimmed.match(/^```json\s*([\s\S]*?)```$/u);
  const structured = parseStructuredCandidate(fencedJsonMatch?.[1]?.trim() ?? trimmed);
  if (structured.directives.length > 0 || structured.malformed) {
    return structured;
  }

  return {
    directives: [],
    malformed: looksLikeToolDirective(trimmed),
  };
};

export const extractToolDirectives = (raw: string): ToolDirective[] => {
  return analyzeToolDirectives(raw).directives;
};

export const extractToolDirective = (raw: string): ToolDirective | null => {
  return extractToolDirectives(raw)[0] ?? null;
};

export const assertIterationBudget = (iterations: number, maxIterations: number): void => {
  if (iterations >= maxIterations) {
    throw new AppError(
      `Agent stopped after ${maxIterations} tool iterations.`,
      'AGENT_ITERATION_LIMIT',
    );
  }
};