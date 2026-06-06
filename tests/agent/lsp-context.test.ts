import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {ResolvedConfig} from '../../src/config/config.js';
import {buildProjectContext} from '../../src/agent/context.js';
import {createMockConfig} from '../support/mocks.js';

const {
  buildSummaryMock,
  buildProjectIndexMock,
  buildImportGraphMock,
  buildGitContextMock,
  ensureFreshMapMock,
  formatContextForPromptMock,
  formatContextForSummaryMock,
  getFileDiagnosticsMock,
  getFileSymbolsDetailedMock,
  getImportantFilesMock,
  loadProjectIgnoreMock,
  memoryGraphLoadMock,
  rankRelevantFilesMock,
  scanProjectMock,
  searchMemoryMock,
} = vi.hoisted(() => ({
  buildSummaryMock: vi.fn(),
  buildProjectIndexMock: vi.fn(),
  buildImportGraphMock: vi.fn(),
  buildGitContextMock: vi.fn(),
  ensureFreshMapMock: vi.fn(),
  formatContextForPromptMock: vi.fn(),
  formatContextForSummaryMock: vi.fn(),
  getFileDiagnosticsMock: vi.fn(),
  getFileSymbolsDetailedMock: vi.fn(),
  getImportantFilesMock: vi.fn(),
  loadProjectIgnoreMock: vi.fn(),
  memoryGraphLoadMock: vi.fn(),
  rankRelevantFilesMock: vi.fn(),
  scanProjectMock: vi.fn(),
  searchMemoryMock: vi.fn(),
}));

vi.mock('../../src/agent/projectScanner.js', () => ({
  scanProject: scanProjectMock,
}));

vi.mock('../../src/agent/relevance.js', () => ({
  rankRelevantFiles: rankRelevantFilesMock,
}));

vi.mock('../../src/context/indexer.js', () => ({
  buildProjectIndex: buildProjectIndexMock,
}));

vi.mock('../../src/context/importGraph.js', () => ({
  buildImportGraph: buildImportGraphMock,
}));

vi.mock('../../src/context/gitContext.js', () => ({
  buildGitContext: buildGitContextMock,
}));

vi.mock('../../src/context/ignore.js', () => ({
  loadProjectIgnorePatterns: loadProjectIgnoreMock,
}));

vi.mock('../../src/memory/graphStore.js', () => ({
  MemoryGraphStore: class {
    load = memoryGraphLoadMock;
  },
}));

vi.mock('../../src/memory/graphSearch.js', () => ({
  searchMemoryGraph: searchMemoryMock,
  explainMemorySelection: vi.fn(() => 'Memory selection explanation'),
}));

vi.mock('../../src/context/repoMap.js', () => ({
  RepoMapManager: class {
    ensureFreshMap = ensureFreshMapMock;
    getImportantFiles = getImportantFilesMock;
  },
  detectFrameworkHints: () => [],
  detectPackageBoundaries: () => [],
  summarizeRepoMap: () => '',
  buildRepoMap: () => Promise.resolve(null),
}));

vi.mock('../../src/lsp/context.js', () => ({
  LspContextBuilder: class {
    buildSummary = buildSummaryMock;
    formatContextForPrompt = formatContextForPromptMock;
    formatContextForSummary = formatContextForSummaryMock;
  },
}));

vi.mock('../../src/lsp/symbols.js', () => ({
  LspSymbolsProvider: class {
    getFileSymbolsDetailed = getFileSymbolsDetailedMock;
  },
}));

vi.mock('../../src/lsp/diagnostics.js', () => ({
  LspDiagnosticsProvider: class {
    getFileDiagnostics = getFileDiagnosticsMock;
  },
}));

const createResolvedConfig = (): ResolvedConfig => {
  const effective = createMockConfig();
  return {
    effective,
    ignorePatterns: [],
    project: {},
    projectMemory: null,
    user: effective,
  };
};

