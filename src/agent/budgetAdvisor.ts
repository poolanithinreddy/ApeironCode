import type {AgentMode} from './types.js';

export interface BudgetAdvice {
  recommended: number;
  reason: string;
  signals: string[];
}

const BASE_BY_MODE: Partial<Record<AgentMode, number>> = {
  debug: 20,
  explain: 10,
  feature: 30,
  review: 15,
  'test-fix': 25,
};

const FILE_REFERENCE_PATTERN = /\b(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+\b|\b[\w.-]+\.(?:ts|tsx|js|jsx|json|md|yml|yaml|toml|rs|go|py|java|kt|swift|css|scss|html)\b/gu;

const clampBudget = (value: number, configMaxIterations?: number): number => {
  const cap = Math.min(Math.max(configMaxIterations ?? 40, 5), 200);
  return Math.max(5, Math.min(value, cap));
};

export const analyzeBudget = (
  prompt: string,
  mode: AgentMode,
  configMaxIterations?: number,
): BudgetAdvice => {
  const normalized = prompt.toLowerCase();
  const signals: string[] = [];
  let recommended = BASE_BY_MODE[mode] ?? 20;
  signals.push(`mode:${mode}:base=${recommended}`);

  const fileReferences = new Set(prompt.match(FILE_REFERENCE_PATTERN) ?? []);
  if (fileReferences.size > 0) {
    const increase = fileReferences.size * 3;
    recommended += increase;
    signals.push(`file-references:+${increase}`);
  }

  if (/\b(?:tests?\s+fail(?:ing|ed)?|stack trace|bug|error|exception|failure)\b/u.test(normalized)) {
    recommended += 5;
    signals.push('bug-or-error:+5');
  }

  if (/\b(?:multi-file|multiple files|across files|several files|many files)\b/u.test(normalized)) {
    recommended += 10;
    signals.push('multi-file:+10');
  }

  if (/\b(?:refactor entire|migrate all|rewrite|large change|architecture change)\b/u.test(normalized)) {
    recommended += 20;
    signals.push('large-change:+20');
  }

  if (mode === 'explain' && /\b(?:simple|brief|quick|summari[sz]e|explain only|no edits?)\b/u.test(normalized)) {
    recommended -= 5;
    signals.push('simple-explain:-5');
  }

  const capped = clampBudget(recommended, configMaxIterations);
  if (capped !== recommended) {
    signals.push(`cap:${capped}`);
  }

  return {
    reason: `Recommended ${capped} iterations from ${signals.join(', ')}.`,
    recommended: capped,
    signals,
  };
};
