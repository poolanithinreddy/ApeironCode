import {PlanManager} from './planManager.js';
import {buildDefaultPlan, formatPlanForDisplay, isLargeTechTask, shouldRequirePlan} from './planningGate.js';
import type {ExecutionPlan} from './planningGate.js';
import type {ProjectScan} from '../context/scanner.js';
import type {AgentMode} from './types.js';

export interface ApprovalRequest {
  planId: string;
  plan: ExecutionPlan;
  approved: boolean;
  approverName?: string;
}

export class PlanApprovalService {
  private planManager: PlanManager;

  constructor(private readonly projectDir: string) {
    this.planManager = new PlanManager(this.projectDir);
  }

  shouldRequirePlanApproval(
    mode: AgentMode,
    prompt: string,
    config?: {requireBeforeEdit?: boolean; largeTaskThreshold?: number},
  ): boolean {
    return shouldRequirePlan(mode, prompt, config);
  }

  async createPlan(
    goal: string,
    mode: AgentMode,
    projectScan: ProjectScan,
    likelyFiles: string[],
  ): Promise<ExecutionPlan> {
    const plan = buildDefaultPlan(goal, mode, projectScan, likelyFiles);
    await this.planManager.createPlan(plan);
    return plan;
  }

  async approvePlan(planId: string, approverName: string = 'user'): Promise<ExecutionPlan | null> {
    return this.planManager.approvePlan(planId, approverName);
  }

  async rejectPlan(planId: string): Promise<ExecutionPlan | null> {
    const plan = await this.planManager.loadPlan(planId);
    if (!plan) return null;

    plan.status = 'failed';
    await this.planManager.savePlan(plan);
    return plan;
  }

  async getActivePlan(): Promise<ExecutionPlan | null> {
    const plans = await this.planManager.listPlans();
    return plans.find(p => p.status === 'executing') || null;
  }

  async getPendingPlan(): Promise<ExecutionPlan | null> {
    const plans = await this.planManager.listPlans();
    return plans.find(p => p.status === 'draft') || null;
  }

  async executePlan(planId: string): Promise<ExecutionPlan | null> {
    return this.planManager.executePlan(planId);
  }

  async completePlan(planId: string, result: {actualFilesChanged?: string[]; actualStepsExecuted?: number; summary?: string; errors?: string[]}): Promise<ExecutionPlan | null> {
    return this.planManager.completePlan(planId, result);
  }

  async listPlans(): Promise<ExecutionPlan[]> {
    return this.planManager.listPlans();
  }

  async loadPlan(planId: string): Promise<ExecutionPlan | null> {
    return this.planManager.loadPlan(planId);
  }

  async savePlan(plan: ExecutionPlan): Promise<void> {
    return this.planManager.savePlan(plan);
  }

  formatPlan(plan: ExecutionPlan): string {
    return formatPlanForDisplay(plan);
  }

  isLargeTask(prompt: string): boolean {
    return isLargeTechTask(prompt);
  }
}
