import type {ApprovalManager} from '../safety/approvals.js';
import type {ResolvedConfig} from '../config/config.js';
import {PlanApprovalService} from './planApprovalService.js';
import type {ProjectScan} from '../context/scanner.js';
import type {AgentMode} from './types.js';

export interface PlanningGateContext {
  approvalManager: ApprovalManager;
  config: ResolvedConfig;
  cwd: string;
  mode: AgentMode;
  prompt: string;
  projectScan: ProjectScan;
  likelyFiles: string[];
  planId?: string;
  planOnly?: boolean;
}

export interface PlanningGateResult {
  planId: string | null;
  approved: boolean;
  shouldProceed: boolean;
  blocked: boolean;
  reason?: string;
}

export const checkPlanningGate = async (context: PlanningGateContext): Promise<PlanningGateResult> => {
  const planService = new PlanApprovalService(context.cwd);

  if (context.planId) {
    const plan = await planService.loadPlan(context.planId);
    if (!plan) {
      return {
        planId: null,
        approved: false,
        shouldProceed: false,
        blocked: true,
        reason: `Plan ${context.planId} not found`,
      };
    }
    if (plan.status !== 'approved') {
      return {
        planId: null,
        approved: false,
        shouldProceed: false,
        blocked: true,
        reason: `Plan ${plan.id} has status "${plan.status}" but must be "approved"`,
      };
    }
    return {
      planId: plan.id,
      approved: true,
      shouldProceed: true,
      blocked: false,
    };
  }

  const requiresPlanning = planService.shouldRequirePlanApproval(
    context.mode,
    context.prompt,
    {
      requireBeforeEdit: context.config.effective.planning?.requireBeforeEdit,
    },
  );

  if (!requiresPlanning && !context.planOnly) {
    return {
      planId: null,
      approved: false,
      shouldProceed: true,
      blocked: false,
    };
  }

  const plan = await planService.createPlan(
    context.prompt,
    context.mode,
    context.projectScan,
    context.likelyFiles,
  );

  if (context.planOnly) {
    return {
      planId: plan.id,
      approved: false,
      shouldProceed: false,
      blocked: false,
      reason: 'Plan-only mode: plan created but execution blocked',
    };
  }

  const approval = await context.approvalManager.request({
    details: planService.formatPlan(plan),
    kind: 'write',
    message: `Proceed with this plan? [y/N]`,
    resource: `plan:${plan.id}`,
    riskLevel: 'medium',
    scope: 'project',
    title: 'Approve execution plan',
  });

  if (!approval.approved) {
    return {
      planId: plan.id,
      approved: false,
      shouldProceed: false,
      blocked: true,
      reason: 'Plan rejected by user',
    };
  }

  const approvedPlan = await planService.approvePlan(plan.id, 'user');
  return {
    planId: approvedPlan?.id ?? null,
    approved: true,
    shouldProceed: true,
    blocked: false,
  };
};
