/**
 * Feature acceptance contract.
 *
 * "Files written" and "build passed" are NOT success. ApeironCode must verify
 * the produced app actually contains the features the user asked for. This
 * module extracts requirements from the prompt and evaluates them against the
 * deterministic workspace snapshot (file contents) — no provider call.
 */

export type AppKind = 'todo' | 'calculator' | 'generic';

export interface FeatureRequirement {
  id: string;
  label: string;
  /**
   * Regexes evaluated against the combined snapshot. By default the
   * requirement is met if ANY pattern matches; set `minMatches` to require
   * multiple distinct signals (Phase 17G — premium calculator UI heuristics).
   */
  patterns: RegExp[];
  optional?: boolean;
  minMatches?: number;
}

export interface FeatureAcceptanceReport {
  appKind: AppKind;
  requirements: FeatureRequirement[];
  met: string[];
  missing: string[];
  ok: boolean;
}

const has = (text: string, re: RegExp): boolean => re.test(text);

const TODO_BASE: FeatureRequirement[] = [
  {id: 'add-input', label: 'task input field', patterns: [/<input\b/i, /type=["']text["']/i, /useState\(\s*["']{2}\s*\)/i]},
  {id: 'add-button', label: 'add/submit button', patterns: [/<button\b/i, /onSubmit=/i, /addTodo|addTask|handleAdd/i]},
  {id: 'list-render', label: 'todo list rendering', patterns: [/\.map\(/i, /<ul\b|<ol\b|<li\b/i]},
  {id: 'complete-toggle', label: 'complete/active toggle', patterns: [/complete|done|checked|toggle/i, /type=["']checkbox["']/i]},
  {id: 'delete', label: 'delete task', patterns: [/delete|remove|removeTodo|handleDelete/i]},
];

const CALC_BASE: FeatureRequirement[] = [
  {id: 'digits', label: 'numeric buttons', patterns: [/[>"']\s*[0-9]\s*[<"']/, /data-(?:digit|num)/i, /['"][0-9]['"]/]},
  {id: 'operators', label: 'operators (+ - * /)', patterns: [/[+\-*/]/, /operator/i]},
  {id: 'equals', label: 'equals', patterns: [/=|equals|calculate|evaluate/i]},
  {id: 'clear', label: 'clear button', patterns: [/clear|\bAC\b|reset/i]},
  {id: 'display', label: 'result display', patterns: [/display|result|screen|output/i]},
];

const wantsLocalStorage = (p: string): boolean => /local\s*storage|persist|save (?:them|it|tasks)|keep .*after refresh/i.test(p);
const wantsPremiumUi = (p: string): boolean => /premium|beautiful|modern|polished|super (?:ui|with)|great ui|iphone|sleek|gorgeous|nice ui|ux/i.test(p);
const wantsFilters = (p: string): boolean => /filter|all\/active|active\/completed|tabs?/i.test(p);

export const detectAppKind = (prompt: string): AppKind => {
  const p = prompt.toLowerCase();
  if (/\btodo|to-do|to do|task (?:app|manager|list)\b/.test(p)) return 'todo';
  if (/\bcalculator|calc\b/.test(p)) return 'calculator';
  return 'generic';
};

/** Extract concrete, checkable feature requirements from the user prompt. */
export const extractFeatureRequirements = (
  prompt: string,
  context: {appKind?: AppKind} = {},
): {appKind: AppKind; requirements: FeatureRequirement[]} => {
  const appKind = context.appKind ?? detectAppKind(prompt);
  const requirements: FeatureRequirement[] = [];

  if (appKind === 'todo') requirements.push(...TODO_BASE);
  else if (appKind === 'calculator') requirements.push(...CALC_BASE);

  if (wantsLocalStorage(prompt) || appKind === 'todo') {
    requirements.push({
      id: 'localstorage',
      label: 'localStorage persistence',
      patterns: [/localStorage/i],
      optional: !wantsLocalStorage(prompt) && appKind !== 'todo',
    });
  }
  if (wantsFilters(prompt)) {
    requirements.push({id: 'filters', label: 'all/active/completed filter', patterns: [/filter|active|completed/i]});
  }
  if (wantsPremiumUi(prompt)) {
    // Phase 17G: for calculator apps where the user calls out concrete layout
    // problems ("fix the layout", "no overflow", "iPhone calculator",
    // "responsive", "polished"), require multiple visual signals — a single
    // `border-radius: 4px` is not enough to claim premium UI.
    const stricterPremium =
      appKind === 'calculator' &&
      /\b(layout|overflow|iphone|polished|responsive|premium|grid|fix\s+(?:the\s+)?layout)\b/i.test(prompt);
    if (stricterPremium) {
      requirements.push({
        id: 'premium-ui',
        label: 'premium calculator UI (layout + dark + rounded + responsive)',
        patterns: [
          // bounded container width (mobile-ish), not 1000px
          /max-width\s*:\s*[1-4]\d{2}px/i,
          // dark/black background somewhere (likely the body or container)
          /background(?:-color)?\s*:\s*(?:#0{3,6}|#1[0-9a-f]{1,5}|#2[0-9a-f]{1,5}|black|rgb\(\s*0\s*,\s*0\s*,\s*0)/i,
          // rounded buttons (≥ 8px, or 50% for circles)
          /border-radius\s*:\s*(?:[1-9]\d+px|50%|9999px|999px)/i,
          // grid or flex layout
          /display\s*:\s*(?:grid|flex)/i,
          // overflow-safe box-sizing
          /box-sizing\s*:\s*border-box/i,
          // some responsive signal
          /(?:@media|aspect-ratio|width\s*:\s*100%|min-height\s*:\s*100vh)/i,
        ],
        // At least three of the six premium signals must be present.
        minMatches: 3,
      });
    } else {
      requirements.push({
        id: 'premium-ui',
        label: 'premium UI/UX styling',
        patterns: [/box-shadow|border-radius|gradient|transition|@media|flex|grid|font-family|:hover/i],
      });
    }
  }
  if (appKind === 'generic') {
    requirements.push({id: 'has-markup', label: 'rendered UI markup', patterns: [/<[a-z]/i, /return\s*\(/i]});
  }
  return {appKind, requirements};
};

/** Evaluate requirements against the concatenated file-content snapshot. */
export const evaluateImplementedFeatures = (
  requirements: FeatureRequirement[],
  workspaceSnapshot: string,
): FeatureAcceptanceReport => {
  const text = workspaceSnapshot || '';
  const met: string[] = [];
  const missing: string[] = [];
  for (const req of requirements) {
    const required = req.minMatches ?? 1;
    let matched = 0;
    for (const re of req.patterns) {
      if (has(text, re)) matched += 1;
      if (matched >= required) break;
    }
    const satisfied = matched >= required;
    if (satisfied) met.push(req.id);
    else if (!req.optional) missing.push(req.id);
  }
  return {
    appKind: 'generic',
    requirements,
    met,
    missing,
    ok: missing.length === 0,
  };
};

export const formatFeatureAcceptanceReport = (report: FeatureAcceptanceReport): string => {
  const label = (id: string): string =>
    report.requirements.find((r) => r.id === id)?.label ?? id;
  const lines: string[] = [];
  if (report.met.length > 0) {
    lines.push(`Implemented features: ${report.met.map(label).join(', ')}`);
  }
  if (report.missing.length > 0) {
    lines.push(`Missing features: ${report.missing.map(label).join(', ')}`);
  }
  lines.push(`Feature acceptance: ${report.ok ? 'passed' : 'incomplete'}`);
  return lines.join('\n');
};

/** Build a precise correction directive for the provider when acceptance fails. */
export const buildAcceptanceCorrectionDirective = (
  report: FeatureAcceptanceReport,
): string => {
  const label = (id: string): string =>
    report.requirements.find((r) => r.id === id)?.label ?? id;
  return [
    'The app is missing required features. Implement ALL of these in the file plan',
    '(full file contents, working code, not placeholders):',
    ...report.missing.map((id) => `- ${label(id)}`),
  ].join('\n');
};
