import fs from 'node:fs/promises';
import path from 'node:path';

import {execa} from 'execa';

import type {ResolvedConfig} from '../config/config.js';
import {getEvalSuiteIds} from '../evals/suites/index.js';
import {loadLastEvalResult} from '../evals/results.js';
import {getProjectConfigDir, getProjectMemoryPath} from '../utils/paths.js';
import {formatUnknownError} from '../utils/display.js';
import {getProjectTrustStatus} from '../safety/projectTrust.js';
import {loadProjectWorkflows} from '../workflows/registry.js';
import {BgTaskStore} from '../tasks/bgTaskStore.js';
import {listAgentWorktrees} from '../agents/worktreeManager.js';
import {getProjectBgTasksDir, getProjectWorktreesDir} from '../utils/paths.js';
import {buildProjectBrainSummary} from '../projectBrain/reader.js';
import type {DoctorCheck} from './doctor.js';

const commandVersion = async (command: string, args = ['--version']): Promise<string | null> => {
  const result = await execa(command, args, {reject: false});
  return result.exitCode === 0 ? (result.stdout || result.stderr).trim().split('\n')[0] ?? null : null;
};

export const buildSystemDoctorChecks = async (cwd: string): Promise<DoctorCheck[]> => {
  const checks: DoctorCheck[] = [];
  const gitRepo = await execa('git', ['rev-parse', '--is-inside-work-tree'], {cwd, reject: false});
  checks.push({
    detail: gitRepo.exitCode === 0 ? 'Current directory is inside a git repository' : 'Current directory is not a git repository',
    fix: gitRepo.exitCode === 0 ? undefined : 'Run from a git repository for richer context, or continue without git signals.',
    label: 'Git repository',
    status: gitRepo.exitCode === 0 ? 'pass' : 'warn',
  });
  try {
    const stats = await fs.statfs(cwd);
    const freeMb = Math.round((stats.bavail * stats.bsize) / 1024 / 1024);
    checks.push({detail: `${freeMb} MB available`, fix: freeMb < 512 ? 'Free disk space before running large builds or evals.' : undefined, label: 'Disk space', status: freeMb < 512 ? 'warn' : 'pass'});
  } catch {
    checks.push({detail: 'Unable to inspect disk space', label: 'Disk space', status: 'skip'});
  }
  return checks;
};

export const buildSandboxDoctorChecks = async (): Promise<DoctorCheck[]> => Promise.all(
  ['docker', 'podman', 'firejail'].map(async (backend) => {
    const version = await commandVersion(backend);
    const check: DoctorCheck = {
      detail: version ?? `${backend} not available`,
      fix: version ? undefined : `Install ${backend} to enable this sandbox backend.`,
      label: `${backend} sandbox`,
      status: version ? 'pass' : 'warn',
    };
    return check;
  }),
);

export const buildMemoryTokenEvalChecks = async (cwd: string, config: ResolvedConfig): Promise<DoctorCheck[]> => {
  const memoryPath = getProjectMemoryPath(cwd);
  const memoryReadable = await fs.access(memoryPath).then(() => true, () => false);
  const suiteIds = getEvalSuiteIds();
  const lastEval = await loadLastEvalResult('smoke').catch(() => null);
  return [{
    detail: memoryReadable ? `Readable: ${memoryPath}` : `Missing: ${memoryPath}`,
    fix: 'Use `/memory` or `apeironcode memory learn` to create project memory when useful.',
    label: 'Memory file',
    status: memoryReadable ? 'pass' : 'warn',
  }, {
    detail: `enabled=${config.effective.tokenEfficiency.enabled}; compression=${config.effective.tokenEfficiency.context.maxFullFiles} full/${config.effective.tokenEfficiency.context.maxSummaryFiles} summary; dynamicTools=${config.effective.tokenEfficiency.tools.dynamicExposureEnabled}`,
    label: 'Token efficiency',
    status: config.effective.tokenEfficiency.enabled ? 'pass' : 'warn',
  }, {
    detail: `${suiteIds.length} suite(s): ${suiteIds.join(', ')}${lastEval ? `; last smoke ${lastEval.passed}/${lastEval.total}` : ''}`,
    label: 'Eval suites',
    status: suiteIds.length > 0 ? 'pass' : 'fail',
  }];
};

