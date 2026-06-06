/**
 * Visual / rendered-UI acceptance (Phase 18A, Task B).
 *
 * Feature acceptance (featureAcceptance.ts) only checks that the requested
 * *features* exist somewhere in the concatenated snapshot. It will happily say
 * "premium UI passed" when:
 *   - the edited CSS is not the one the opened HTML actually links,
 *   - a linked CSS/JS file is missing,
 *   - the calculator display can overflow its container,
 *   - an "iPhone-style" request has no orange operators / circular buttons.
 *
 * This module loads the *actual* entry HTML and *only* its linked assets, then
 * applies low-dependency DOM/CSS heuristics. No browser, no network — the
 * phase explicitly allows a DOM-parse + CSS-heuristic fallback so default
 * tests stay offline. `runVisualAcceptance` reads files; the heuristics in
 * `evaluateVisual` are pure and unit-tested directly.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {detectStaticAppEntry, formatOpenHint, type StaticAppEntry} from './staticAppEntry.js';

export interface VisualCheck {
  detail?: string;
  id: string;
  label: string;
  ok: boolean;
  severity: 'error' | 'warn';
}

export interface VisualAcceptanceReport {
  applicable: boolean;
  checks: VisualCheck[];
  entryHtmlPath: string | null;
  failed: string[];
  ok: boolean;
  openHint: string | null;
}

export interface VisualInputs {
  changedFiles?: readonly string[];
  css: string;
  entry: StaticAppEntry | null;
  html: string;
  js: string;
  prompt: string;
}

const wantsIphone = (p: string): boolean => /iphone|ios\b/iu.test(p);
const mentionsLayout = (p: string): boolean =>
  /layout|overflow|responsive|grid|centered|wide|too\s+wide|spacing|rounded|circular/iu.test(p);

const check = (id: string, label: string, ok: boolean, severity: VisualCheck['severity'], detail?: string): VisualCheck =>
  ({detail, id, label, ok, severity});

/**
 * Pure heuristic evaluation over the entry HTML and its linked CSS/JS.
 * `error` checks gate `ok`; `warn` checks are advisory only.
 */
