/**
 * Simple Action Router.
 *
 * Detects deterministic, low-risk user requests (create/rename/delete a file,
 * list files, show the project tree, read a file, run a command) so the
 * runtime can handle them with a tiny payload instead of a full
 * "implement feature" plan with heavy repo context. Pure detection only —
 * no I/O, no provider calls.
 */

export type SimpleActionKind =
  | 'create_file'
  | 'static_web_app'
  | 'rename_file'
  | 'delete_file'
  | 'create_folder'
  | 'list_files'
  | 'project_tree'
  | 'read_file'
  | 'run_command'
  | 'run_tests';

export interface SimpleAction {
  kind: SimpleActionKind;
  /** Primary target path (relative) when applicable. */
  path?: string;
  /** Multiple target paths for safe batch deletes. */
  paths?: string[];
  /** Rename/move destination path when applicable. */
  toPath?: string;
  /** Shell command when kind is run_command/run_tests. */
  command?: string;
  /** True when the request implies a filesystem mutation needing approval. */
  mutating: boolean;
  /** Human-readable summary of what will happen. */
  description: string;
  /** Deterministic scaffold target files when applicable. */
  files?: string[];
  /** Short style/product description extracted from a scaffold prompt. */
  theme?: string;
}

const QUOTED = `["'\`]?`;
const PATH = `([\\w./-]+)`;

const stripRoot = (text: string): string =>
  text.replace(/\b(?:in|at|to|under|into)\s+(?:the\s+)?(?:project\s+)?(?:repo\s+)?root\b/iu, '').trim();

