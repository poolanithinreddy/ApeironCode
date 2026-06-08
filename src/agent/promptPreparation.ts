import type {ConversationSession} from './session.js';
import type {AgentMode} from './types.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {computeContextDelta, computeContextFingerprint, formatContextDeltaForPrompt, shouldUseFullContext} from '../context/contextDelta.js';
import {buildProviderPromptHints} from '../providers/promptHints.js';
import type {ProjectContextBundle} from './context.js';
import type {MemoryManager, RelevantMemory} from './memoryManager.js';
import {buildSystemPromptBundle} from './prompts.js';
import type {AgentWorkflow} from './workflows/types.js';
import {createTokenLedger, recordContextTokens, recordMemoryTokens, type TokenLedger} from '../tokens/accounting.js';
import {getModelTokenBudget, type TokenBudgetProfile} from '../tokens/providerBudgets.js';
import type {ToolRegistry} from '../tools/registry.js';
import {buildRuntimeBrainContext, formatRuntimeBrainContextForPrompt, type RuntimeBrainContext} from '../projectBrain/runtimeContext.js';

export interface PreparedPromptInputs {
  projectContext: ProjectContextBundle;
  relevantMemory: RelevantMemory;
  systemPrompt: string;
  tokenBudget: TokenBudgetProfile;
  tokenLedger: TokenLedger;
  /** Runtime Project Brain context (null when brain absent or intent doesn't need it). */
  runtimeBrainContext: RuntimeBrainContext | null;
}

export const preparePromptInputs = async ({
  cwd,
  eventBus,
  memoryManager,
  mode,
  prompt,
  projectContext,
  providerRoute,
  session,
  toolRegistry,
  workflow,
  lightweight = false,
}: {
  cwd: string;
  eventBus: EventBus;
  memoryManager: MemoryManager;
  mode: AgentMode;
  prompt: string;
  projectContext: ProjectContextBundle;
  providerRoute: {
    capabilities: {
      contextWindow?: number;
      jsonMode: boolean;
      local: boolean;
      nativeToolCalling: boolean;
      streaming: boolean;
      vision: boolean;
    };
    model: string;
    providerName: string;
  };
  session: ConversationSession;
  toolRegistry: ToolRegistry;
  workflow: AgentWorkflow | null;
  /**
   * Simple actions / pure chat: skip memory-graph injection, Project Brain,
   * and the heavy repo context dump so the payload stays tiny (no 413, no
   * stale session/task facts leaking into unrelated prompts).
   */
  lightweight?: boolean;
}): Promise<PreparedPromptInputs> => {
  const tokenBudget = getModelTokenBudget(providerRoute.providerName, providerRoute.model, mode);
  const relevantMemory: RelevantMemory = lightweight
    ? {content: '', entries: [], reasons: [], totalTokens: 0}
    : await memoryManager.loadRelevantMemory(prompt, 12, tokenBudget.memoryBudget);

  const brainCtx = lightweight
    ? null
    : await buildRuntimeBrainContext(cwd, prompt, {tokenBudget: 900}).catch(() => null);
  const brainContext = brainCtx ? formatRuntimeBrainContextForPrompt(brainCtx) : null;

  if (brainCtx?.routingPlan && brainCtx.routingPlan.executionMode !== 'no-agent') {
    eventBus.emit({
      message: `Brain routing: ${brainCtx.routingPlan.executionMode} (${brainCtx.intentResult.intent})`,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
  }
  const contextDelta = computeContextDelta(session.lastContextSnapshot, {
    files: projectContext.relevantFiles.map((file) => file.path),
    mode,
    promptContext: projectContext.promptContext,
  });
  const projectContextForPrompt = lightweight
    ? ''
    : shouldUseFullContext(contextDelta, mode)
      ? projectContext.promptContext
      : formatContextDeltaForPrompt(contextDelta);

  const builtPrompt = buildSystemPromptBundle({
    brainContext,
    modelId: providerRoute.model,
    mode,
    projectContext: projectContextForPrompt,
    providerId: providerRoute.providerName,
    providerPromptHints: buildProviderPromptHints({
      capabilities: providerRoute.capabilities,
      model: providerRoute.model,
      providerName: providerRoute.providerName,
    }),
    relevantMemory: relevantMemory.content,
    tools: toolRegistry.list(),
    workflow,
  });

  session.lastContextSnapshot = {
    files: projectContext.relevantFiles.map((file) => file.path),
    fingerprint: computeContextFingerprint({
      files: projectContext.relevantFiles.map((file) => file.path),
      mode,
      promptContext: projectContext.promptContext,
    }),
    mode,
    promptContext: projectContext.promptContext,
  };

  eventBus.emit({
    deltaTokens: contextDelta.tokenSavings,
    mode,
    timestamp: createEventTimestamp(),
    type: 'token.context_delta_used',
    useFullContext: shouldUseFullContext(contextDelta, mode),
  });
  eventBus.emit({
    maxTokens: tokenBudget.memoryBudget,
    selectedTokens: relevantMemory.totalTokens,
    timestamp: createEventTimestamp(),
    type: 'token.memory_budget_applied',
  });
  eventBus.emit({
    optimizedTokens: builtPrompt.report.optimizedTokens,
    originalTokens: builtPrompt.report.originalTokens,
    timestamp: createEventTimestamp(),
    type: 'token.prompt_optimized',
  });

  const tokenLedger = createTokenLedger();
  recordContextTokens(tokenLedger, projectContextForPrompt, contextDelta.tokenSavings);
  recordMemoryTokens(tokenLedger, relevantMemory.content);

  return {
    projectContext,
    relevantMemory,
    runtimeBrainContext: brainCtx,
    systemPrompt: builtPrompt.prompt,
    tokenBudget,
    tokenLedger,
  };
};
