import type {ResolvedConfig} from '../config/config.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {ToolRegistry} from '../tools/registry.js';
import {RepoMapManager} from '../context/repoMap.js';
import {scanProject, type ProjectScan} from './projectScanner.js';
import type {RelevantFile} from './relevance.js';
import {LspContextBuilder} from '../lsp/context.js';
import {
  formatDiagnosticsContextForPrompt,
  formatDiagnosticsContextForSummary,
  formatSymbolContextForPrompt,
  formatSymbolContextForSummary,
} from '../lsp/format.js';
import {LspManager} from '../lsp/manager.js';
import {LspDiagnosticsProvider} from '../lsp/diagnostics.js';
import {LspSymbolsProvider} from '../lsp/symbols.js';
import {packContext, formatPackedContext} from '../context/contextPacker.js';
import {summarizeFile} from '../context/fileSummaries.js';
import {buildTokenBudgetReport, formatTokenBudgetReport} from '../context/tokenBudget.js';
import {MemoryGraphStore} from '../memory/graphStore.js';
import {searchMemoryGraph, explainMemorySelection} from '../memory/graphSearch.js';
import {formatRelatedMemories} from '../memory/graphFormat.js';
import {buildImportGraph} from '../context/importGraph.js';
import {buildGitContext} from '../context/gitContext.js';
import {rankFiles, rankFilesV2, type FileRelevanceSignal, type FileRelevanceSignalV2} from '../context/ranker.js';
import {buildSymbolGraph, getFilesForSymbols} from '../context/symbolGraph.js';
import {buildTestSourceMap} from '../context/testMapper.js';
import {buildContextPlan} from '../context/contextPlan.js';
import {findAffectedFiles} from '../context/affectedFiles.js';
import {detectFrameworkHints} from '../context/repoMap.js';
import {extractFileMemorySignals, buildMemoryFileScores} from '../context/memorySignals.js';
import {loadProjectIgnorePatterns} from '../context/ignore.js';
import {buildProjectIndex} from '../context/indexer.js';
import {applyContextBudget, estimateTokensFromBytes} from '../context/budget.js';
import {extractRelevantSnippet} from '../context/chunker.js';
import {compressProjectContext} from '../context/compressor.js';
import type {AgentMode} from './types.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {trace} from '../utils/trace.js';
import {indexProjectBrainForContext} from '../projectBrain/indexer.js';
import {formatProjectBrainSummary, buildProjectBrainSummary} from '../projectBrain/reader.js';

interface BuildProjectContextOptions {
  approvalManager: ApprovalManager;
  config: ResolvedConfig;
  cwd: string;
  eventBus?: EventBus;
  mode?: AgentMode;
  prompt: string;
  toolRegistry: ToolRegistry;
}

export interface ProjectContextBundle {
  codeIntelligenceSummary: string;
  contextSelectionExplanation: string;
  contextSelectionSummary: string;
  memoryGraphSummary: string;
  plan: string | null;
  promptContext: string;
  projectScan: ProjectScan;
  relevantFiles: RelevantFile[];
}

const shouldUsePlanningMode = (prompt: string): boolean => {
  const lowerPrompt = prompt.toLowerCase();
  return (
    prompt.trim().split(/\s+/u).length >= 6 ||
    /fix|debug|implement|refactor|review|explain|diagnose|test|doctor|provider|session/u.test(lowerPrompt)
  );
};

const buildPlan = (prompt: string, relevantFiles: RelevantFile[], projectScan: ProjectScan): string | null => {
  if (!shouldUsePlanningMode(prompt)) {
    return null;
  }

  const likelyFiles = relevantFiles.slice(0, 4).map((file) => file.path);
  const steps = [
    '1. Confirm the project shape, commands, and relevant runtime surface.',
    likelyFiles.length > 0
      ? `2. Inspect the most relevant files first: ${likelyFiles.join(', ')}.`
      : '2. Inspect the most relevant files surfaced by project context.',
    '3. Use read-only tools first, then propose edits or commands only when justified.',
    projectScan.testCommand || projectScan.lintCommand || projectScan.buildCommand
      ? `4. Validate with ${projectScan.testCommand ?? projectScan.lintCommand ?? projectScan.buildCommand} when changes are made.`
      : '4. Validate with the narrowest available command after making changes.',
  ];

  return [
    'Understanding:',
    `- Task: ${prompt}`,
    `- Project: ${projectScan.projectName}`,
    `- Likely files: ${likelyFiles.length > 0 ? likelyFiles.join(', ') : 'none identified yet'}`,
    'Plan:',
    ...steps,
  ].join('\n');
};

