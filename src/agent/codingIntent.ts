export type CodingIntentKind =
  | 'pure_chat'
  | 'read_only_question'
  | 'create_file'
  | 'create_folder'
  | 'delete_file'
  | 'rename_file'
  | 'build_static_app'
  | 'build_framework_app'
  | 'modify_existing_app'
  | 'build_full_stack_app'
  | 'fix_bug'
  | 'run_tests'
  | 'run_command'
  | 'refactor'
  | 'review'
  | 'unknown_coding';

export type CodingSafetyLevel = 'none' | 'low' | 'medium' | 'high';

export interface CodingIntent {
  confidence: number;
  kind: CodingIntentKind;
  reason: string;
  requiresCommands: boolean;
  requiresFileWrites: boolean;
  requiresProvider: boolean;
  requiresWorkspaceInspection: boolean;
  safetyLevel: CodingSafetyLevel;
  suggestedFiles: string[];
}

export interface CodingIntentOptions {
  memoryHints?: string[];
  /** True when the workspace already contains app files (index.html/package.json/...). */
  workspaceHasAppFiles?: boolean;
}

// Vague follow-up modification of an EXISTING app: UI/UX/theme/background
// tweaks, "fix any errors", "make it premium / like an iPhone calculator",
// "add notes", "dark mode", "I don't like it". Only routed to
// modify_existing_app when the workspace already has app files.
const EXISTING_APP_CHANGE_RE =
  /\b(ui|ux|premium|dark[\s-]?mode|dark[\s-]?background|background|theme|styling|styles?|look|feel|polish|redesign|revamp|iphone|don'?t\s+like|do\s+not\s+like|improve|enhance|cleaner|nicer|modern|responsive|notes?|feature|fix(?:\s+(?:any|the|all))?\s+(?:error|bug|issue)|fix\s+it|make\s+it)\b/iu;

// "the app is not complete", "there is nothing to add", "just text",
// "no option", "it is not working", "ui is bad" → repair the existing app.
const APP_COMPLAINT_RE =
  /\b(not\s+complete|incomplete|nothing\s+to\s+add|no\s+option|just\s+text|only\s+text|not\s+working|doesn'?t\s+work|does\s+not\s+work|is\s+bad|looks?\s+bad|broken|empty|missing\s+(?:features?|functionality))\b/iu;

// "Add a login page", "implement auth", "create a settings tab", "add a
// dashboard screen". When app files exist, these should route through the
// modify_existing_app file-plan flow rather than fall through to the
// generic loop — they are incremental feature adds, not fresh scaffolds.
// Matches a feature-add verb followed by either a recognized feature noun
// (login/auth/profile/settings/dashboard/notifications/...) or any noun
// followed by a UI-surface noun (page/screen/view/tab/component/...).
const ADD_FEATURE_RE =
  /\b(?:add|implement|create|introduce|include|enable|integrate|set\s+up|setup)\s+(?:a\s+|an\s+|the\s+|new\s+|user\s+|some\s+)*(?:(?:login|signup|sign[\s-]?up|signin|sign[\s-]?in|auth(?:entication)?|register|logout|oauth|sso|2fa|mfa|jwt|session|profile|settings?|dashboard|admin|home|landing|about|contact|search(?:\s+bar)?|cart|checkout|payment|onboarding|notifications?|feed|chat|inbox|details?|dark[\s-]?mode|light[\s-]?mode|i18n|localization|analytics|telemetry)\b|[\w-]+\s+(?:page|screen|view|tab|section|panel|modal|component|sidebar|navbar|footer|header))/iu;

const FRESH_BUILD_RE =
  /\b(build|create|make|generate|scaffold)\b.*\b(new\s+)?(app|application|website|site|project)\b/iu;

const words = (prompt: string): string => prompt.trim().toLowerCase().replace(/\s+/gu, ' ');

const extractFileNames = (prompt: string): string[] =>
  Array.from(prompt.matchAll(/[\w./-]+\.[a-z0-9]+/giu), (match) => match[0].replace(/^\.\//u, ''));

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

const staticAppFiles = ['index.html', 'styles.css', 'app.js'];

export function classifyCodingIntent(
  prompt: string,
  workspaceSummary = '',
  options: CodingIntentOptions = {},
): CodingIntent {
  void workspaceSummary;
  const text = words(prompt);
  const files = extractFileNames(prompt);

  const base = (
    kind: CodingIntentKind,
    confidence: number,
    reason: string,
    flags: Partial<Omit<CodingIntent, 'kind' | 'confidence' | 'reason'>> = {},
  ): CodingIntent => ({
    confidence,
    kind,
    reason,
    requiresCommands: flags.requiresCommands ?? false,
    requiresFileWrites: flags.requiresFileWrites ?? false,
    requiresProvider: flags.requiresProvider ?? false,
    requiresWorkspaceInspection: flags.requiresWorkspaceInspection ?? false,
    safetyLevel: flags.safetyLevel ?? 'none',
    suggestedFiles: flags.suggestedFiles ?? files,
  });

  if (/^(hi|hello|hey|thanks|thank you|how are you)\??$/iu.test(text)) {
    return base('pure_chat', 0.96, 'Short conversational prompt.', {requiresProvider: true});
  }

  // A "read|show|open|cat|print <file>" prompt with no write/fix intent is a
  // pure inspection. Phase 17G: when the prompt also says "fix", "apply",
  // "implement" etc., it is a *modification* that lists which files to inspect
  // first — must NOT be misrouted to a read-only question, otherwise the
  // detailed UI-repair prompts fall back to the generic loop.
  if (
    has(text, /\b(read|show|open|cat|print)\b/u) &&
    files.length > 0 &&
    !has(text, /\b(edit|change|update|overwrite|delete|remove|fix|apply|implement|build|create|make|generate|scaffold|patch|refactor|rewrite|redesign|restyle|polish|improve)\b/u)
  ) {
    return base('read_only_question', 0.9, 'Prompt asks to inspect a named file.', {
      requiresWorkspaceInspection: true,
      suggestedFiles: files,
    });
  }

  if (has(text, /^(?:please )?(?:run|execute)\s+/u)) {
    const command = text.replace(/^(?:please )?(?:run|execute)\s+(?:the\s+command\s+)?/u, '').trim();
    if (/^npm\s+(?:test|run\s+test)|^pnpm\s+test|^yarn\s+test|\btests?\b/u.test(command)) {
      return base('run_tests', 0.92, 'Prompt asks to run tests.', {
        requiresCommands: true,
        safetyLevel: 'medium',
      });
    }
    return base('run_command', 0.86, 'Prompt asks to execute a shell command.', {
      requiresCommands: true,
      safetyLevel: 'medium',
    });
  }

  if (has(text, /\b(delete|remove|rm)\b/u) && files.length > 0) {
    return base('delete_file', 0.9, 'Prompt explicitly asks to delete file(s).', {
      requiresFileWrites: true,
      safetyLevel: 'high',
      suggestedFiles: files,
    });
  }

  if (has(text, /\b(rename|move)\b/u) && files.length > 0) {
    return base('rename_file', 0.86, 'Prompt asks to rename or move a file.', {
      requiresFileWrites: true,
      safetyLevel: 'medium',
      suggestedFiles: files,
    });
  }

  const fullStack = has(text, /\b(full[-\s]?stack|backend|database|auth|authentication|api|server|payments?|postgres|supabase|mongodb)\b/u);
  // Frameworks must be detected BEFORE the static check, because "next js"
  // contains the word "js" and would otherwise be misrouted to a static
  // HTML/CSS/JS scaffold. Order: framework → full-stack → static.
  const framework = has(text, /\b(next(?:js|\.js)?|react|vue|svelte|sveltekit|nuxt|astro|remix|gatsby|angular|solid(?:js)?|qwik|vite)\b/u);
  // Phase 18A (Task G): recognize broader project nouns so larger requests
  // like "full-stack task manager" / "build a CRM platform" classify as real
  // app builds instead of falling through to unknown_coding.
  const appBuild = has(text, /\b(build|create|make|generate|implement|scaffold)\b/u) &&
    has(text, /\b(app|application|website|site|web app|project|manager|tracker|platform|dashboard|tool|clone|saas|crm)\b/u);
  if (appBuild && framework && !fullStack) {
    return base('build_framework_app', 0.92, 'Prompt asks to build a JS framework app.', {
      requiresCommands: false,
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'high',
      suggestedFiles: [],
    });
  }
  if (appBuild && fullStack) {
    return base('build_full_stack_app', 0.9, 'Prompt asks for a multi-layer application.', {
      requiresCommands: true,
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'high',
    });
  }

  const staticStack = has(text, /\b(html|css|javascript|localstorage|static|plain)\b/u) || /\bjs\b(?!\s*(?:framework|library|app))/u.test(text);
  if (appBuild && staticStack) {
    return base('build_static_app', 0.91, 'Prompt asks to build a static web app.', {
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'medium',
      suggestedFiles: staticAppFiles,
    });
  }

  // Workspace-aware: a vague follow-up tweak to an existing app routes to the
  // deterministic existing-app file-plan flow (read known files → plan →
  // approve → write), so the model never calls read_file for these.
  // ADD_FEATURE_RE explicitly signals an incremental feature add and
  // bypasses the fresh-build guard — "create a login page" mentions "create"
  // but is not a fresh scaffold of a whole new app.
  if (
    options.workspaceHasAppFiles &&
    (
      ADD_FEATURE_RE.test(text) ||
      ((EXISTING_APP_CHANGE_RE.test(text) || APP_COMPLAINT_RE.test(text)) && !FRESH_BUILD_RE.test(text))
    )
  ) {
    return base('modify_existing_app', 0.84, 'Follow-up modification of an existing app.', {
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'high',
      suggestedFiles: files,
    });
  }

  if (has(text, /\b(?:creare|create|make|add|mkdir)\b.*\b(folder|directory|dir)\b/u)) {
    const folder = text.match(/\b(?:named|called)?\s*([a-z0-9][\w./-]*)\s+(?:folder|directory|dir)\b/u)?.[1]
      ?? text.match(/\b(folder|directory|dir)\s+(?:named\s+|called\s+)?([a-z0-9][\w./-]*)\b/u)?.[2];
    return base('create_folder', 0.88, 'Prompt asks to create a folder.', {
      requiresFileWrites: true,
      safetyLevel: 'low',
      suggestedFiles: folder ? [folder] : [],
    });
  }

  if (has(text, /\b(?:create|make|add|touch|new)\b/u) && files.length > 0 && !has(text, /\b(app|website|site)\b/u)) {
    return base('create_file', 0.84, 'Prompt asks to create a named file.', {
      requiresFileWrites: true,
      safetyLevel: 'medium',
      suggestedFiles: files,
    });
  }

  if (has(text, /\b(review|audit|inspect)\b/u)) {
    return base('review', 0.8, 'Prompt asks for review.', {
      requiresProvider: true,
      requiresWorkspaceInspection: true,
    });
  }

  if (has(text, /\b(fix|debug|failing|bug|error)\b/u)) {
    return base('fix_bug', 0.82, 'Prompt asks to fix a bug.', {
      requiresCommands: true,
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'high',
    });
  }

  if (has(text, /\b(refactor|restructure|cleanup|clean up)\b/u)) {
    return base('refactor', 0.82, 'Prompt asks for code changes across existing files.', {
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'high',
    });
  }

  if (has(text, /\b(improve|turn|convert|change|update|override|replace|modify|redesign|restyle|repolish|polish|revamp)\b/u) && has(text, /\b(app|site|website|project|this|ui|interface|design|theme)\b/u)) {
    return base('modify_existing_app', 0.86, 'Prompt asks to modify an existing app.', {
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'high',
      suggestedFiles: files.length > 0 ? files : staticAppFiles,
    });
  }

  if (has(text, /\b(code|implement|build|create|edit|update|change)\b/u)) {
    return base('unknown_coding', 0.55, 'Prompt appears coding-related but needs model planning.', {
      requiresFileWrites: true,
      requiresProvider: true,
      requiresWorkspaceInspection: true,
      safetyLevel: 'medium',
      suggestedFiles: files,
    });
  }

  return base('read_only_question', 0.45, 'Defaulting to provider answer without file writes.', {
    requiresProvider: true,
  });
}

export const isAutonomousCodingIntent = (intent: CodingIntent): boolean =>
  intent.requiresProvider && (
    intent.kind === 'build_static_app' ||
    intent.kind === 'build_framework_app' ||
    intent.kind === 'modify_existing_app' ||
    intent.kind === 'build_full_stack_app'
  );