const cleanPath = (raw: string): string =>
  raw.replace(/^["'`]|["'`]$/gu, '').replace(/^\.\//u, '').trim();

/**
 * Detect a single deterministic action from a natural-language prompt.
 * Returns null when the prompt is not a clear simple action (let the normal
 * agent loop handle it).
 */
// Compound / multi-step requests (with clause separators joining another
// action) are NOT simple deterministic actions — let the model plan them.
const isCompoundPrompt = (text: string): boolean => {
  if (/,|\bthen\b|\band\b/iu.test(text) === false) return false;
  const verbs = text.match(/\b(read|write|create|make|add|run|execute|install|replace|edit|update|fix|rename|move|delete|remove|summari[sz]e|test|build|refactor|implement|explain)\b/giu);
  return (verbs?.length ?? 0) >= 2;
};

const STATIC_WEB_APP_FILES = ['index.html', 'styles.css', 'app.js'];
const LARGE_APP_RE = /\b(saas|enterprise|crm|erp|marketplace|admin dashboard|multi[-\s]?tenant|authentication|database|backend|api server|payments?)\b/iu;
const FRAMEWORK_RE = /\b(react|vite|next(?:\.js)?|vue|svelte|angular|astro|remix|tailwind|webpack|npm package|package\.json|npm install|pnpm|yarn|dependencies?)\b/iu;

const isStaticWebAppPrompt = (text: string): boolean => {
  const lower = text.toLowerCase();
  if (FRAMEWORK_RE.test(lower) || LARGE_APP_RE.test(lower)) return false;
  const asksBuild = /\b(create|make|build|scaffold|generate|add)\b/iu.test(lower);
  const plainStack = (
    /\bhtml\b/iu.test(lower) &&
    /\bcss\b/iu.test(lower) &&
    /\b(?:js|javascript)\b/iu.test(lower)
  ) || /\bplain\s+(?:html|css|javascript|js)\b/iu.test(lower);
  const staticSite = /\b(static\s+(?:web\s+)?site|static\s+website|simple\s+static\s+website|landing\s+page|web\s+(?:app|application)|front[-\s]?end\s+app|website|site|app)\b/iu.test(lower);
  const explicitFiles = STATIC_WEB_APP_FILES.every((file) => lower.includes(file));
  const simpleNoFrameworkSite =
    /\b(simple|basic|static|frontend|front[-\s]?end|landing\s+page)\b/iu.test(lower) &&
    /\b(website|site|web\s+(?:app|application)|front[-\s]?end\s+app|landing\s+page)\b/iu.test(lower) &&
    /\b(?:no|without)\s+(?:frameworks?|dependencies|packages)\b/iu.test(lower);
  const simpleWebsiteInFolder =
    /\b(simple|basic|static)\b/iu.test(lower) &&
    /\b(website|site|landing\s+page)\b/iu.test(lower) &&
    /\bin\s+this\s+folder\b/iu.test(lower);
  return asksBuild && (
    explicitFiles ||
    (staticSite && plainStack) ||
    simpleNoFrameworkSite ||
    simpleWebsiteInFolder ||
    /\bsimple\s+static\s+website\b/iu.test(lower)
  );
};

const extractStaticWebTheme = (text: string): string => {
  const lower = text.toLowerCase();
  const tags = [
    'modern',
    'landing page',
    'premium',
    'task app',
    'portfolio',
    'dashboard',
    'simple',
    'static website',
    'web application',
    'frontend app',
  ].filter((tag) => lower.includes(tag));
  return tags.length > 0 ? tags.join(', ') : 'modern static web app';
};

export const detectSimpleAction = (prompt: string): SimpleAction | null => {
  const raw = prompt.trim();
  const deleteFiles = Array.from(raw.matchAll(/[\w./-]+\.[a-z0-9]+/giu), (match) => cleanPath(match[0]));
  if (/\b(delete|remove|rm)\b/iu.test(raw) && deleteFiles.length > 1) {
    return {
      kind: 'delete_file',
      mutating: true,
      path: deleteFiles[0],
      paths: deleteFiles,
      description: `Delete ${deleteFiles.join(', ')}`,
    };
  }
  if (isCompoundPrompt(raw)) return null;
  const text = stripRoot(raw);
  const lower = text.toLowerCase();

  if (isStaticWebAppPrompt(raw)) {
    return {
      kind: 'static_web_app',
      mutating: true,
      description: 'Create static web app files: index.html, styles.css, app.js',
      files: STATIC_WEB_APP_FILES,
      theme: extractStaticWebTheme(raw),
    };
  }
  if (FRAMEWORK_RE.test(lower) && /\b(app|application|project|site|website)\b/iu.test(lower)) {
    return null;
  }

  // run tests / run command
  const runTests = raw.match(/\b(run|execute)\s+(?:the\s+)?(?:unit\s+)?tests?\b/iu);
  if (runTests) {
    return {kind: 'run_tests', command: 'npm test', mutating: true, description: 'Run the test suite'};
  }
  const runCmd = raw.match(/^(?:please\s+)?(?:run|execute)\s+(?:the\s+command\s+)?`?([^`\n]+?)`?\s*$/iu);
  if (runCmd) {
    const command = runCmd[1]!.trim();
    const looksLikeCommand =
      /^(npm|pnpm|yarn|node|git|npx|make|bash|sh)\b/u.test(command) &&
      command.split(/\s+/u).length <= 5 &&
      !/\b(to|and|then|so|see|that|which|because)\b/iu.test(command);
    if (looksLikeCommand) {
      return {kind: 'run_command', command, mutating: true, description: `Run \`${command}\``};
    }
  }

  // rename / move file
  const rename = text.match(new RegExp(`\\b(?:rename|move)\\s+${QUOTED}${PATH}${QUOTED}\\s+(?:to|->|into|as)\\s+${QUOTED}${PATH}${QUOTED}`, 'iu'));
  if (rename) {
    return {
      kind: 'rename_file',
      path: cleanPath(rename[1]!),
      toPath: cleanPath(rename[2]!),
      mutating: true,
      description: `Rename ${cleanPath(rename[1]!)} to ${cleanPath(rename[2]!)}`,
    };
  }

  // delete file
  const del = text.match(new RegExp(`\\b(?:delete|remove|rm)\\s+(?:the\\s+)?(?:file\\s+)?${QUOTED}${PATH}${QUOTED}`, 'iu'));
  if (del && /\.[\w]+$/u.test(del[1]!)) {
    return {kind: 'delete_file', path: cleanPath(del[1]!), mutating: true, description: `Delete ${cleanPath(del[1]!)}`};
  }

  // create folder
  const folder = text.match(new RegExp(`\\b(?:create|make|add|mkdir)\\s+(?:a\\s+)?(?:new\\s+)?(?:folder|directory|dir)\\s+(?:named\\s+|called\\s+)?${QUOTED}${PATH}${QUOTED}`, 'iu'));
  if (folder) {
    return {kind: 'create_folder', path: cleanPath(folder[1]!), mutating: true, description: `Create folder ${cleanPath(folder[1]!)}`};
  }
  const postfixFolder = text.match(new RegExp(`\\b(?:create|make|add|mkdir)\\s+${QUOTED}${PATH}${QUOTED}\\s+(?:folder|directory|dir)\\b`, 'iu'));
  if (postfixFolder) {
    return {kind: 'create_folder', path: cleanPath(postfixFolder[1]!), mutating: true, description: `Create folder ${cleanPath(postfixFolder[1]!)}`};
  }

  // create file
  const create = text.match(new RegExp(`\\b(?:create|make|add|touch|new)\\s+(?:a\\s+)?(?:new\\s+)?(?:file\\s+)?(?:named\\s+|called\\s+)?${QUOTED}${PATH}${QUOTED}`, 'iu'));
  if (create && /\.[\w]+$/u.test(create[1]!)) {
    return {kind: 'create_file', path: cleanPath(create[1]!), mutating: true, description: `Create ${cleanPath(create[1]!)} in the project root`};
  }

  // project tree
  if (/\b(show|print|display|view)\b.*\b(project\s+)?(tree|structure|layout)\b/u.test(lower) || /^project tree$/u.test(lower)) {
    return {kind: 'project_tree', mutating: false, description: 'Show the project tree'};
  }

  // list files
  if (/^(?:list|ls|show)\s+(?:the\s+)?files\b/u.test(lower)) {
    return {kind: 'list_files', mutating: false, description: 'List files'};
  }

  // read / show a specific file
  const read = text.match(new RegExp(`\\b(?:read|show|open|cat|print)\\s+(?:the\\s+)?(?:file\\s+)?${QUOTED}${PATH}${QUOTED}`, 'iu'));
  if (read && /\.[\w]+$/u.test(read[1]!)) {
    return {kind: 'read_file', path: cleanPath(read[1]!), mutating: false, description: `Read ${cleanPath(read[1]!)}`};
  }

  return null;
};

/** Concise one-line plan for a detected simple action (no giant plan). */
export const formatSimpleActionPlan = (action: SimpleAction): string => {
  const approval = action.mutating ? ' (requires approval)' : '';
  return `Simple action: ${action.description}${approval}.`;
};

/**
 * Simple actions never need heavy repo context, memory-graph injection, or the
 * full tool registry. Returning true tells the runtime to use a tiny payload.
 */
export const shouldBypassHeavyContextForSimpleAction = (
  action: SimpleAction | null,
): boolean => action !== null;

/** Minimal tool a simple action needs (empty = no provider tools required). */
export const toolsForSimpleAction = (action: SimpleAction): string[] => {
  switch (action.kind) {
    case 'create_file':
    case 'static_web_app':
    case 'create_folder':
      return ['write_file'];
    case 'rename_file':
      return ['write_file', 'read_file', 'run_command'];
    case 'delete_file':
      return ['run_command'];
    case 'read_file':
      return ['read_file'];
    case 'list_files':
    case 'project_tree':
      return ['project_tree', 'list_files'];
    case 'run_command':
    case 'run_tests':
      return ['run_command'];
    default:
      return [];
  }
};
