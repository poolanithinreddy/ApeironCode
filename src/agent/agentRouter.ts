import type {ResolvedConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import type {ProviderRoutingResult} from '../providers/router.js';
import type {RoutedProvider} from '../providers/router.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {SessionStore} from '../sessions/store.js';
import type {ToolRegistry} from '../tools/registry.js';
import {hasWorkspaceAppFiles} from './appWorkspaceDetection.js';
import {runAutonomousCodingSession, shouldRunAutonomousCoding} from './codingAgentRuntime.js';
import {runCombinedRequest} from './combinedActionRuntime.js';
import {runDirectSimpleAction} from './directSimpleActionRuntime.js';
import type {EffectiveModeReason} from './effectiveMode.js';
import {detectErrorPaste} from './errorPasteIntent.js';
import {runErrorFix} from './errorFixRuntime.js';
import {decomposeUserRequest} from './requestDecomposition.js';
import {detectAppActionRequest, runRunApp} from './runAppRuntime.js';
import type {ConversationSession} from './session.js';
import {canExecuteSimpleActionDirectly} from './simpleActionExecutor.js';
import {detectSimpleAction} from './simpleActionRouter.js';
import type {AgentMode, AgentRunOptions, AgentRunResult, AgentTaskState} from './types.js';

export interface AgentRouterContext {
  approvalManager: ApprovalManager;
  config: ResolvedConfig;
  cwd: string;
  eventBus: EventBus;
  mode: AgentMode;
  modeReason: EffectiveModeReason;
  options: AgentRunOptions;
  provider: RoutedProvider;
  routing: ProviderRoutingResult;
  session: ConversationSession;
  sessionStore: SessionStore;
  taskState: AgentTaskState;
  toolRegistry: ToolRegistry;
  transcriptPath: string;
}

export type AgentRouteOutcome =
  | {handled: true; result: AgentRunResult; workspaceHasAppFiles: boolean}
  | {handled: false; workspaceHasAppFiles: boolean};

/**
 * Runs the deterministic short-circuit routing chain. Returns a handled
 * AgentRunResult when one of the structured runtimes owns the request, or
 * `handled: false` so the caller falls through to the generic agent loop.
 *
 * Routing order (each step short-circuits on match):
 *  1. Combined multi-action request (decomposeUserRequest >= 2)
 *  2. Pasted runtime/build error
 *  3. Run / build-fix request for an app
 *  4. Autonomous coding (build / modify / repair app via file plan)
 *  5. Simple deterministic action (provider-free filesystem op)
 */
export const tryRouteShortCircuit = async (
  ctx: AgentRouterContext,
): Promise<AgentRouteOutcome> => {
  const {
    approvalManager, config, cwd, eventBus, mode, modeReason, options, provider,
    routing, session, sessionStore, taskState, toolRegistry, transcriptPath,
  } = ctx;
  const cfg = config.effective;

  // 1. Combined deterministic request (inspect + create folder, …).
  // Read-only parts run without approval; mutating parts still prompt.
  const decomposed = decomposeUserRequest(options.prompt);
  if (decomposed.length >= 2 && !options.planOnly && !options.skillName) {
    const result = await runCombinedRequest({
      actions: decomposed,
      approvalManager,
      config: cfg,
      cwd,
      eventBus,
      prompt: options.prompt,
      session,
      sessionStore,
      taskState,
      toolRegistry,
      transcriptPath,
    });
    return {handled: true, result, workspaceHasAppFiles: false};
  }

  // 2. Pasted runtime/build error.
  const pastedError = detectErrorPaste(options.prompt);
  if (pastedError.isError && !options.planOnly && !options.skillName) {
    const result = await runErrorFix({
      approvalManager,
      config: cfg,
      cwd,
      error: pastedError,
      eventBus,
      model: routing.primary.model,
      prompt: options.prompt,
      provider,
      session,
      sessionStore,
      signal: options.signal,
      taskState,
      toolRegistry,
      transcriptPath,
    });
    return {handled: true, result, workspaceHasAppFiles: false};
  }

  // 3. Deterministic "run this app" / build-fix.
  const appActionMode = detectAppActionRequest(options.prompt);
  if (appActionMode && !options.planOnly && !options.skillName) {
    const result = await runRunApp({
      approvalManager,
      config: cfg,
      cwd,
      eventBus,
      mode: appActionMode,
      model: routing.primary.model,
      provider,
      prompt: options.prompt,
      session,
      sessionStore,
      signal: options.signal,
      taskState,
      toolRegistry,
      transcriptPath,
    });
    return {handled: true, result, workspaceHasAppFiles: false};
  }

  // 4. Autonomous coding (build / modify existing app).
  const workspaceHasAppFiles = await hasWorkspaceAppFiles(cwd);
  if (
    shouldRunAutonomousCoding(options.prompt, {
      mode,
      planOnly: options.planOnly,
      skillName: options.skillName,
      workspaceHasAppFiles,
    })
  ) {
    const result = await runAutonomousCodingSession({
      approvalManager,
      config: cfg,
      cwd,
      eventBus,
      mode,
      modeReason,
      model: routing.primary.model,
      provider,
      providerName: provider.currentRoute.providerName,
      prompt: options.prompt,
      session,
      sessionStore,
      signal: options.signal,
      taskState,
      toolRegistry,
      transcriptPath,
    });
    return {handled: true, result, workspaceHasAppFiles};
  }

  // 5. Simple deterministic action — provider-free filesystem/command op.
  const simpleAction = detectSimpleAction(options.prompt);
  if (
    simpleAction
    && canExecuteSimpleActionDirectly(simpleAction)
    && !options.planOnly
    && !options.skillName
  ) {
    const result = await runDirectSimpleAction({
      action: simpleAction,
      approvalManager,
      config: cfg,
      cwd,
      eventBus,
      prompt: options.prompt,
      session,
      sessionStore,
      taskState,
      toolRegistry,
      transcriptPath,
    });
    return {handled: true, result, workspaceHasAppFiles};
  }

  return {handled: false, workspaceHasAppFiles};
};
