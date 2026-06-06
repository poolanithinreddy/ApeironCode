import {describe, expect, it, vi} from 'vitest';

import {buildProgram} from '../../src/cli/commands.js';

const createHandlers = () => ({
  addPermission: vi.fn(() => Promise.resolve()),
  checkPermission: vi.fn(() => Promise.resolve()),
  continueTask: vi.fn(() => Promise.resolve()),
  cost: vi.fn(() => Promise.resolve()),
  debugConfig: vi.fn(() => Promise.resolve()),
  debugLogs: vi.fn(() => Promise.resolve()),
  debugTokens: vi.fn(() => Promise.resolve()),
  debugTraces: vi.fn(() => Promise.resolve()),
  agents: vi.fn(() => Promise.resolve()),
  agentRun: vi.fn(() => Promise.resolve()),
  agentShow: vi.fn(() => Promise.resolve()),
  contextBudget: vi.fn(() => Promise.resolve()),
  contextExplain: vi.fn(() => Promise.resolve()),
  contextFiles: vi.fn(() => Promise.resolve()),
  contextIndex: vi.fn(() => Promise.resolve()),
  contextMap: vi.fn(() => Promise.resolve()),
  contextRefresh: vi.fn(() => Promise.resolve()),
  contextSymbols: vi.fn(() => Promise.resolve()),
  contextWhy: vi.fn(() => Promise.resolve()),
  deleteSession: vi.fn(() => Promise.resolve()),
  doctor: vi.fn(() => Promise.resolve()),
  getConfigValue: vi.fn(() => Promise.resolve()),
  history: vi.fn(() => Promise.resolve()),
  listConfig: vi.fn(() => Promise.resolve()),
  listMcpTools: vi.fn(() => Promise.resolve()),
  listPermissions: vi.fn(() => Promise.resolve()),
  listPlugins: vi.fn(() => Promise.resolve()),
  listMcp: vi.fn(() => Promise.resolve()),
  githubIssue: vi.fn(() => Promise.resolve()),
  githubIssueComment: vi.fn(() => Promise.resolve()),
  githubIssueCreate: vi.fn(() => Promise.resolve()),
  githubIssues: vi.fn(() => Promise.resolve()),
  githubPr: vi.fn(() => Promise.resolve()),
  githubActions: vi.fn(() => Promise.resolve()),
  githubCiExplain: vi.fn(() => Promise.resolve()),
  githubPrComment: vi.fn(() => Promise.resolve()),
  githubPrCreate: vi.fn(() => Promise.resolve()),
  githubPrReview: vi.fn(() => Promise.resolve()),
  githubPrSummary: vi.fn(() => Promise.resolve()),
  securityStatus: vi.fn(() => Promise.resolve()),
  sandboxDoctor: vi.fn(() => Promise.resolve()),
  sandboxStatus: vi.fn(() => Promise.resolve()),
  setup: vi.fn(() => Promise.resolve()),
  setupReset: vi.fn(() => Promise.resolve()),
  setupStatus: vi.fn(() => Promise.resolve()),
  githubPrs: vi.fn(() => Promise.resolve()),
  githubRepo: vi.fn(() => Promise.resolve()),
  githubStatus: vi.fn(() => Promise.resolve()),
  hookDisable: vi.fn(() => Promise.resolve()),
  hookEnable: vi.fn(() => Promise.resolve()),
  hookEvents: vi.fn(() => Promise.resolve()),
  hookList: vi.fn(() => Promise.resolve()),
  hookShow: vi.fn(() => Promise.resolve()),
  hookTest: vi.fn(() => Promise.resolve()),
  hooks: vi.fn(() => Promise.resolve()),
  memoryGraph: vi.fn(() => Promise.resolve()),
  memoryLearn: vi.fn(() => Promise.resolve()),
  memoryPrune: vi.fn(() => Promise.resolve()),
  memoryRelated: vi.fn(() => Promise.resolve()),
  memoryReview: vi.fn(() => Promise.resolve()),
  memorySearch: vi.fn(() => Promise.resolve()),
  memorySuggestionApprove: vi.fn(() => Promise.resolve()),
  memorySuggestionReject: vi.fn(() => Promise.resolve()),
  memorySuggestionShow: vi.fn(() => Promise.resolve()),
  memorySuggestions: vi.fn(() => Promise.resolve()),
  memoryConflicts: vi.fn(() => Promise.resolve()),
  memoryForgetSession: vi.fn(() => Promise.resolve()),
  memoryRollback: vi.fn(() => Promise.resolve()),
  memorySource: vi.fn(() => Promise.resolve()),
  memoryStale: vi.fn(() => Promise.resolve()),
  memoryWhy: vi.fn(() => Promise.resolve()),
  modelList: vi.fn(() => Promise.resolve()),
  modelRecommend: vi.fn(() => Promise.resolve()),
  ollamaModels: vi.fn(() => Promise.resolve()),
  ollamaPullHint: vi.fn(() => Promise.resolve()),
  ollamaRecommend: vi.fn(() => Promise.resolve()),
  ollamaStatus: vi.fn(() => Promise.resolve()),
  providerDoctor: vi.fn(() => Promise.resolve()),
  providerFallback: vi.fn(() => Promise.resolve()),
  providerFallbackSimulate: vi.fn(() => Promise.resolve()),
  providerFallbackSet: vi.fn(() => Promise.resolve()),
  providerFallbackTest: vi.fn(() => Promise.resolve()),
  providerList: vi.fn(() => Promise.resolve()),
  providerSetup: vi.fn(() => Promise.resolve()),
  providerEnv: vi.fn(() => Promise.resolve()),
  listTools: vi.fn(() => Promise.resolve()),
  repoMap: vi.fn(() => Promise.resolve()),
  repoSummary: vi.fn(() => Promise.resolve()),
  repoSymbols: vi.fn(() => Promise.resolve()),
  listSessions: vi.fn(() => Promise.resolve()),
  memoryClear: vi.fn(() => Promise.resolve()),
  memoryEdit: vi.fn(() => Promise.resolve()),
  memoryShow: vi.fn(() => Promise.resolve()),
  memorySummarize: vi.fn(() => Promise.resolve()),
  planApprove: vi.fn(() => Promise.resolve()),
  planClear: vi.fn(() => Promise.resolve()),
  planCreate: vi.fn(() => Promise.resolve()),
  planDelete: vi.fn(() => Promise.resolve()),
  planExecute: vi.fn(() => Promise.resolve()),
  planList: vi.fn(() => Promise.resolve()),
  planPause: vi.fn(() => Promise.resolve()),
  planResume: vi.fn(() => Promise.resolve()),
  planRevise: vi.fn(() => Promise.resolve()),
  planShow: vi.fn(() => Promise.resolve()),
  planStatus: vi.fn(() => Promise.resolve()),
  providerTest: vi.fn(() => Promise.resolve()),
  removePermission: vi.fn(() => Promise.resolve()),
  revert: vi.fn(() => Promise.resolve()),
  resumeSession: vi.fn(() => Promise.resolve()),
  sessionExport: vi.fn(() => Promise.resolve()),
  runRoot: vi.fn(() => Promise.resolve()),
  search: vi.fn(() => Promise.resolve()),
  setConfigValue: vi.fn(() => Promise.resolve()),
  connectorEnv: vi.fn(() => Promise.resolve()),
  connectorList: vi.fn(() => Promise.resolve()),
  evalList: vi.fn(() => Promise.resolve()),
  evalReport: vi.fn(() => Promise.resolve()),
  evalRun: vi.fn(() => Promise.resolve()),
  skillBrowser: vi.fn(() => Promise.resolve()),
  skillCreate: vi.fn(() => Promise.resolve()),
  skillDelete: vi.fn(() => Promise.resolve()),
  skillDisable: vi.fn(() => Promise.resolve()),
  skillEnable: vi.fn(() => Promise.resolve()),
  skillExport: vi.fn(() => Promise.resolve()),
  skillGenerate: vi.fn(() => Promise.resolve()),
  skillImport: vi.fn(() => Promise.resolve()),
  skillList: vi.fn(() => Promise.resolve()),
  skillRun: vi.fn(() => Promise.resolve()),
  skillShow: vi.fn(() => Promise.resolve()),
  skillTemplates: vi.fn(() => Promise.resolve()),
  skillTrust: vi.fn(() => Promise.resolve()),
  skillValidate: vi.fn(() => Promise.resolve()),
  skills: vi.fn(() => Promise.resolve()),
  testMcp: vi.fn(() => Promise.resolve()),
  teamPlan: vi.fn(() => Promise.resolve()),
  teamApply: vi.fn(() => Promise.resolve()),
  teamArtifact: vi.fn(() => Promise.resolve()),
  teamArtifacts: vi.fn(() => Promise.resolve()),
  teamCockpit: vi.fn(() => Promise.resolve()),
  teamConflicts: vi.fn(() => Promise.resolve()),
  teamDiscard: vi.fn(() => Promise.resolve()),
  teamExport: vi.fn(() => Promise.resolve()),
  teamExportPatch: vi.fn(() => Promise.resolve()),
  teamIgnored: vi.fn(() => Promise.resolve()),
  teamMergePlan: vi.fn(() => Promise.resolve()),
  teamReview: vi.fn(() => Promise.resolve()),
  teamResolve: vi.fn(() => Promise.resolve()),
  teamRun: vi.fn(() => Promise.resolve()),
  teamRunShow: vi.fn(() => Promise.resolve()),
  teamRuns: vi.fn(() => Promise.resolve()),
  teamValidatePatch: vi.fn(() => Promise.resolve()),
  teamWorkspaceCleanup: vi.fn(() => Promise.resolve()),
  teamWorkspaces: vi.fn(() => Promise.resolve()),
  webFetch: vi.fn(() => Promise.resolve()),
  webResearch: vi.fn(() => Promise.resolve()),
  webSearch: vi.fn(() => Promise.resolve()),
  workflowList: vi.fn(() => Promise.resolve()),
  workflowReport: vi.fn(() => Promise.resolve()),
  workflowRun: vi.fn(() => Promise.resolve()),
  workflowShow: vi.fn(() => Promise.resolve()),
  lspStatus: vi.fn(() => Promise.resolve()),
  lspSessions: vi.fn(() => Promise.resolve()),
  lspRestart: vi.fn(() => Promise.resolve()),
  lspStop: vi.fn(() => Promise.resolve()),
  lspCache: vi.fn(() => Promise.resolve()),
  lspCacheClear: vi.fn(() => Promise.resolve()),
  lspDiagnostics: vi.fn(() => Promise.resolve()),
  lspDefinition: vi.fn(() => Promise.resolve()),
  lspReferences: vi.fn(() => Promise.resolve()),
  lspSymbols: vi.fn(() => Promise.resolve()),
  sessions: vi.fn(() => Promise.resolve()),
  sessionList: vi.fn(() => Promise.resolve()),
  sessionStart: vi.fn(() => Promise.resolve()),
  sessionShow: vi.fn(() => Promise.resolve()),
  sessionAttach: vi.fn(() => Promise.resolve()),
  sessionLogs: vi.fn(() => Promise.resolve()),
  sessionPause: vi.fn(() => Promise.resolve()),
  sessionResume: vi.fn(() => Promise.resolve()),
  sessionRunWorker: vi.fn(() => Promise.resolve()),
  sessionStop: vi.fn(() => Promise.resolve()),
  sessionDelete: vi.fn(() => Promise.resolve()),
  sessionLocks: vi.fn(() => Promise.resolve()),
  sessionUnlock: vi.fn(() => Promise.resolve()),
  share: vi.fn(() => Promise.resolve()),
});