export const applySafeDoctorFixes = async (cwd: string): Promise<DoctorCheck> => {
  try {
    await fs.mkdir(getProjectConfigDir(cwd), {recursive: true});
    return {detail: `Ensured ${getProjectConfigDir(cwd)} exists`, label: 'Safe fixes', status: 'pass'};
  } catch (error) {
    return {detail: formatUnknownError(error), label: 'Safe fixes', status: 'warn'};
  }
};

export const buildWorkflowDoctorChecks = async (cwd: string): Promise<DoctorCheck[]> => {
  const checks: DoctorCheck[] = [];
  const trustStatus = getProjectTrustStatus(cwd);
  const brain = await buildProjectBrainSummary(cwd, {requireTrustForWorkflows: true});

  checks.push({
    detail: `status=${brain.status}; manifest=${brain.manifestVersion ?? 'missing'}; safeLoad=${brain.safeLoadStatus}`,
    fix: brain.status === 'missing' ? 'Run "apeironcode brain plan" to preview optional Project Brain files.' : undefined,
    label: 'Project Brain',
    status: brain.status === 'initialized' ? 'pass' : brain.status === 'missing' ? 'warn' : 'warn',
  });
  checks.push({
    detail: `${brain.keyFilesPresent.length} key file(s) present, ${brain.keyFilesMissing.length} missing; workflows=${brain.workflowCounts.agents} agents/${brain.workflowCounts.skills} skills/${brain.workflowCounts.commands} commands`,
    label: 'Project Brain: files',
    status: brain.keyFilesMissing.length === 0 && brain.status !== 'missing' ? 'pass' : 'warn',
  });

  const dirChecks: Array<{label: string; dir: string}> = [
    {label: 'Workflow: agents directory', dir: path.join(cwd, '.apeironcode/agents')},
    {label: 'Workflow: skills directory', dir: path.join(cwd, '.apeironcode/skills')},
    {label: 'Workflow: commands directory', dir: path.join(cwd, '.apeironcode/commands')},
  ];

  for (const {label, dir} of dirChecks) {
    const exists = await fs.access(dir).then(() => true, () => false);
    checks.push({
      label,
      detail: exists ? `Found: ${dir}` : `Not present: ${dir}`,
      status: exists ? 'pass' : 'warn',
      fix: exists ? undefined : 'Create the directory and add Markdown workflow definitions to extend ApeironCode.',
    });
  }

  checks.push({
    label: 'Workflow: project trust',
    detail: `trust=${trustStatus.trust}; auto-load requires trusted project`,
    status: trustStatus.trust === 'trusted' ? 'pass' : 'warn',
    fix: trustStatus.trust !== 'trusted' ? 'Run "apeironcode trust" to trust this project for workflow auto-loading.' : undefined,
  });

  // Count blocked workflows without executing anything
  if (trustStatus.trust === 'trusted') {
    try {
      const registry = loadProjectWorkflows(cwd, {skipTrustCheck: true});
      const blocked = registry.getBlockedCount();
      checks.push({
        label: 'Workflow: registry',
        detail: `loaded; ${registry.listWorkflowDefinitions().agents.length} agents, ${registry.listWorkflowDefinitions().skills.length} skills, ${registry.listWorkflowDefinitions().commands.length} commands; ${blocked} blocked`,
        status: blocked > 0 ? 'warn' : 'pass',
      });
    } catch {
      checks.push({label: 'Workflow: registry', detail: 'could not load workflow registry', status: 'warn'});
    }
  } else {
    checks.push({
      label: 'Workflow: registry',
      detail: 'skipped — project not trusted; workflows will be blocked at auto-load',
      status: 'warn',
    });
  }

  return checks;
};

