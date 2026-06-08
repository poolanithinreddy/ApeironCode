/**
 * Real-user CLI flow smoke harness (no network, no real provider).
 * Walks: fresh config -> setup-first -> choose GitHub Models -> restart ->
 * compact home -> chat with no approval -> risky action asks approval.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';
import {applySetupProfile} from '../../src/setup/setup.js';
import {detectFirstRunState, shouldShowFirstRunSetup} from '../../src/cli/setup/firstRun.js';
import {formatCompactHome} from '../../src/ui/welcomeDashboard.js';
import {shouldRequirePlan} from '../../src/agent/planningGate.js';
import {requiresRuntimeApproval} from '../../src/agent/runtimePermissions.js';

const TOKEN = 'github_pat_11SECRETSECRETSECRETdonotleak1234567890';

describe('CLI real-user flow', () => {
  const originalHome = process.env.HOME;
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-flow-home-'));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-flow-proj-'));
    process.env.HOME = home;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('1. fresh config shows setup-first state', () => {
    const state = detectFirstRunState({}, {});
    expect(state.isFirstRun).toBe(true);
    expect(shouldShowFirstRunSetup(state, {
      argv: ['node', 'apeironcode'],
      env: {},
    })).toBe(true);
  });

  it('2-3. choosing GitHub Models saves config and restart shows compact home', async () => {
    const store = new ConfigStore(cwd);
    await applySetupProfile(store, {provider: 'github-models'});

    const reloaded = await new ConfigStore(cwd).load();
    const state = detectFirstRunState({
      defaultProvider: reloaded.effective.defaultProvider,
      defaultModel: reloaded.effective.defaultModel,
      hasUserConfigFile: true,
    });
    expect(state.isFirstRun).toBe(false);

    const home = formatCompactHome({
      provider: reloaded.effective.defaultProvider,
      model: reloaded.effective.defaultModel,
      version: '0.1.0',
    });
    expect(home).toContain('ApeironCode');
    expect(home).toContain('github-models/openai/gpt-4.1');
    expect(home).not.toContain('mock-coder');
    expect(home.toLowerCase()).not.toContain('opencode');
    expect(home).not.toContain(TOKEN);
  });

  it('4-5. plain chat and explanation require no approval', () => {
    expect(shouldRequirePlan('chat', 'hi')).toBe(false);
    expect(shouldRequirePlan('chat', 'explain repo')).toBe(false);
    expect(requiresRuntimeApproval({kind: 'read_file', path: 'README.md'})).toBe(false);
  });

  it('6-7. editing a file and running a command require approval', () => {
    expect(requiresRuntimeApproval({kind: 'edit_file', path: 'README.md'})).toBe(true);
    expect(requiresRuntimeApproval({kind: 'run_command', command: 'npm test'})).toBe(true);
  });

  it('10. no flow output contains the full token', () => {
    const home = formatCompactHome({provider: 'github-models', model: 'openai/gpt-4.1'});
    expect(JSON.stringify({home})).not.toContain(TOKEN);
  });

  it('11. CLI entrypoint does not use a top-level await on runCli', async () => {
    const src = await fs.readFile(
      path.join(process.cwd(), 'src/cli/index.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/^\s*await\s+runCli\(\)/mu);
    expect(src).toMatch(/runCli\(\)\.then\(/u);
  });

  it('12. legacy .opencode-agent config migrates to ApeironCode home', async () => {
    const {migrateLegacyAppHome, getGlobalConfigPath} = await import(
      '../../src/utils/paths.js'
    );
    const fsSync = await import('node:fs');
    const legacyDir = path.join(home, '.opencode-agent');
    fsSync.mkdirSync(legacyDir, {recursive: true});
    fsSync.writeFileSync(
      path.join(legacyDir, 'config.json'),
      JSON.stringify({defaultProvider: 'github-models', defaultModel: 'openai/gpt-4.1'}),
    );
    expect(migrateLegacyAppHome()).toBe(true);
    expect(getGlobalConfigPath()).toBe(
      path.join(home, '.apeironcode-agent', 'config.json'),
    );
  });

  it('13. project_tree runs without approval; edit_file asks', async () => {
    const {ToolRegistry} = await import('../../src/tools/registry.js');
    const {ApprovalManager} = await import('../../src/safety/approvals.js');
    const {AuditLog} = await import('../../src/safety/auditLog.js');
    const {projectTreeTool} = await import('../../src/tools/projectTree.js');
    const {editFileTool} = await import('../../src/tools/editFile.js');
    const {createMockConfig} = await import('../support/mocks.js');

    const prompts: string[] = [];
    const approvalManager = new ApprovalManager('ask', (request) => {
      prompts.push(request.title);
      return Promise.resolve({approved: false});
    });
    const registry = new ToolRegistry([projectTreeTool, editFileTool]);
    registry.configureExecutor({
      approvalManager,
      globalPermissionRules: [],
      auditLog: new AuditLog(),
      sessionId: 'flow',
    });

    const tree = await registry.invoke('project_tree', {depth: 1}, {
      cwd,
      config: createMockConfig(),
      approvalManager,
    });
    expect(tree.ok).toBe(true);
    expect(prompts).toHaveLength(0);

    await expect(
      registry.invoke('edit_file', {path: 'README.md', search: 'a', replace: 'b'}, {
        cwd,
        config: createMockConfig(),
        approvalManager,
      }),
    ).rejects.toThrow();
    expect(prompts).toContain('Execute Tool: edit_file');
  });
});
