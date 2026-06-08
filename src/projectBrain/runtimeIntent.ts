/**
 * Phase 16H — Runtime brain intent classifier.
 * Deterministic, no provider calls, max 1ms per call.
 */

import {redactProjectBrainText} from './safety.js';

export type RuntimeBrainIntent =
  | 'none'
  | 'continue'
  | 'large-app-build'
  | 'debug-fix'
  | 'test-fix'
  | 'review'
  | 'architecture'
  | 'frontend'
  | 'backend'
  | 'docs'
  | 'release'
  | 'general-coding';

export interface RuntimeBrainIntentResult {
  intent: RuntimeBrainIntent;
  confidence: number; // 0–1
  reasons: string[];
  useBrain: boolean;
  brainFileHints: string[];
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const CONTINUE_RE = /\b(continue|keep going|next|resume|carry on|what.s next|what next|next step)\b/iu;
// Requires 80+ chars between build-verb and app-noun to avoid false positives
const LARGE_APP_RE = /\b(build|create|develop|ship)\b.{80,}\b(app|saas|platform|product|dashboard|site)\b/isu;
const DEBUG_RE = /\b(fix|debug|trace|diagnose|exception|traceback|crash|broken|error|stack trace)\b/iu;
const TEST_RE = /\b(test|spec|failing test|coverage|vitest|jest|playwright|e2e|tdd|ci fail)\b/iu;
const REVIEW_RE = /\b(review|security audit|code review|audit|lint|check for)\b/iu;
const ARCH_RE = /\b(architect|architecture|design|structure|diagram|adr|decision record|system design)\b/iu;
const FRONTEND_RE = /\b(frontend|ui|ux|react|vue|svelte|css|tailwind|component|page|layout|design|button|form)\b/iu;
const BACKEND_RE = /\b(backend|api|server|database|db|postgres|prisma|endpoint|route|auth|jwt|schema)\b/iu;
const DOCS_RE = /\b(document|readme|changelog|docs|write docs|update docs|explain)\b/iu;
const RELEASE_RE = /\b(release|deploy|publish|ship|version|tag|changelog|cut release)\b/iu;

// ─── Individual classifiers ──────────────────────────────────────────────────

export const isContinuationPrompt = (prompt: string): boolean => CONTINUE_RE.test(prompt.trim());

export const isLargeAppBuildPrompt = (prompt: string): boolean =>
  LARGE_APP_RE.test(prompt) && prompt.trim().length > 120;

export const isDebugFixPrompt = (prompt: string): boolean =>
  DEBUG_RE.test(prompt) && !TEST_RE.test(prompt);

export const isTestFixPrompt = (prompt: string): boolean =>
  (DEBUG_RE.test(prompt) && TEST_RE.test(prompt)) || TEST_RE.test(prompt);

export const isReviewPrompt = (prompt: string): boolean => REVIEW_RE.test(prompt);

export const isArchitecturePrompt = (prompt: string): boolean => ARCH_RE.test(prompt);

export const isUiFrontendPrompt = (prompt: string): boolean =>
  FRONTEND_RE.test(prompt) && !BACKEND_RE.test(prompt);

export const isBackendDataPrompt = (prompt: string): boolean =>
  BACKEND_RE.test(prompt) && !FRONTEND_RE.test(prompt);

export const isDocsPrompt = (prompt: string): boolean => DOCS_RE.test(prompt);

export const isReleasePrompt = (prompt: string): boolean => RELEASE_RE.test(prompt);

// ─── Main classifier ─────────────────────────────────────────────────────────

export interface ClassifyOptions {
  /** Treat prompts under this length as 'none' (no brain needed). Default: 8 */
  minPromptLength?: number;
}

export const classifyRuntimeBrainIntent = (
  prompt: string,
  options: ClassifyOptions = {},
): RuntimeBrainIntentResult => {
  const minLen = options.minPromptLength ?? 8;
  const trimmed = prompt.trim();

  if (trimmed.length < minLen) {
    return {intent: 'none', confidence: 1, reasons: ['prompt too short'], useBrain: false, brainFileHints: []};
  }

  if (isContinuationPrompt(trimmed)) {
    return {
      intent: 'continue', confidence: 0.95,
      reasons: ['continuation keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PLAN.md', '.apeironcode/TASKS.md', '.apeironcode/RUNS.md'],
    };
  }

  if (isLargeAppBuildPrompt(trimmed)) {
    return {
      intent: 'large-app-build', confidence: 0.9,
      reasons: ['large app build prompt detected (80+ chars between verb and noun)'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PROJECT.md', '.apeironcode/PLAN.md', '.apeironcode/TASKS.md'],
    };
  }

  if (isArchitecturePrompt(trimmed)) {
    return {
      intent: 'architecture', confidence: 0.8,
      reasons: ['architecture/design keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PROJECT.md', '.apeironcode/DECISIONS.md'],
    };
  }

  if (isTestFixPrompt(trimmed)) {
    return {
      intent: 'test-fix', confidence: 0.8,
      reasons: ['test/failing test keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/VERIFY.md', '.apeironcode/TASKS.md', '.apeironcode/RUNS.md'],
    };
  }

  if (isDebugFixPrompt(trimmed)) {
    return {
      intent: 'debug-fix', confidence: 0.75,
      reasons: ['debug/fix keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/VERIFY.md', '.apeironcode/RUNS.md'],
    };
  }

  if (isReviewPrompt(trimmed)) {
    return {
      intent: 'review', confidence: 0.75,
      reasons: ['review/audit keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PROJECT.md', '.apeironcode/VERIFY.md'],
    };
  }

  if (isUiFrontendPrompt(trimmed)) {
    return {
      intent: 'frontend', confidence: 0.7,
      reasons: ['frontend/UI keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PROJECT.md', '.apeironcode/TASKS.md'],
    };
  }

  if (isBackendDataPrompt(trimmed)) {
    return {
      intent: 'backend', confidence: 0.7,
      reasons: ['backend/API keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PROJECT.md', '.apeironcode/TASKS.md'],
    };
  }

  if (isDocsPrompt(trimmed)) {
    return {
      intent: 'docs', confidence: 0.65,
      reasons: ['documentation keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/PROJECT.md', '.apeironcode/REFERENCES.md'],
    };
  }

  if (isReleasePrompt(trimmed)) {
    return {
      intent: 'release', confidence: 0.65,
      reasons: ['release/deploy keyword detected'],
      useBrain: true,
      brainFileHints: ['.apeironcode/VERIFY.md', '.apeironcode/RUNS.md'],
    };
  }

  // Short/simple prompts: no brain needed
  if (trimmed.split(/\s+/u).length <= 6) {
    return {intent: 'none', confidence: 0.8, reasons: ['short simple prompt'], useBrain: false, brainFileHints: []};
  }

  return {
    intent: 'general-coding', confidence: 0.5,
    reasons: ['no strong intent signal — general coding task'],
    useBrain: false,
    brainFileHints: [],
  };
};

// ─── Formatter ───────────────────────────────────────────────────────────────

export const formatRuntimeBrainIntent = (result: RuntimeBrainIntentResult): string =>
  redactProjectBrainText([
    `Intent: ${result.intent}`,
    `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
    `Use Brain: ${result.useBrain ? 'yes' : 'no'}`,
    result.reasons.length > 0 ? `Reasons: ${result.reasons.join('; ')}` : '',
    result.brainFileHints.length > 0 ? `Brain files: ${result.brainFileHints.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