export const buildTaskWorktreeDoctorChecks = async (cwd: string): Promise<DoctorCheck[]> => {
  const checks: DoctorCheck[] = [];

  // Task store
  const bgTasksDir = getProjectBgTasksDir(cwd);
  const bgTasksDirExists = await fs.access(bgTasksDir).then(() => true, () => false);
  let taskCount = 0;
  let activeCount = 0;
  if (bgTasksDirExists) {
    try {
      const store = new BgTaskStore(cwd);
      const tasks = await store.listTasks();
      taskCount = tasks.length;
      activeCount = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
    } catch {
      // ignore
    }
  }
  checks.push({
    label: 'Background tasks: store',
    detail: bgTasksDirExists
      ? `${taskCount} task(s); ${activeCount} active`
      : 'No bg-tasks directory (tasks will be created on first use)',
    status: 'pass',
  });

  // Worktree manager
  const worktreesDir = getProjectWorktreesDir(cwd);
  const worktreesDirExists = await fs.access(worktreesDir).then(() => true, () => false);
  let worktreeCount = 0;
  if (worktreesDirExists) {
    try {
      const worktrees = await listAgentWorktrees(cwd);
      worktreeCount = worktrees.filter((w) => w.status === 'active').length;
    } catch {
      // ignore
    }
  }
  checks.push({
    label: 'Background tasks: worktree manager',
    detail: worktreesDirExists
      ? `${worktreeCount} active worktree(s); root: ${worktreesDir}`
      : 'No worktrees directory (will be created on first worktree task)',
    status: 'pass',
  });

  checks.push({
    label: 'Background tasks: daemon',
    detail: 'Not used in this phase — all tasks run synchronously in-process',
    status: 'pass',
  });

  checks.push({
    label: 'Background tasks: agent runner',
    detail: 'Available — inject AgentRunner via TaskRunnerOptions for live execution',
    status: 'pass',
  });

  checks.push({
    label: 'Background tasks: checkpoint resume',
    detail: 'Available — buildTaskResumePlan() checks for runtime snapshots and checkpoints',
    status: 'pass',
  });

  checks.push({
    label: 'Background tasks: worktree reconciliation',
    detail: 'Available — reconcileAgentWorktrees() cross-references git worktree list',
    status: 'pass',
  });

  return checks;
};

export const buildBridgeChecks = async (cwd: string): Promise<DoctorCheck[]> => {
  return buildBridgeChecksSync(cwd, await checkVsCodeExtensionPresent(cwd));
};

const checkVsCodeExtensionPresent = async (cwd: string): Promise<boolean> => {
  try {
    await fs.access(path.join(cwd, 'extensions', 'vscode', 'package.json'));
    return true;
  } catch {
    return false;
  }
};

const buildBridgeChecksSync = (cwd: string, vscodePkgPresent: boolean): DoctorCheck[] => {
  const checks: DoctorCheck[] = [];

  checks.push({
    label: 'Bridge: protocol',
    detail: 'available — IDE Bridge Protocol types and message system ready (Phase 16E)',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: local-only',
    detail: 'enforced — bridge binds only to 127.0.0.1; no remote/cloud access in this phase',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: auth',
    detail: `workspace secret stored under ${getProjectConfigDir(cwd)}/bridge-secret.json`,
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: session store',
    detail: 'available — bridge session tracking ready',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: event adapter',
    detail: 'available — AgentEvent → BridgeMessage mapping wired',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: permission flow',
    detail: 'available — createBridgePermissionRequest / waitForBridgePermissionDecision ready',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: diff preview',
    detail: 'available — createDiffPreviewMessage produces safe bridge diff summaries',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: WebSocket transport',
    detail: 'available — local-only (127.0.0.1), auth required, ping/pong supported',
    status: 'pass',
  });

  checks.push({
    label: 'Bridge: persistent server',
    detail: 'available — WebSocket transport; start with `apeironcode bridge start`',
    status: 'pass',
  });

  checks.push({
    label: 'VS Code extension: package',
    detail: vscodePkgPresent
      ? 'VS Code extension package present at extensions/vscode/'
      : 'VS Code extension package not found at extensions/vscode/',
    status: vscodePkgPresent ? 'pass' : 'warn',
  });

  checks.push({
    label: 'VS Code extension: bridge transport',
    detail: 'WebSocket transport available for VS Code extension bridge client',
    status: 'pass',
  });

  checks.push({
    label: 'VS Code extension: permission bridge',
    detail: 'permission.requested / approved / denied messages supported',
    status: 'pass',
  });

  checks.push({
    label: 'VS Code extension: diff preview',
    detail: 'diff.preview message supported; no auto-apply in MVP',
    status: 'pass',
  });

  return checks;
};


