import {describe, expect, it, vi, beforeEach} from 'vitest';
import {tmpdir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {checkPlanningGate} from '../../src/agent/planningGate.integration.js';
import {createMockConfig} from '../support/mocks.js';
import type {ProjectScan} from '../../src/context/scanner.js';
import type {ResolvedConfig} from '../../src/config/config.js';

const createMockProjectScan = (overrides?: Partial<ProjectScan>): ProjectScan => ({
  buildCommand: null,
  configFiles: [],
  entrypoints: [],
  frameworks: [],
  git: {
    branch: 'main',
    changedFiles: 0,
    changedPaths: [],
    isRepo: true,
  },
  languages: [],
  lintCommand: null,
  manifests: [],
  monorepo: false,
  packageManager: 'npm',
  projectName: 'test-project',
  projectSummary: 'Test project',
  sourceDirectories: [],
  testCommand: null,
  workspaces: [],
  ...overrides,
});

const createMockResolvedConfig = (overrides?: Record<string, unknown>): ResolvedConfig => {
  const mockConfig = createMockConfig(overrides);
  return {
    user: mockConfig,
    project: {},
    effective: mockConfig,
    projectMemory: null,
    ignorePatterns: [],
  };
};

describe('Planning Gate Integration', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockApprovalManager: any = {
    request: vi.fn(),
  };
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testDir = `${tmpdir()}/opencode-test-${Date.now()}`;
    mkdirSync(testDir, {recursive: true});
  });

  it('should allow execution without plan when planning not required', async () => {
    const result = await checkPlanningGate({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      approvalManager: mockApprovalManager,
      config: createMockResolvedConfig(),
      cwd: testDir,
      likelyFiles: [],
      mode: 'chat',
      prompt: 'hello',
      projectScan: createMockProjectScan(),
    });

    expect(result.shouldProceed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.approved).toBe(false);
  });

  it('should create plan and request approval for large task', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockApprovalManager.request.mockResolvedValue({approved: true});

    const result = await checkPlanningGate({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      approvalManager: mockApprovalManager,
      config: createMockResolvedConfig({planning: {requireBeforeEdit: true, requireApproval: true, autoPlanForLargeTasks: true, largeTaskThreshold: 3}}),
      cwd: testDir,
      likelyFiles: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
      mode: 'feature',
      prompt: 'add new authentication module',
      projectScan: createMockProjectScan({
        buildCommand: 'npm run build',
        frameworks: ['react'],
        testCommand: 'npm test',
      }),
    });

    expect(result.shouldProceed).toBe(true);
    expect(result.approved).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockApprovalManager.request).toHaveBeenCalled();
  });

  it('should block execution if plan rejected', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockApprovalManager.request.mockResolvedValue({approved: false});

    const result = await checkPlanningGate({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      approvalManager: mockApprovalManager,
      config: createMockResolvedConfig({planning: {requireBeforeEdit: true, requireApproval: true, autoPlanForLargeTasks: true, largeTaskThreshold: 3}}),
      cwd: testDir,
      likelyFiles: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
      mode: 'feature',
      prompt: 'add new authentication module',
      projectScan: createMockProjectScan({
        buildCommand: 'npm run build',
        frameworks: ['react'],
        testCommand: 'npm test',
      }),
    });

    expect(result.shouldProceed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('Plan rejected by user');
  });

  it('should return planId in approval result', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockApprovalManager.request.mockResolvedValue({approved: true});

    const result = await checkPlanningGate({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      approvalManager: mockApprovalManager,
      config: createMockResolvedConfig({planning: {requireBeforeEdit: true, requireApproval: true, autoPlanForLargeTasks: true, largeTaskThreshold: 3}}),
      cwd: testDir,
      likelyFiles: ['src/file1.ts'],
      mode: 'feature',
      prompt: 'add feature',
      projectScan: createMockProjectScan(),
    });

    expect(result.planId).toBeTruthy();
    expect(result.planId).toMatch(/^plan-\d+$/);
  });

  it('should block execution for plan-only mode', async () => {
    const result = await checkPlanningGate({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      approvalManager: mockApprovalManager,
      config: createMockResolvedConfig(),
      cwd: testDir,
      likelyFiles: [],
      mode: 'chat',
      planOnly: true,
      prompt: 'analyze this code',
      projectScan: createMockProjectScan(),
    });

    expect(result.shouldProceed).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('plan-only mode');
  });
});
