/**
 * Bridge handlers for Phase 16G.2 brain intelligence messages.
 * Extracted to keep server.ts under the 600-line file limit.
 */

import type {BridgeMessage} from './types.js';
import {createBridgeMessage, createBridgeErrorMessage} from './types.js';
import {sanitizeBridgeMessage} from './redaction.js';
import type {BridgeConnection} from './transport/types.js';
import {
  readProjectBrain,
  buildRuntimeBrainContext,
  formatRuntimeBrainContextDebug,
  formatRuntimeBrainIntent,
  createProjectBrainSyncPreview,
  applyProjectBrainSync,
  formatProjectBrainSyncResult,
  createAgentRoutingPlan,
  formatAgentRoutingPlan,
  selectBrainFilesForPrompt,
  explainBrainContextSelection,
  listSyncPreviews,
  getSyncPreview,
  formatSyncPreviewList,
  createLargeAppBuildOrchestration,
  formatLargeAppOrchestration,
} from '../projectBrain/index.js';

type SendFn = BridgeConnection['send'];

export const handleBrainIntelligenceMessage = async (
  msg: BridgeMessage,
  send: SendFn,
  cwd: string,
): Promise<boolean> => {
  const requestId = msg.requestId ?? msg.id;
  if (msg.type === 'brain.route') {
    const prompt = typeof msg.payload['prompt'] === 'string' ? msg.payload['prompt'].slice(0, 4_000) : '';
    const plan = createAgentRoutingPlan(prompt, {maxAgents: 3, maxSkills: 3});
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.route', {plan, text: formatAgentRoutingPlan(plan)}, {requestId})));
    return true;
  }
  if (msg.type === 'brain.context') {
    const prompt = typeof msg.payload['prompt'] === 'string' ? msg.payload['prompt'].slice(0, 4_000) : '';
    const brain = await readProjectBrain(cwd);
    const selection = selectBrainFilesForPrompt(prompt, brain.summary);
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.context', {selection, text: explainBrainContextSelection(selection)}, {requestId})));
    return true;
  }
  if (msg.type === 'brain.previews') {
    const previews = await listSyncPreviews(cwd);
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.previews', {previews, text: formatSyncPreviewList(previews), count: previews.length}, {requestId})));
    return true;
  }
  if (msg.type === 'brain.preview_show') {
    const id = typeof msg.payload['id'] === 'string' ? msg.payload['id'] : '';
    const stored = id ? await getSyncPreview(id, cwd) : null;
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.preview_show', {
      found: !!stored, preview: stored ?? null,
      text: stored ? `Preview ${stored.id}: ${stored.changesSummary}` : 'Preview not found.',
    }, {requestId})));
    return true;
  }
  if (msg.type === 'brain.preview_apply') {
    const approved = msg.payload['approved'] === true;
    const previewPayload = msg.payload['preview'];
    const preview = typeof previewPayload === 'object' && previewPayload !== null
      ? (previewPayload as Parameters<typeof applyProjectBrainSync>[0])
      : await createProjectBrainSyncPreview({}, {cwd, mode: 'ask'});
    const result = await applyProjectBrainSync(preview, {approved});
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.preview_apply', {result, text: formatProjectBrainSyncResult(result)}, {requestId})));
    return true;
  }
  if (msg.type === 'brain.runtime') {
    const prompt = typeof msg.payload['prompt'] === 'string' ? msg.payload['prompt'].slice(0, 4_000) : '';
    const ctx = await buildRuntimeBrainContext(cwd, prompt);
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.runtime', {
      intent: ctx.intentResult.intent,
      confidence: ctx.intentResult.confidence,
      useBrain: ctx.intentResult.useBrain,
      brainPresent: ctx.brainPresent,
      estimatedTokens: ctx.estimatedTokens,
      warnings: ctx.warnings,
      text: formatRuntimeBrainIntent(ctx.intentResult),
    }, {requestId})));
    return true;
  }
  if (msg.type === 'brain.explain') {
    const prompt = typeof msg.payload['prompt'] === 'string' ? msg.payload['prompt'].slice(0, 4_000) : '';
    const ctx = await buildRuntimeBrainContext(cwd, prompt);
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.explain', {
      debug: formatRuntimeBrainContextDebug(ctx),
      intent: ctx.intentResult.intent,
      brainPresent: ctx.brainPresent,
      estimatedTokens: ctx.estimatedTokens,
      debugExplanation: ctx.debugExplanation,
      warnings: ctx.warnings,
    }, {requestId})));
    return true;
  }
  if (msg.type === 'brain.orchestrate_app') {
    const prompt = typeof msg.payload['prompt'] === 'string' ? msg.payload['prompt'].slice(0, 8_000) : '';
    if (!prompt) {
      await send(createBridgeErrorMessage('BRAIN_ORCHESTRATE_MISSING_PROMPT', 'prompt required', requestId));
      return true;
    }
    const orch = createLargeAppBuildOrchestration(prompt);
    await send(sanitizeBridgeMessage(createBridgeMessage('brain.orchestrate_app', {
      phases: orch.phases.length, stack: orch.stack,
      agents: orch.suggestedAgents.map((a) => a.name),
      skills: orch.suggestedSkills, suggestsProjectBrain: orch.suggestsProjectBrain,
      text: formatLargeAppOrchestration(orch),
    }, {requestId})));
    return true;
  }
  return false;
};