const shouldLoadDocumentSymbols = (mode?: AgentMode): boolean => {
  return mode === 'debug' || mode === 'review' || mode === 'refactor';
};

const shouldLoadDiagnostics = (mode?: AgentMode): boolean => {
  return mode === 'debug' || mode === 'fix' || mode === 'test-fix' || mode === 'review' || mode === 'refactor';
};

const convertSignalToRelevantFile = (
  signal: FileRelevanceSignal,
  indexedPreviews: Map<string, {preview: string; size: number}>,
  keywords: string[],
): RelevantFile => {
  const indexed = indexedPreviews.get(signal.path);
  const snippet = indexed
    ? indexed.preview
      ? extractRelevantSnippet(indexed.preview, keywords)
      : `Non-text or large file (${indexed.size} bytes).`
    : 'File content not indexed.';

  return {
    estimatedTokens: indexed ? estimateTokensFromBytes(indexed.size) : 0,
    path: signal.path,
    reason: signal.signals,
    score: signal.score,
    size: indexed?.size ?? 0,
    snippet,
  };
};

const formatContextSelectionExplanation = (signals: FileRelevanceSignal[], mode?: AgentMode): string => {
  if (signals.length === 0) {
    return 'Context selection: No files ranked above threshold using multi-signal analysis.';
  }

  const topSignals = signals.slice(0, 5);
  const lines = [
    `Context selection (${signals.length} files analyzed):`,
    '',
    `Mode: ${mode ?? 'default'} — adjusted signal weights accordingly`,
    '',
    'Top ranked files:',
  ];

  for (const signal of topSignals) {
    const componentScores = [
      `name=${signal.components.nameMatch.toFixed(2)}`,
      `prompt=${signal.components.promptTermMatch.toFixed(2)}`,
      `imports=${signal.components.importGraph.toFixed(2)}`,
      `git=${signal.components.gitRecency.toFixed(2)}`,
      `memory=${signal.components.memoryRelevance.toFixed(2)}`,
      `diag=${signal.components.lspDiagnostics.toFixed(2)}`,
      `changed=${signal.components.changedFile.toFixed(2)}`,
    ];
    lines.push(`  ${signal.path} (score=${signal.score.toFixed(3)})`);
    lines.push(`    Signals: ${signal.signals.join(', ') || 'no signals'}`);
    lines.push(`    Components: ${componentScores.join(', ')}`);
  }

  if (signals.length > topSignals.length) {
    lines.push(`\n  ... and ${signals.length - topSignals.length} more files below threshold`);
  }

  return lines.join('\n');
};

const getTopRelevantPaths = (relevantFiles: RelevantFile[], maxFiles = 2): string[] => {
  return Array.from(new Set(relevantFiles.map((file) => file.path))).slice(0, maxFiles);
};

