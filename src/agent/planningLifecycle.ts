import type {ResolvedConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {buildProjectContext} from './context.js';
import type {ConversationSession} from './session.js';
import type {AgentMode, AgentRunOptions} from './types.js';

export const handlePlanningGate = async ({
  approvalManager,
  config,
  cwd,
  eventBus,
  mode,
  options,
  projectContext,
  prompt,
  session,
}: {
  approvalManager: ApprovalManager;
  config: ResolvedConfig;
  cwd: string;
  eventBus: EventBus;
  mode: AgentMode;
  options: AgentRunOptions;
  projectContext: Awaited<ReturnType<typeof buildProjectContext>>;
  prompt: string;
  session: ConversationSession;
}): Promise<{shouldProceed: boolean; blocked: boolean; blocked_reason?: string}> => {
  const {checkPlanningGate} = await import('./planningGate.integration.js');

  const gateResult = await checkPlanningGate({
    approvalManager,
    config,
    cwd,
    likelyFiles: projectContext.relevantFiles.map((f) => f.path),
    mode,
    prompt,
    projectScan: projectContext.projectScan,
    planId: options.planId,
    planOnly: options.planOnly,
  });

  session.executingPlanId = gateResult.planId ?? undefined;
  session.planningRequired = gateResult.approved || gateResult.planId !== null;
  session.planningApproved = gateResult.approved;

  if (options.planOnly) {
    session.planningMode = 'plan-only';
    eventBus.emit({
      message: `✓ Plan created: ${gateResult.planId}`,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    return {shouldProceed: false, blocked: false};
  }

  if (options.planId) {
    session.planningMode = 'execute-approved';
    if (!gateResult.approved) {
      return {shouldProceed: false, blocked: true, blocked_reason: gateResult.reason};
    }
    eventBus.emit({
      message: `Executing approved plan: ${gateResult.planId}`,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    return {shouldProceed: true, blocked: false};
  }

  if (gateResult.planId && !gateResult.approved) {
    session.planningMode = 'plan-and-execute';
    return {shouldProceed: false, blocked: true, blocked_reason: gateResult.reason};
  }

  if (gateResult.planId && gateResult.approved) {
    session.planningMode = 'plan-and-execute';
    eventBus.emit({
      message: `✓ Plan approved: ${gateResult.planId}. Executing...`,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    return {shouldProceed: true, blocked: false};
  }

  session.planningMode = 'off';
  return {shouldProceed: true, blocked: false};
};