describe('buildProjectContext LSP diagnostics integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    scanProjectMock.mockResolvedValue({
      buildCommand: 'npm run build',
      configFiles: ['package.json'],
      entrypoints: ['src/index.ts'],
      frameworks: ['TypeScript'],
      git: {
        branch: 'main',
        changedFiles: 0,
        changedPaths: [],
        isRepo: true,
      },
      languages: ['TypeScript'],
      lintCommand: 'npm run lint',
      manifests: [],
      monorepo: false,
      packageManager: 'npm',
      projectName: 'opencode',
      projectSummary: 'TypeScript CLI project',
      sourceDirectories: ['src'],
      testCommand: 'npm test',
      workspaces: [],
    });

    loadProjectIgnoreMock.mockResolvedValue([]);

    buildProjectIndexMock.mockResolvedValue([
      {
        kind: 'source',
        path: 'src/auth.ts',
        preview: 'export const login = async () => {}',
        size: 120,
        symbols: [],
        imports: [],
      },
      {
        kind: 'test',
        path: 'src/auth.test.ts',
        preview: 'it("logs in", () => {})',
        size: 80,
        symbols: [],
        imports: [],
      },
      {
        kind: 'source',
        path: 'src/unused.ts',
        preview: 'export const unused = true;',
        size: 40,
        symbols: [],
        imports: [],
      },
    ]);

    buildImportGraphMock.mockResolvedValue(new Map());
    buildGitContextMock.mockResolvedValue({
      currentBranch: 'main',
      recentFiles: [],
      uncommittedFiles: [],
      stagedFiles: [],
      recentAuthors: [],
      recentCommitMessages: [],
    });

    memoryGraphLoadMock.mockResolvedValue({
      entities: [],
      edges: [],
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });

    searchMemoryMock.mockReturnValue([]);

    rankRelevantFilesMock.mockResolvedValue([
      {
        estimatedTokens: 32,
        path: 'src/auth.ts',
        reason: ['auth logic'],
        score: 90,
        size: 120,
        snippet: 'export const login = async () => {}',
      },
      {
        estimatedTokens: 28,
        path: 'src/auth.test.ts',
        reason: ['failing tests'],
        score: 80,
        size: 80,
        snippet: 'it("logs in", () => {})',
      },
      {
        estimatedTokens: 12,
        path: 'src/unused.ts',
        reason: ['low score'],
        score: 10,
        size: 40,
        snippet: 'export const unused = true;',
      },
    ]);
    buildSummaryMock.mockResolvedValue({
      availableServers: ['typescript-language-server'],
      diagnostics: [],
      enabled: true,
      languages: ['TypeScript'],
      missingServers: [],
      mode: 'lsp',
      notes: [],
      symbols: [],
    });
    formatContextForPromptMock.mockReturnValue('LSP code intelligence is available:\n- typescript-language-server');
    formatContextForSummaryMock.mockReturnValue('Code Intelligence: LSP (typescript-language-server)');
    ensureFreshMapMock.mockResolvedValue({map: {}});
    getImportantFilesMock.mockReturnValue(['src/auth.ts']);
    getFileSymbolsDetailedMock.mockResolvedValue({
      file: 'src/auth.ts',
      source: 'live-lsp',
      status: {
        installed: true,
        language: 'TypeScript',
        serverCommand: 'typescript-language-server',
        serverName: 'typescript-language-server',
        status: 'available',
        workspaceApplicable: true,
      },
      symbols: [],
    });
  });

  it('includes capped compact diagnostics in debug mode prompt context', async () => {
    const diagnostics = Array.from({length: 12}, (_, index) => ({
      character: 8,
      code: `TS23${index + 1}`,
      file: 'src/auth.ts',
      line: index + 1,
      message: `issue-${index + 1}`,
      severity: 'error' as const,
      source: 'lsp' as const,
    }));
    getFileDiagnosticsMock
      .mockResolvedValueOnce({
        diagnostics,
        filePath: 'src/auth.ts',
        source: 'live-lsp',
      })
      .mockResolvedValueOnce({
        diagnostics: [],
        filePath: 'src/auth.test.ts',
        source: 'live-lsp',
      });

    const toolRegistry = {
      invoke: vi.fn((toolName: string) => ({
        ok: true,
        output: toolName === 'package_info' ? 'mock package info' : 'mock tree',
        summary: `${toolName} ok`,
      })),
    };

    const result = await buildProjectContext({
      approvalManager: {} as never,
      config: createResolvedConfig(),
      cwd: '/workspace/opencode',
      mode: 'debug',
      prompt: 'debug auth failure',
      toolRegistry: toolRegistry as never,
    });

    expect(getFileDiagnosticsMock).toHaveBeenCalledTimes(2);
    expect(getFileDiagnosticsMock).toHaveBeenNthCalledWith(1, 'src/auth.ts', {cwd: '/workspace/opencode', timeout: 2000});
    expect(getFileDiagnosticsMock).toHaveBeenNthCalledWith(2, 'src/auth.test.ts', {cwd: '/workspace/opencode', timeout: 2000});
    expect(result.promptContext).toContain('Code Intelligence:');
    expect(result.promptContext).toContain('Diagnostics source: live LSP');
    expect(result.promptContext).toContain('Files checked: 2');
    expect(result.promptContext).toContain('Diagnostics found: 12');
    expect(result.promptContext).toContain('src/auth.ts:10:8 error TS2310 issue-10');
    expect(result.promptContext).not.toContain('issue-11');
    expect(result.codeIntelligenceSummary).toContain('Diagnostics source: live LSP');
    expect(result.codeIntelligenceSummary).toContain('Files checked: 2');
    expect(result.codeIntelligenceSummary).toContain('Diagnostics found: 12');
  });

  it('includes fallback diagnostics notes when LSP is unavailable', async () => {
    getFileDiagnosticsMock
      .mockResolvedValueOnce({
        diagnostics: [],
        filePath: 'src/auth.ts',
        reason: 'TypeScript LSP unavailable',
        source: 'fallback-analysis',
      })
      .mockResolvedValueOnce({
        diagnostics: [],
        filePath: 'src/auth.test.ts',
        reason: 'TypeScript LSP unavailable',
        source: 'fallback-analysis',
      });

    const toolRegistry = {
      invoke: vi.fn((toolName: string) => ({
        ok: true,
        output: toolName === 'package_info' ? 'mock package info' : 'mock tree',
        summary: `${toolName} ok`,
      })),
    };

    const result = await buildProjectContext({
      approvalManager: {} as never,
      config: createResolvedConfig(),
      cwd: '/workspace/opencode',
      mode: 'fix',
      prompt: 'fix auth types',
      toolRegistry: toolRegistry as never,
    });

    expect(getFileDiagnosticsMock).toHaveBeenCalledTimes(2);
    expect(result.promptContext).toContain('Diagnostics source: fallback analysis');
    expect(result.promptContext).toContain('Reason: TypeScript LSP unavailable');
    expect(result.promptContext).toContain('No live diagnostics available');
    expect(result.codeIntelligenceSummary).toContain('Diagnostics source: fallback analysis');
    expect(result.codeIntelligenceSummary).toContain('Files checked: 2');
    expect(result.codeIntelligenceSummary).toContain('Diagnostics found: 0');
    expect(result.codeIntelligenceSummary).toContain('LSP fallback reason: TypeScript LSP unavailable');
  });
});