export const buildProjectContext = async ({
  approvalManager,
  config,
  cwd,
  eventBus,
  mode,
  prompt,
  toolRegistry,
}: BuildProjectContextOptions): Promise<ProjectContextBundle> => trace('context.build', async () => {
  const executionContext = {
    approvalManager,
    config: config.effective,
    cwd,
  };
  const [packageInfo, projectTree, projectScan] = await Promise.all([
    toolRegistry.invoke('package_info', {}, executionContext),
    toolRegistry.invoke('project_tree', {depth: 2}, executionContext),
    scanProject(cwd),
  ]);

  const ignorePatterns = Array.from(
    new Set([...(await loadProjectIgnorePatterns(cwd)), ...config.effective.ignoredPaths]),
  );
  const projectIndex = await buildProjectIndex(cwd, ignorePatterns);

  const [importGraph, gitContext] = await Promise.all([
    buildImportGraph(projectIndex.map((e) => e.path), cwd),
    buildGitContext(cwd),
  ]);

  const memoryGraph = await new MemoryGraphStore(cwd).load();
  const memorySearchQuery = [
    prompt,
    ...projectIndex.slice(0, 3).map((e) => e.path),
  ].join(' ');
  const relatedMemory = searchMemoryGraph(memoryGraph, memorySearchQuery, 6);

  const memorySignals = extractFileMemorySignals(relatedMemory);
  const memoryFileScores = buildMemoryFileScores(memorySignals);

  const indexedFiles = new Map(projectIndex.map((e) => [e.path, {preview: e.preview, size: e.size}]));
  const allFiles = projectIndex.map((e) => e.path);

  const changedFiles = gitContext.uncommittedFiles.concat(gitContext.stagedFiles);

  const warnings: string[] = [];
  let symbolGraph: Awaited<ReturnType<typeof buildSymbolGraph>> | undefined;
  let testSourceMap: Awaited<ReturnType<typeof buildTestSourceMap>> | undefined;
  try {
    symbolGraph = await buildSymbolGraph({cwd, files: allFiles, importGraph});
  } catch (error) {
    warnings.push(`symbol graph unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    testSourceMap = await buildTestSourceMap(allFiles, cwd);
  } catch (error) {
    warnings.push(`test mapper unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const symbolQueryMatches = symbolGraph ? new Set(getFilesForSymbols(prompt, symbolGraph)) : undefined;

  const affected = changedFiles.length > 0
    ? findAffectedFiles(changedFiles, {importGraph, symbolGraph, testSourceMap})
    : undefined;

  const frameworkHints = detectFrameworkHints(allFiles);

  const contextPlan = buildContextPlan(prompt, allFiles, {
    affected,
    changedFiles,
    knownFiles: allFiles,
    symbolFiles: symbolQueryMatches ? [...symbolQueryMatches] : undefined,
    testFiles: testSourceMap ? [...testSourceMap.testsForSource.keys()] : undefined,
  }, mode);

  const v2Signals: FileRelevanceSignalV2[] = rankFilesV2(allFiles, prompt, {
    cwd,
    prompt,
    mode,
    importGraph,
    gitContext,
    memoryFileScores: memoryFileScores.size > 0 ? memoryFileScores : undefined,
    changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    symbolGraph,
    symbolQueryMatches,
    testSourceMap,
    contextPlan,
    affected,
    frameworkHints,
  });

  const fileSignals: FileRelevanceSignal[] = v2Signals.length > 0
    ? v2Signals.map((s) => ({components: {
        changedFile: s.components.changedFile,
        gitRecency: s.components.gitRecency,
        importGraph: s.components.importGraph,
        lspDiagnostics: s.components.lspDiagnostics,
        memoryRelevance: s.components.memoryRelevance,
        nameMatch: s.components.nameMatch,
        promptTermMatch: s.components.promptTermMatch,
      }, path: s.path, score: s.score, signals: s.signals}))
    : rankFiles(allFiles, prompt, {
        cwd,
        prompt,
        mode,
        importGraph,
        gitContext,
        memoryFileScores: memoryFileScores.size > 0 ? memoryFileScores : undefined,
        changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
      });

  const keywordSet = new Set(
    prompt
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/u)
      .filter((w) => w.length >= 3),
  );

  const relevantFiles = applyContextBudget(
    fileSignals.map((signal) => convertSignalToRelevantFile(signal, indexedFiles, Array.from(keywordSet))),
    {
      maxBytes: config.effective.maxFileSize * Math.max(1, Math.floor(config.effective.maxContextFiles / 2)),
      maxFiles: config.effective.maxContextFiles,
      maxTokens: config.effective.maxContextFiles * 800,
    },
  );

  const contextSelectionExplanation = formatContextSelectionExplanation(fileSignals, mode);

  const repoMapManager = new RepoMapManager(cwd);
  const repoMap = shouldUsePlanningMode(prompt)
    ? (await repoMapManager.ensureFreshMap(cwd)).map
    : null;

  const plan = buildPlan(prompt, relevantFiles, projectScan);

  // Build LSP context
  const codeIntelligencePaths = getTopRelevantPaths(relevantFiles);
  const projectLanguages = projectScan.languages.length > 0
    ? projectScan.languages
    : ['TypeScript', 'JavaScript', 'Python'];
  const lspManager = new LspManager(config.effective.lsp);
  const lspBuilder = new LspContextBuilder(lspManager);
  const [symbolContextResults, diagnosticsContextResults] = await Promise.all([
    shouldLoadDocumentSymbols(mode) && codeIntelligencePaths.length > 0
      ? (() => {
          const provider = new LspSymbolsProvider(lspManager);
          return Promise.all(
            codeIntelligencePaths.map((filePath) => provider.getFileSymbolsDetailed(filePath, {cwd, timeout: 2000})),
          );
        })()
      : Promise.resolve([]),
    shouldLoadDiagnostics(mode) && codeIntelligencePaths.length > 0
      ? (() => {
          const provider = new LspDiagnosticsProvider(lspManager);
          return Promise.all(
            codeIntelligencePaths.map((filePath) => provider.getFileDiagnostics(filePath, {cwd, timeout: 2000})),
          );
        })()
      : Promise.resolve([]),
  ]);
  const lspSummary = await lspBuilder.buildSummary(projectLanguages);
  const lspContextText = lspBuilder.formatContextForPrompt(lspSummary);
  const diagnosticsContextText = formatDiagnosticsContextForPrompt(diagnosticsContextResults);
  const diagnosticsContextSummary = formatDiagnosticsContextForSummary(diagnosticsContextResults);
  const symbolContextText = formatSymbolContextForPrompt(symbolContextResults);
  const symbolContextSummary = formatSymbolContextForSummary(symbolContextResults);
  const codeIntelligencePromptText = [
    lspContextText,
    diagnosticsContextText,
    symbolContextText,
  ].filter(Boolean).join('\n\n');
  const codeIntelligenceSummary = [
    lspBuilder.formatContextForSummary(lspSummary),
    symbolContextSummary,
    diagnosticsContextSummary,
  ].filter(Boolean).join('\n');
  const topSummaryPaths = getTopRelevantPaths(relevantFiles, Math.min(config.effective.maxContextFiles, 8));
  const fileSummaries = (await Promise.all(
    topSummaryPaths.map(async (filePath) => {
      try {
        return await summarizeFile(cwd, filePath);
      } catch {
        return null;
      }
    }),
  )).filter((summary): summary is NonNullable<typeof summary> => summary !== null);
  const packedContext = packContext(fileSummaries, 2_500);
  const tokenBudgetReport = buildTokenBudgetReport(packedContext.selected.map((summary) => summary.summary), 2_500);
  const contextSelectionSummary = [
    'Context selection (multi-signal ranking):',
    formatPackedContext(packedContext),
    formatTokenBudgetReport(tokenBudgetReport),
  ].join('\n');
  const tokenEfficiency = config.effective.tokenEfficiency ?? {
    context: {maxFullFiles: 4, maxSummaryFiles: 8},
    enabled: true,
  };
  const compressedRelevantContext = tokenEfficiency.enabled
    ? compressProjectContext(
        relevantFiles.map((file) => ({
          content: file.snippet,
          path: file.path,
          reason: file.reason.join(', ') || 'heuristic match',
          score: file.score,
        })),
        {
          maxFullFiles: tokenEfficiency.context.maxFullFiles,
          maxSummaryFiles: tokenEfficiency.context.maxSummaryFiles,
          maxTokens: Math.max(800, tokenEfficiency.context.maxFullFiles * 500 + tokenEfficiency.context.maxSummaryFiles * 120),
          mode,
          preserveFiles: changedFiles,
        },
      )
    : null;
  const memoryGraphPromptText = relatedMemory.length > 0
    ? [
        'Related memory graph facts:',
        formatRelatedMemories(relatedMemory),
        'Memory selection why:',
        explainMemorySelection(relatedMemory),
      ].join('\n')
    : 'No related memory graph facts found.';
  const memoryGraphSummary = relatedMemory.length > 0
    ? `Memory graph facts used: ${relatedMemory.map((result) => `${result.entity.name} (${result.entity.type})`).join(', ')}`
    : 'Memory graph facts used: none';
  const projectBrainChunks = await indexProjectBrainForContext(cwd, {maxTokens: 900});
  const projectBrainSummary = await buildProjectBrainSummary(cwd, {requireTrustForWorkflows: true});
  const projectBrainPromptText = projectBrainChunks.length > 0
    ? [
        formatProjectBrainSummary(projectBrainSummary),
        ...projectBrainChunks.map((chunk) => [
          `PROJECT BRAIN: ${chunk.path}`,
          chunk.content,
        ].join('\n')),
      ].join('\n\n')
    : 'No Project Brain initialized.';

  const promptContext = [
    `Working directory: ${cwd}`,
    'Project summary:',
    projectScan.projectSummary,
    'Project metadata:',
    packageInfo.output || 'Unavailable.',
    'Project scan summary:',
    JSON.stringify(projectScan, null, 2),
    'Project tree (depth 2):',
    projectTree.output || 'Unavailable.',
    'Repository map highlights:',
    repoMap
      ? repoMapManager.getImportantFiles(repoMap).join(', ') || 'No important files identified from the repository map.'
      : 'Repository map not loaded for this request.',
    codeIntelligencePromptText ? `Code Intelligence:\n${codeIntelligencePromptText}` : '',
    'Repo brain packed context:',
    packedContext.selected.length > 0
      ? packedContext.selected.map((summary) => summary.summary).join('\n\n')
      : 'No repo-brain file summaries selected.',
    'Repo brain budget:',
    formatTokenBudgetReport(tokenBudgetReport),
    'Memory graph:',
    memoryGraphPromptText,
    'Project Brain:',
    projectBrainPromptText,
    'Relevant file excerpts:',
    compressedRelevantContext
      ? [
          `Context compression: ${compressedRelevantContext.explanation}; ratio=${compressedRelevantContext.compressionRatio}`,
          ...compressedRelevantContext.fullFiles.map((file) => [
            `FILE: ${file.path}`,
            `Reason: ${file.reason}`,
            file.content,
          ].join('\n')),
          ...compressedRelevantContext.summarizedFiles.map((file) => [
            `FILE SUMMARY: ${file.path}`,
            `Reason: ${file.reason}`,
            file.summary,
          ].join('\n')),
          compressedRelevantContext.omittedFiles.length > 0
            ? `Omitted files: ${compressedRelevantContext.omittedFiles.map((file) => `${file.path} (${file.reason})`).join(', ')}`
            : '',
        ].filter(Boolean).join('\n\n')
      : relevantFiles.length > 0
        ? relevantFiles
          .map((file) => {
            return [
              `FILE: ${file.path}`,
              `Score: ${file.score}`,
              `Reasons: ${file.reason.join(', ') || 'heuristic match'}`,
              file.snippet,
            ].join('\n');
          })
          .join('\n\n')
        : 'No strongly relevant files were identified from the current prompt.',
    'Project memory:',
    config.projectMemory ? config.projectMemory : 'No project memory available.',
  ].filter(Boolean).join('\n\n');

  const bundle = {
    codeIntelligenceSummary,
    contextSelectionExplanation,
    contextSelectionSummary,
    memoryGraphSummary,
    plan,
    projectScan,
    promptContext,
    relevantFiles,
  };

  if (eventBus) {
    eventBus.emit({
      fileCount: relevantFiles.length,
      files: relevantFiles.map((f) => ({
        path: f.path,
        reason: f.reason,
        score: f.score,
      })),
      mode,
      omittedFiles: contextPlan.excludedFiles.slice(0, 20).map((e) => e.path),
      prompt,
      relatedFiles: contextPlan.relatedFiles.slice(0, 20),
      summaryFiles: contextPlan.summaryFiles.slice(0, 20),
      taskType: contextPlan.taskType,
      testFiles: contextPlan.testFiles.slice(0, 20),
      timestamp: createEventTimestamp(),
      tokenBudgetEstimate: contextPlan.tokenBudget,
      type: 'context.selected',
      warnings: warnings.length > 0 ? warnings : undefined,
    });
    if (compressedRelevantContext) {
      eventBus.emit({
        compressionRatio: compressedRelevantContext.compressionRatio,
        fullFiles: compressedRelevantContext.fullFiles.length,
        omittedFiles: compressedRelevantContext.omittedFiles.length,
        summarizedFiles: compressedRelevantContext.summarizedFiles.length,
        timestamp: createEventTimestamp(),
        tokenEstimate: compressedRelevantContext.tokenEstimate,
        type: 'context.compressed',
      });
    }
  }

  return bundle;
}, {cwd, mode});