export const evaluateVisual = (inputs: VisualInputs): VisualAcceptanceReport => {
  const {changedFiles = [], css, entry, html, prompt} = inputs;
  const checks: VisualCheck[] = [];
  // Heavy layout checks (bounded container, no-overflow, responsive, iPhone
  // grid) only fire when the user actually calls out layout/iPhone problems —
  // a bare "make it premium" or "make it beautiful" (e.g. just a dark
  // background change) must not be forced to add a 480px container or
  // box-sizing. This mirrors featureAcceptance's stricterPremium gating and
  // avoids false negatives on simple cosmetic edits.
  const premium = wantsIphone(prompt) || mentionsLayout(prompt);

  // Always-on structural checks (any static app).
  checks.push(check('entry-resolves', 'app entry HTML resolves', Boolean(entry && html), 'error',
    entry ? undefined : 'no index.html entry found'));

  const missing = entry?.missing ?? [];
  checks.push(check('linked-assets-exist', 'linked CSS/JS files exist', missing.length === 0, 'error',
    missing.length > 0 ? `missing: ${missing.join(', ')}` : undefined));

  // Edited-the-right-file: if CSS files were changed, at least one must be a
  // stylesheet actually linked by the entry. Editing root styles.css while the
  // opened entry links calculator/styles.css is the canonical dogfood bug.
  const changedCss = changedFiles.filter((f) => /\.css$/iu.test(f));
  const linkedStyles = entry?.styles ?? [];
  if (changedCss.length > 0 && linkedStyles.length > 0) {
    const editedLinked = changedCss.some((f) => linkedStyles.includes(f.replace(/^\.\//u, '')));
    checks.push(check('edited-css-linked', 'edited CSS is linked by the opened entry', editedLinked, 'error',
      editedLinked ? undefined : `changed ${changedCss.join(', ')} but entry links ${linkedStyles.join(', ')}`));
  }

  const styleText = css || '';
  checks.push(check('body-background', 'body/container background style present',
    /(?:body|:root|html|\.(?:app|container|calculator|wrapper|screen))[^{]*\{[^}]*background/iu.test(styleText) ||
    /background(?:-color)?\s*:/iu.test(styleText), 'error'));

  if (premium) {
    const bounded = /max-width\s*:\s*(?:[1-9]\d{0,2}|4[0-7]\d|480)px/iu.test(styleText) ||
      /width\s*:\s*min\(/iu.test(styleText) || /aspect-ratio\s*:/iu.test(styleText);
    checks.push(check('bounded-container', 'container is bounded (not full-width)', bounded, 'error',
      bounded ? undefined : 'no max-width<=480px / width:min() / aspect-ratio found'));

    const boxSizing = /box-sizing\s*:\s*border-box/iu.test(styleText);
    const overflowSafe = boxSizing || /overflow(?:-x)?\s*:\s*(?:hidden|auto)/iu.test(styleText) ||
      /(?:overflow-wrap|word-break)\s*:/iu.test(styleText);
    checks.push(check('no-overflow', 'display cannot obviously overflow', overflowSafe, 'error',
      overflowSafe ? undefined : 'no box-sizing:border-box / overflow / wrap rules to contain content'));

    const responsive = /@media|min-height\s*:\s*100vh|width\s*:\s*100%/iu.test(styleText);
    checks.push(check('responsive', 'layout has a responsive signal', responsive, 'warn'));
  }

  if (wantsIphone(prompt)) {
    const fourCol = /grid-template-columns\s*:\s*(?:repeat\(\s*4\b|(?:[^;]*\b(?:fr|px|%)){4})/iu.test(styleText);
    checks.push(check('grid-4col', 'iPhone 4-column button grid', fourCol, 'error'));

    const zeroSpan = /grid-column\s*:\s*(?:span\s*2|1\s*\/\s*3)/iu.test(styleText) ||
      /\.(?:zero|btn-0|key-0)[^{]*\{[^}]*grid-column/iu.test(styleText);
    checks.push(check('zero-span', 'the 0 button spans two columns', zeroSpan, 'warn'));

    const orange = /(?:#f[589a]\d?[0-9a-f]{0,3}\b|#ff9?500|orange|hsl\(\s*(?:2[0-9]|3[0-9])\b|rgb\(\s*2[45][0-9])/iu.test(styleText);
    checks.push(check('operator-orange', 'operator buttons use orange styling', orange, 'error'));

    const lightGray = /(?:#a5a5a5|#d4d4d2|#[cd][0-9a-f]{2}[0-9a-f]{3}\b|lightgray|light-?grey|#bbb\b|#ccc\b)/iu.test(styleText);
    checks.push(check('ac-light-gray', 'AC button uses light-gray styling', lightGray, 'warn'));

    const circular = /border-radius\s*:\s*(?:50%|9999px|999px|[5-9]\d px|[5-9]\dpx|1\d\dpx)/iu.test(styleText) ||
      /aspect-ratio\s*:\s*1/iu.test(styleText);
    checks.push(check('circular-buttons', 'buttons are circular/rounded', circular, 'error'));
  }

  const failed = checks.filter((c) => c.severity === 'error' && !c.ok).map((c) => c.id);
  return {
    applicable: true,
    checks,
    entryHtmlPath: entry?.htmlPath ?? null,
    failed,
    ok: failed.length === 0,
    openHint: formatOpenHint(entry),
  };
};

const readSafe = async (cwd: string, rel: string): Promise<string> => {
  try {
    return await fs.readFile(path.join(cwd, rel), 'utf8');
  } catch {
    return '';
  }
};

/**
 * Load the real entry + its linked assets from disk and evaluate. Only static
 * apps with an index.html entry are applicable; returns `applicable:false`
 * otherwise so the caller can skip cleanly (e.g. framework apps).
 */
export const runVisualAcceptance = async (opts: {
  changedFiles?: readonly string[];
  cwd: string;
  prompt: string;
  selectedFiles?: readonly string[];
}): Promise<VisualAcceptanceReport> => {
  const entry = await detectStaticAppEntry(opts.cwd, opts.selectedFiles ?? [], opts.prompt);
  if (!entry) {
    return {applicable: false, checks: [], entryHtmlPath: null, failed: [], ok: true, openHint: null};
  }
  const html = await readSafe(opts.cwd, entry.htmlPath);
  const css = (await Promise.all(entry.styles.map((s) => readSafe(opts.cwd, s)))).join('\n');
  const js = (await Promise.all(entry.scripts.map((s) => readSafe(opts.cwd, s)))).join('\n');
  return evaluateVisual({changedFiles: opts.changedFiles, css, entry, html, js, prompt: opts.prompt});
};

export const formatVisualAcceptanceReport = (report: VisualAcceptanceReport): string => {
  if (!report.applicable) return '';
  const lines: string[] = [];
  const errs = report.checks.filter((c) => c.severity === 'error' && !c.ok);
  const warns = report.checks.filter((c) => c.severity === 'warn' && !c.ok);
  if (errs.length > 0) lines.push(`Visual issues: ${errs.map((c) => c.label).join('; ')}`);
  if (warns.length > 0) lines.push(`Visual suggestions: ${warns.map((c) => c.label).join('; ')}`);
  lines.push(`Browser smoke: ${report.ok ? 'passed' : 'failed'}`);
  if (report.openHint) lines.push(report.openHint);
  return lines.join('\n');
};

/** Correction directive when visual acceptance fails (fed back to the model). */
export const buildVisualCorrectionDirective = (report: VisualAcceptanceReport): string => {
  const errs = report.checks.filter((c) => c.severity === 'error' && !c.ok);
  return [
    'The rendered UI is not acceptable yet. Fix ALL of these in the file plan,',
    `editing the files actually linked by ${report.entryHtmlPath ?? 'the entry HTML'}`,
    '(full file contents, not partial snippets):',
    ...errs.map((c) => `- ${c.label}${c.detail ? ` (${c.detail})` : ''}`),
  ].join('\n');
};
