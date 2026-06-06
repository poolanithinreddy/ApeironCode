export const PROJECT_BRAIN_DIR = '.apeironcode';
export const PROJECT_BRAIN_VERSION = 1;

export type ProjectBrainStatus = 'missing' | 'planned' | 'initialized' | 'partial' | 'conflict' | 'invalid';

export type ProjectBrainFileKind =
  | 'project'
  | 'plan'
  | 'tasks'
  | 'decisions'
  | 'references'
  | 'verify'
  | 'runs'
  | 'memory'
  | 'manifest'
  | 'agent'
  | 'skill'
  | 'command'
  | 'folder';

export type ProjectBrainPlanMode = 'create' | 'merge' | 'repair';
export type ProjectBrainInitMode = 'plan' | 'init' | 'update';
export type ProjectBrainFileStatus = 'missing' | 'exists' | 'conflict' | 'will-create' | 'will-preserve';

export interface ProjectBrainManifest {
  version: number;
  projectName: string;
  projectRootFingerprint: string;
  createdAt: string;
  updatedAt: string;
  files: Array<{path: string; kind: ProjectBrainFileKind; updatedAt: string}>;
  notes: string[];
}

export interface ProjectBrainFile {
  path: string;
  relativePath: string;
  kind: ProjectBrainFileKind;
  content: string;
  required: boolean;
  status: ProjectBrainFileStatus;
}

export interface ProjectBrainInitPlan {
  cwd: string;
  brainDir: string;
  status: ProjectBrainStatus;
  mode: ProjectBrainPlanMode;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
  summary: ProjectBrainSummary;
  files: ProjectBrainFile[];
  folders: string[];
  benefits: string[];
  warnings: string[];
}

export interface ProjectBrainInitResult {
  ok: boolean;
  dryRun: boolean;
  approved: boolean;
  createdFiles: string[];
  preservedFiles: string[];
  backedUpFiles: string[];
  warnings: string[];
  message: string;
}

export interface ProjectBrainValidationIssue {
  severity: 'error' | 'warn';
  path?: string;
  message: string;
}

export interface ProjectBrainSummary {
  status: ProjectBrainStatus;
  projectName: string;
  projectRootFingerprint: string;
  manifestVersion?: number;
  keyFilesPresent: string[];
  keyFilesMissing: string[];
  workflowCounts: {
    agents: number;
    skills: number;
    commands: number;
  };
  safeLoadStatus: 'safe-summary' | 'trusted-workflows' | 'blocked-untrusted' | 'missing';
  notes: string[];
}

export const DEFAULT_PROJECT_BRAIN_FILES: Array<{relativePath: string; kind: ProjectBrainFileKind; required: boolean}> = [
  {kind: 'project', relativePath: '.apeironcode/PROJECT.md', required: true},
  {kind: 'plan', relativePath: '.apeironcode/PLAN.md', required: true},
  {kind: 'tasks', relativePath: '.apeironcode/TASKS.md', required: true},
  {kind: 'decisions', relativePath: '.apeironcode/DECISIONS.md', required: true},
  {kind: 'references', relativePath: '.apeironcode/REFERENCES.md', required: true},
  {kind: 'verify', relativePath: '.apeironcode/VERIFY.md', required: true},
  {kind: 'runs', relativePath: '.apeironcode/RUNS.md', required: true},
  {kind: 'memory', relativePath: '.apeironcode/MEMORY.md', required: true},
  {kind: 'manifest', relativePath: '.apeironcode/manifest.json', required: true},
];

export const DEFAULT_PROJECT_BRAIN_FOLDERS = [
  '.apeironcode/agents',
  '.apeironcode/skills',
  '.apeironcode/commands',
  '.apeironcode/runs',
  '.apeironcode/references',
] as const;
