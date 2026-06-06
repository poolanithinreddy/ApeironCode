/**
 * Browser / rendered-page smoke runtime (Phase 18A, Task B).
 *
 * Feature acceptance (featureAcceptance.ts) only proves the requested *features*
 * appear somewhere in the snapshot. It cannot tell that the rendered page is
 * broken: an overflowing display, a missing linked stylesheet, or an edit
 * applied to the wrong file. This runtime adds a low-dependency rendered-UI
 * smoke that runs offline by default.
 *
 * Approach (deliberately the lowest reliable dependency):
 *   - Static apps: load the *actual* entry HTML + only its linked CSS/JS and
 *     apply the DOM/CSS heuristics in visualAcceptance.ts. No browser, no
 *     network, deterministic in CI.
 *   - Package apps (package.json present): a real rendered smoke needs a build
 *     + headless browser, which is too heavy for the default offline test path.
 *     We report `kind:'package'` with `applicable:false` and a documented
 *     limitation rather than faking a pass.
 *
 * The phase is explicit: do NOT make this impossible. The goal is to catch
 * obvious bad UI and missing linked files, not to judge art perfectly.
 */
import {findAppDirectories} from './appWorkspaceDetection.js';
import {detectStaticAppEntry} from './staticAppEntry.js';
import {
  buildVisualCorrectionDirective,
  formatVisualAcceptanceReport,
  runVisualAcceptance,
  type VisualAcceptanceReport,
} from './visualAcceptance.js';

export type BrowserSmokeKind = 'static' | 'package' | 'none';

export interface BrowserSmokeReport {
  /** True when a meaningful rendered-UI smoke could actually run. */
  applicable: boolean;
  /** Failed visual check ids (empty when not applicable). */
  failed: string[];
  kind: BrowserSmokeKind;
  /** Human-readable note (e.g. package-app limitation). */
  limitation: string | null;
  ok: boolean;
  /** "Open calculator/index.html in your browser." */
  openHint: string | null;
  /** One-line summary for the final assistant message. */
  summary: string;
  visual: VisualAcceptanceReport | null;
}

const PACKAGE_LIMITATION =
  'Rendered browser smoke is not run for package/framework apps offline (needs build + headless browser). Verify manually in a browser.';

const NONE_REPORT: BrowserSmokeReport = {
  applicable: false,
  failed: [],
  kind: 'none',
  limitation: null,
  ok: true,
  openHint: null,
  summary: '',
  visual: null,
};

/**
 * Run the rendered-page smoke for the active app. `changedFiles` is used to
 * detect the "edited the wrong file" class of bug (root styles.css edited while
 * the opened entry links calculator/styles.css).
 */
export const runBrowserSmoke = async (opts: {
  changedFiles?: readonly string[];
  cwd: string;
  prompt: string;
  selectedFiles?: readonly string[];
}): Promise<BrowserSmokeReport> => {
  const entry = await detectStaticAppEntry(opts.cwd, opts.selectedFiles ?? [], opts.prompt);
  if (entry) {
    const visual = await runVisualAcceptance({
      changedFiles: opts.changedFiles,
      cwd: opts.cwd,
      prompt: opts.prompt,
      selectedFiles: opts.selectedFiles,
    });
    return {
      applicable: visual.applicable,
      failed: visual.failed,
      kind: 'static',
      limitation: null,
      ok: visual.ok,
      openHint: visual.openHint,
      summary: formatVisualAcceptanceReport(visual),
      visual,
    };
  }

  // No static entry: is this a package/framework app (build needed) or nothing?
  const dirs = await findAppDirectories(opts.cwd);
  if (dirs.some((d) => d.hasPackageJson)) {
    return {
      ...NONE_REPORT,
      applicable: false,
      kind: 'package',
      limitation: PACKAGE_LIMITATION,
      summary: `Browser smoke: skipped (package app). ${PACKAGE_LIMITATION}`,
    };
  }
  return NONE_REPORT;
};

/** Should the runtime even attempt a visual/browser smoke for this prompt? */
export const wantsRenderedSmoke = (prompt: string): boolean =>
  /premium|polished|beautiful|sleek|gorgeous|iphone|ios\b|layout|overflow|responsive|ui\/?ux|visually|not\s+(?:visually|good|premium)|circular|rounded|centered|too\s+wide/iu.test(
    prompt,
  );

/** Correction directive when the rendered smoke fails (fed back to the model). */
export const buildBrowserSmokeCorrection = (report: BrowserSmokeReport): string | null =>
  report.visual && !report.visual.ok ? buildVisualCorrectionDirective(report.visual) : null;