describe('buildProgram', () => {
  it('passes root provider and model overrides to runRoot', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      '--provider',
      'mock',
      '--model',
      'mock-coder',
      'reply with ok',
    ]);

    expect(handlers.runRoot).toHaveBeenCalledWith(
      'reply with ok',
      expect.objectContaining({model: 'mock-coder', provider: 'mock'}),
    );
  });

  it('passes the root mode override to runRoot', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      '--mode',
      'review',
      'review this diff',
    ]);

    expect(handlers.runRoot).toHaveBeenCalledWith(
      'review this diff',
      expect.objectContaining({mode: 'review'}),
    );
  });

  it('passes provider test overrides through the nested subcommand', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'provider',
      'test',
      '--provider',
      'mock',
      '--model',
      'mock-coder',
      '--base-url',
      'http://localhost:11434',
      '--strict',
    ]);

    expect(handlers.providerTest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://localhost:11434',
        model: 'mock-coder',
        provider: 'mock',
        strict: true,
      }),
    );
  });

  it('routes provider list and setup through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'provider',
      'list',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'provider',
      'setup',
      'mock',
    ]);

    expect(handlers.providerList).toHaveBeenCalledTimes(1);
    expect(handlers.providerSetup).toHaveBeenCalledWith('mock');
  });

  it('routes model list and recommend through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'model',
      'list',
      'coding',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'model',
      'recommend',
      'fast',
    ]);

    expect(handlers.modelList).toHaveBeenCalledWith('coding');
    expect(handlers.modelRecommend).toHaveBeenCalledWith('fast');
  });

  it('routes provider fallback and ollama commands through dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync(['node', 'opencode', 'provider', 'fallback', 'coding']);
    await program.parseAsync(['node', 'opencode', 'provider', 'fallback', 'test', 'coding']);
    await program.parseAsync(['node', 'opencode', 'provider', 'fallback', 'simulate', 'rate-limit', 'coding']);
    await program.parseAsync(['node', 'opencode', 'provider', 'fallback', 'set', 'coding', 'mock:mock-coder']);
    await program.parseAsync(['node', 'opencode', 'ollama', 'status']);
    await program.parseAsync(['node', 'opencode', 'ollama', 'models']);
    await program.parseAsync(['node', 'opencode', 'ollama', 'recommend']);
    await program.parseAsync(['node', 'opencode', 'ollama', 'pull-hint', 'qwen2.5-coder:7b']);

    expect(handlers.providerFallback).toHaveBeenCalledWith('coding');
    expect(handlers.providerFallbackTest).toHaveBeenCalledWith('coding');
    expect(handlers.providerFallbackSimulate).toHaveBeenCalledWith('rate-limit', 'coding');
    expect(handlers.providerFallbackSet).toHaveBeenCalledWith('coding', 'mock:mock-coder');
    expect(handlers.ollamaStatus).toHaveBeenCalledTimes(1);
    expect(handlers.ollamaModels).toHaveBeenCalledTimes(1);
    expect(handlers.ollamaRecommend).toHaveBeenCalledTimes(1);
    expect(handlers.ollamaPullHint).toHaveBeenCalledWith('qwen2.5-coder:7b');
  });

  it('routes web subcommands through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'web',
      'fetch',
      'https://example.com',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'web',
      'search',
      'parser',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'web',
      'research',
      'parser design',
    ]);

    expect(handlers.webFetch).toHaveBeenCalledWith('https://example.com');
    expect(handlers.webSearch).toHaveBeenCalledWith('parser');
    expect(handlers.webResearch).toHaveBeenCalledWith('parser design');
  });

  it('passes strict through doctor when requested', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'doctor',
      '--provider-check',
      '--strict',
    ]);

    expect(handlers.doctor).toHaveBeenCalledWith(
      expect.objectContaining({providerCheck: true, strict: true}),
    );
  });

  it('passes force through context refresh', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'context',
      'refresh',
      '--force',
    ]);

    expect(handlers.contextRefresh).toHaveBeenCalledWith(expect.objectContaining({force: true}));
  });

  it('routes new platform commands through dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync(['node', 'opencode', 'context', 'index']);
    await program.parseAsync(['node', 'opencode', 'context', 'budget']);
    await program.parseAsync(['node', 'opencode', 'context', 'why', 'fix tests']);
    await program.parseAsync(['node', 'opencode', 'memory', 'graph']);
    await program.parseAsync(['node', 'opencode', 'memory', 'related', 'auth']);
    await program.parseAsync(['node', 'opencode', 'memory', 'why', 'auth']);
    await program.parseAsync(['node', 'opencode', 'memory', 'review', '--status', 'pending', '--confidence', 'high', '--source', 'team', '--team', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'memory', 'suggestions']);
    await program.parseAsync(['node', 'opencode', 'memory', 'suggestion', 'show', 'memsug_1']);
    await program.parseAsync(['node', 'opencode', 'memory', 'approve', 'memsug_1']);
    await program.parseAsync(['node', 'opencode', 'memory', 'reject', '--all']);
    await program.parseAsync(['node', 'opencode', 'memory', 'conflicts']);
    await program.parseAsync(['node', 'opencode', 'memory', 'stale']);
    await program.parseAsync(['node', 'opencode', 'memory', 'source', 'mem_1']);
    await program.parseAsync(['node', 'opencode', 'memory', 'rollback', 'mem_1', '--yes']);
    await program.parseAsync(['node', 'opencode', 'memory', 'forget-session', 'sess_1', '--yes']);
    await program.parseAsync(['node', 'opencode', 'setup', '--provider', 'mock']);
    await program.parseAsync(['node', 'opencode', 'setup', 'status']);
    await program.parseAsync(['node', 'opencode', 'setup', 'reset', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'skills']);
    await program.parseAsync(['node', 'opencode', 'skill', 'browser', '--filter', 'enabled', '--search', 'test']);
    await program.parseAsync(['node', 'opencode', 'skill', 'templates']);
    await program.parseAsync(['node', 'opencode', 'skill', 'test', 'fix-tests']);
    await program.parseAsync(['node', 'opencode', 'skill', 'trust', 'fix-tests']);
    await program.parseAsync(['node', 'opencode', 'skill', 'enable', 'fix-tests']);
    await program.parseAsync(['node', 'opencode', 'skill', 'disable', 'fix-tests']);
    await program.parseAsync(['node', 'opencode', 'skill', 'run', 'fix-tests', '--input', 'unit failure']);
    await program.parseAsync(['node', 'opencode', 'github', 'status']);
    await program.parseAsync(['node', 'opencode', 'github', 'issue', 'comment', '7', 'looks good', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'github', 'issue', 'create', '--title', 'Bug', '--body', 'Details', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'github', 'pr', 'summary', '8']);
    await program.parseAsync(['node', 'opencode', 'github', 'pr', 'review', '8', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'github', 'pr', 'create', '--title', 'Fix', '--body', 'Details', '--base', 'main', '--head', 'branch', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'github', 'actions']);
    await program.parseAsync(['node', 'opencode', 'github', 'actions', '99']);
    await program.parseAsync(['node', 'opencode', 'github', 'ci', 'explain', '99']);
    await program.parseAsync(['node', 'opencode', 'agents']);
    await program.parseAsync(['node', 'opencode', 'agent', 'run', 'reviewer', 'review diff']);
    await program.parseAsync(['node', 'opencode', 'team', 'plan', 'fix tests', '--parallel-readonly']);
    await program.parseAsync(['node', 'opencode', 'team', 'run', 'fix tests', '--workspace', 'temp-copy', '--parallel-readonly', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'team', 'workspaces']);
    await program.parseAsync(['node', 'opencode', 'team', 'runs']);
    await program.parseAsync(['node', 'opencode', 'team', 'show', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'team', 'review', 'team_1', '--interactive']);
    await program.parseAsync(['node', 'opencode', 'team', 'cockpit', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'team', 'artifacts', 'team_1', '--filter', 'diff', '--search', 'auth']);
    await program.parseAsync(['node', 'opencode', 'team', 'artifact', 'team_1', 'summary-1', '--preview']);
    await program.parseAsync(['node', 'opencode', 'team', 'export', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'team', 'export-patch', 'team_1', '--file', 'src/a.ts']);
    await program.parseAsync(['node', 'opencode', 'team', 'validate-patch', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'team', 'ignored', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'team', 'merge-plan', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'team', 'conflicts', 'team_1', '--file', 'src/a.ts', '--json']);
    await program.parseAsync(['node', 'opencode', 'team', 'apply', 'team_1', '--file', 'src/a.ts']);
    await program.parseAsync(['node', 'opencode', 'team', 'resolve', 'team_1', '--file', 'src/a.ts', '--action', 'skip']);
    await program.parseAsync(['node', 'opencode', 'team', 'discard', 'team_1']);
    await program.parseAsync(['node', 'opencode', 'security', 'status']);
    await program.parseAsync(['node', 'opencode', 'sandbox', 'status']);
    await program.parseAsync(['node', 'opencode', 'sandbox', 'doctor']);
    await program.parseAsync(['node', 'opencode', 'team', 'workspace', 'cleanup']);
    await program.parseAsync(['node', 'opencode', 'hooks']);
    await program.parseAsync(['node', 'opencode', 'hook', 'events']);
    await program.parseAsync(['node', 'opencode', 'workflow', 'show', 'fix-tests']);
    await program.parseAsync(['node', 'opencode', 'workflow', 'run', 'fix-tests', 'math failure', '--dry-run']);
    await program.parseAsync(['node', 'opencode', 'workflow', 'report', 'workflow_1']);
    await program.parseAsync(['node', 'opencode', 'eval', 'list']);
    await program.parseAsync(['node', 'opencode', 'eval', 'run', 'smoke']);
    await program.parseAsync(['node', 'opencode', 'eval', 'report']);

    expect(handlers.contextIndex).toHaveBeenCalledTimes(1);
    expect(handlers.contextBudget).toHaveBeenCalledTimes(1);
    expect(handlers.contextWhy).toHaveBeenCalledWith('fix tests');
    expect(handlers.memoryGraph).toHaveBeenCalledTimes(1);
    expect(handlers.memoryRelated).toHaveBeenCalledWith('auth');
    expect(handlers.memoryWhy).toHaveBeenCalledWith('auth');
    expect(handlers.memoryReview).toHaveBeenCalledWith({confidence: 'high', source: 'team', status: 'pending', team: 'team_1'});
    expect(handlers.memorySuggestions).toHaveBeenCalledTimes(1);
    expect(handlers.memorySuggestionShow).toHaveBeenCalledWith('memsug_1');
    expect(handlers.memorySuggestionApprove).toHaveBeenCalledWith('memsug_1', {});
    expect(handlers.memorySuggestionReject).toHaveBeenCalledWith(undefined, {all: true});
    expect(handlers.memoryConflicts).toHaveBeenCalledTimes(1);
    expect(handlers.memoryStale).toHaveBeenCalledTimes(1);
    expect(handlers.memorySource).toHaveBeenCalledWith('mem_1');
    expect(handlers.memoryRollback).toHaveBeenCalledWith('mem_1', {yes: true});
    expect(handlers.memoryForgetSession).toHaveBeenCalledWith('sess_1', {yes: true});
    expect(handlers.setup).toHaveBeenCalledWith(expect.objectContaining({provider: 'mock'}));
    expect(handlers.setupStatus).toHaveBeenCalledTimes(1);
    expect(handlers.setupReset).toHaveBeenCalledWith({dryRun: true});
    expect(handlers.skills).toHaveBeenCalledTimes(1);
    expect(handlers.skillBrowser).toHaveBeenCalledWith({filter: 'enabled', search: 'test'});
    expect(handlers.skillTemplates).toHaveBeenCalledTimes(1);
    expect(handlers.skillValidate).toHaveBeenCalledWith('fix-tests');
    expect(handlers.skillTrust).toHaveBeenCalledWith('fix-tests');
    expect(handlers.skillEnable).toHaveBeenCalledWith('fix-tests');
    expect(handlers.skillDisable).toHaveBeenCalledWith('fix-tests');
    expect(handlers.skillRun).toHaveBeenCalledWith('fix-tests', {noRun: true});
    expect(handlers.skillRun).toHaveBeenCalledWith('fix-tests', {input: 'unit failure', noRun: false});
    expect(handlers.githubStatus).toHaveBeenCalledTimes(1);
    expect(handlers.githubIssueComment).toHaveBeenCalledWith('7', 'looks good', {dryRun: true});
    expect(handlers.githubIssueCreate).toHaveBeenCalledWith({body: 'Details', dryRun: true, title: 'Bug'});
    expect(handlers.githubPrSummary).toHaveBeenCalledWith('8');
    expect(handlers.githubPrReview).toHaveBeenCalledWith('8', {dryRun: true, post: undefined});
    expect(handlers.githubPrCreate).toHaveBeenCalledWith({base: 'main', body: 'Details', dryRun: true, head: 'branch', title: 'Fix'});
    expect(handlers.githubActions).toHaveBeenCalledWith(undefined);
    expect(handlers.githubActions).toHaveBeenCalledWith('99');
    expect(handlers.githubCiExplain).toHaveBeenCalledWith('99');
    expect(handlers.agents).toHaveBeenCalledTimes(1);
    expect(handlers.agentRun).toHaveBeenCalledWith('reviewer', 'review diff');
    expect(handlers.teamPlan).toHaveBeenCalledWith('fix tests', {parallelReadonly: true});
    expect(handlers.teamRun).toHaveBeenCalledWith('fix tests', {dryRun: true, parallelReadonly: true, workspace: 'temp-copy'});
    expect(handlers.teamWorkspaces).toHaveBeenCalledTimes(1);
    expect(handlers.teamRuns).toHaveBeenCalledTimes(1);
    expect(handlers.teamRunShow).toHaveBeenCalledWith('team_1');
    expect(handlers.teamReview).toHaveBeenCalledWith('team_1', {interactive: true});
    expect(handlers.teamCockpit).toHaveBeenCalledWith('team_1');
    expect(handlers.teamArtifacts).toHaveBeenCalledWith('team_1', {filter: 'diff', search: 'auth'});
    expect(handlers.teamArtifact).toHaveBeenCalledWith('team_1', 'summary-1', {preview: true});
    expect(handlers.teamExport).toHaveBeenCalledWith('team_1');
    expect(handlers.teamExportPatch).toHaveBeenCalledWith('team_1', {file: 'src/a.ts'});
    expect(handlers.teamValidatePatch).toHaveBeenCalledWith('team_1', undefined);
    expect(handlers.teamIgnored).toHaveBeenCalledWith('team_1');
    expect(handlers.teamMergePlan).toHaveBeenCalledWith('team_1');
    expect(handlers.teamConflicts).toHaveBeenCalledWith('team_1', {file: 'src/a.ts', json: true});
    expect(handlers.teamApply).toHaveBeenCalledWith('team_1', {file: 'src/a.ts'});
    expect(handlers.teamResolve).toHaveBeenCalledWith('team_1', {action: 'skip', file: 'src/a.ts'});
    expect(handlers.teamDiscard).toHaveBeenCalledWith('team_1');
    expect(handlers.securityStatus).toHaveBeenCalledTimes(1);
    expect(handlers.sandboxStatus).toHaveBeenCalledTimes(1);
    expect(handlers.sandboxDoctor).toHaveBeenCalledTimes(1);
    expect(handlers.teamWorkspaceCleanup).toHaveBeenCalledTimes(1);
    expect(handlers.hooks).toHaveBeenCalledTimes(1);
    expect(handlers.hookEvents).toHaveBeenCalledTimes(1);
    expect(handlers.workflowShow).toHaveBeenCalledWith('fix-tests');
    expect(handlers.workflowRun).toHaveBeenCalledWith('fix-tests', {dryRun: true, task: 'math failure'});
    expect(handlers.workflowReport).toHaveBeenCalledWith('workflow_1');
    expect(handlers.evalList).toHaveBeenCalledTimes(1);
    expect(handlers.evalRun).toHaveBeenCalledWith('smoke', {});
    expect(handlers.evalReport).toHaveBeenCalledTimes(1);
  });

  it('routes eval and connector phase commands', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync(['node', 'opencode', 'eval', 'run', '--all']);
    await program.parseAsync(['node', 'opencode', 'eval', 'result', 'coding']);
    await program.parseAsync(['node', 'opencode', 'connector', 'list']);
    await program.parseAsync(['node', 'opencode', 'connector', 'env', 'linear']);

    expect(handlers.evalRun).toHaveBeenCalledWith(undefined, {all: true});
    expect(handlers.evalReport).toHaveBeenCalledWith('coding');
    expect(handlers.connectorList).toHaveBeenCalledTimes(1);
    expect(handlers.connectorEnv).toHaveBeenCalledWith('linear');
  });

  it('routes lsp symbols through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'symbols',
      'src/agent/loop.ts',
    ]);

    expect(handlers.lspSymbols).toHaveBeenCalledWith('src/agent/loop.ts', {});
  });

  it('routes lsp diagnostics through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'diagnostics',
      'src/agent/loop.ts',
    ]);

    expect(handlers.lspDiagnostics).toHaveBeenCalledWith('src/agent/loop.ts', {});
  });

  it('routes lsp sessions through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'sessions',
      '--language',
      'TypeScript',
    ]);

    expect(handlers.lspSessions).toHaveBeenCalledWith({language: 'TypeScript'});
  });

  it('routes lsp restart and stop through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'restart',
      '--language',
      'TypeScript',
    ]);
    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'stop',
    ]);

    expect(handlers.lspRestart).toHaveBeenCalledWith({language: 'TypeScript'});
    expect(handlers.lspStop).toHaveBeenCalledWith({});
  });

  it('routes lsp cache and lsp cache clear through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'cache',
    ]);
    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'cache',
      'clear',
    ]);

    expect(handlers.lspCache).toHaveBeenCalledTimes(1);
    expect(handlers.lspCacheClear).toHaveBeenCalledTimes(1);
  });

  it('routes lsp definition through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'definition',
      'src/agent/loop.ts',
      '10',
      '0',
    ]);

    expect(handlers.lspDefinition).toHaveBeenCalledWith('src/agent/loop.ts', '10', '0', {});
  });

  it('routes lsp references through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'lsp',
      'references',
      'src/agent/loop.ts',
      '10',
      '0',
    ]);

    expect(handlers.lspReferences).toHaveBeenCalledWith('src/agent/loop.ts', '10', '0', {});
  });

  it('routes repo commands through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'repo',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'repo',
      'map',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'repo',
      'symbols',
      'value',
    ]);

    expect(handlers.repoSummary).toHaveBeenCalledTimes(1);
    expect(handlers.repoMap).toHaveBeenCalledTimes(1);
    expect(handlers.repoSymbols).toHaveBeenCalledWith('value');
  });

  it('passes continue task ids through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'continue',
      'task-123',
    ]);

    expect(handlers.continueTask).toHaveBeenCalledWith('task-123');
  });

  it('passes plan show and status task ids through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'plan',
      'show',
      'task-123',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'plan',
      'status',
      'task-456',
    ]);

    expect(handlers.planShow).toHaveBeenCalledWith('task-123');
    expect(handlers.planStatus).toHaveBeenCalledWith('task-456');
  });

  it('routes plan lifecycle commands through the dedicated handlers', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'plan',
      'pause',
      'task-123',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'plan',
      'resume',
      'task-123',
    ]);

    await program.parseAsync([
      'node',
      'opencode',
      'plan',
      'delete',
      'task-123',
    ]);

    expect(handlers.planPause).toHaveBeenCalledWith('task-123');
    expect(handlers.planResume).toHaveBeenCalledWith('task-123');
    expect(handlers.planDelete).toHaveBeenCalledWith('task-123');
  });

  it('routes revert file through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'revert',
      '--file',
      'src/example.ts',
    ]);

    expect(handlers.revert).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({file: 'src/example.ts'}),
    );
  });

  it('routes cost through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'cost',
    ]);

    expect(handlers.cost).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it('passes cost scope options through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'cost',
      '--all',
      '--session',
      'session-123',
    ]);

    expect(handlers.cost).toHaveBeenCalledWith(
      expect.objectContaining({all: true, session: 'session-123'}),
    );
  });

  it('passes history filters through the dedicated handler', async () => {
    const handlers = createHandlers();
    const program = buildProgram(handlers);

    await program.parseAsync([
      'node',
      'opencode',
      'history',
      '--all',
      '--file',
      'src/example.ts',
      '--session',
      'session-123',
      '--limit',
      '5',
    ]);

    expect(handlers.history).toHaveBeenCalledWith(
      expect.objectContaining({
        all: true,
        file: 'src/example.ts',
        limit: 5,
        session: 'session-123',
      }),
    );
  });
});