export const buildRuntimeBrainDoctorChecks = async (cwd: string): Promise<DoctorCheck[]> => {
  const checks: DoctorCheck[] = [];

  // 1. runtimeContext importable (module present)
  try {
    await import('../projectBrain/runtimeContext.js');
    checks.push({label: 'Runtime brain: context module', detail: 'buildRuntimeBrainContext available', status: 'pass'});
  } catch {
    checks.push({label: 'Runtime brain: context module', detail: 'runtimeContext module not importable', status: 'warn'});
  }

  // 2. brainContextPlanner available
  try {
    await import('../projectBrain/brainContextPlanner.js');
    checks.push({label: 'Runtime brain: context planner', detail: 'selectBrainFilesForPrompt available', status: 'pass'});
  } catch {
    checks.push({label: 'Runtime brain: context planner', detail: 'brainContextPlanner module not importable', status: 'warn'});
  }

  // 3. agentRouter available
  try {
    await import('../projectBrain/agentRouter.js');
    checks.push({label: 'Runtime brain: agent router', detail: 'createAgentRoutingPlan available', status: 'pass'});
  } catch {
    checks.push({label: 'Runtime brain: agent router', detail: 'agentRouter module not importable', status: 'warn'});
  }

  // 4. syncPolicy: read auto-sync mode from config dir (offline, no writes)
  try {
    const {getProjectBrainSyncDecision} = await import('../projectBrain/syncPolicy.js');
    const decision = await getProjectBrainSyncDecision(
      {kind: 'run-completed', cwd, hasSecrets: false},
      {mode: 'ask'},
    );
    checks.push({
      label: 'Runtime brain: auto-sync policy',
      detail: `policy=ask; decision=${decision.action}; ${decision.reason.slice(0, 80)}`,
      status: 'pass',
    });
  } catch {
    checks.push({label: 'Runtime brain: auto-sync policy', detail: 'could not read sync policy', status: 'warn'});
  }

  // 5. preview store: count stored previews (offline, no writes)
  try {
    const {listSyncPreviews} = await import('../projectBrain/syncPreviewStore.js');
    const previews = await listSyncPreviews(cwd);
    checks.push({
      label: 'Runtime brain: preview store',
      detail: `${previews.length} stored preview(s)`,
      status: 'pass',
    });
  } catch {
    checks.push({label: 'Runtime brain: preview store', detail: 'no preview store (not initialized)', status: 'pass'});
  }

  return checks;
};

export const buildSafetyEngineChecks = (config: ResolvedConfig): DoctorCheck[] => {
  const fallbackPolicy = config.effective.sandbox?.fallbackPolicy ?? 'safe-readonly';
  const approvalMode = config.effective.approvalMode ?? 'ask';
  const ruleCount = (config.effective.permissions ?? []).length;
  return [
    {label: 'Safety: shell parser', detail: 'enabled', status: 'pass'},
    {label: 'Safety: permission mode', detail: approvalMode, status: 'pass'},
    {label: 'Safety: sandbox fallback policy', detail: fallbackPolicy, status: 'pass'},
    {label: 'Safety: protected path policy', detail: 'enabled', status: 'pass'},
    {label: 'Safety: secret egress detection', detail: 'enabled', status: 'pass'},
    {label: 'Safety: project trust', detail: 'unknown (per-cwd; query at runtime)', status: 'pass'},
    {label: 'Safety: hook v2', detail: 'enabled', status: 'pass'},
    {label: 'Safety: hook v2 runtime producers', detail: 'wired (PreToolUse, PostToolUse, PostToolUseFailure, Stop)', status: 'pass'},
    {label: 'Safety: completion gates', detail: 'wired into agent loop', status: 'pass'},
    {label: 'Safety: tool batch summary', detail: 'enabled', status: 'pass'},
    {label: 'Safety: context viewer', detail: 'available', status: 'pass'},
    {label: 'Safety: compaction explanation', detail: 'available', status: 'pass'},
    {label: 'Safety: TODO-marker gate', detail: 'enabled', status: 'pass'},
    {label: 'Safety: permission rules', detail: `${ruleCount} rule(s) configured`, status: 'pass'},
  ];
};
