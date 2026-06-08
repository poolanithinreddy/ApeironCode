import fs from 'node:fs/promises';
import path from 'node:path';
import {fileExists, ensureDirectory, writeTextFile, readTextFile} from '../utils/fs.js';
import {getPlanStoragePath} from '../utils/paths.js';
import type {ExecutionPlan} from './planningGate.js';

export class PlanManager {
  private storagePath: string;

  constructor(projectDir: string) {
    this.storagePath = getPlanStoragePath(projectDir);
  }

  async createPlan(plan: ExecutionPlan): Promise<void> {
    await ensureDirectory(this.storagePath);
    const planPath = path.join(this.storagePath, `${plan.id}.json`);
    await writeTextFile(planPath, JSON.stringify(plan, null, 2));
  }

  async loadPlan(planId: string): Promise<ExecutionPlan | null> {
    try {
      const planPath = path.join(this.storagePath, `${planId}.json`);
      if (!(await fileExists(planPath))) {
        return null;
      }
      const content = await readTextFile(planPath);
      return JSON.parse(content) as ExecutionPlan;
    } catch {
      return null;
    }
  }

  async savePlan(plan: ExecutionPlan): Promise<void> {
    const planPath = path.join(this.storagePath, `${plan.id}.json`);
    await writeTextFile(planPath, JSON.stringify(plan, null, 2));
  }

  async listPlans(): Promise<ExecutionPlan[]> {
    try {
      if (!(await fileExists(this.storagePath))) {
        return [];
      }
      const files = await fs.readdir(this.storagePath);
      const plans: ExecutionPlan[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const content = await readTextFile(path.join(this.storagePath, file));
        const parsed = JSON.parse(content) as ExecutionPlan | null;
        if (parsed) {
          plans.push(parsed);
        }
      }

      return plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  async approvePlan(planId: string, approver: string): Promise<ExecutionPlan | null> {
    const plan = await this.loadPlan(planId);
    if (!plan) return null;

    plan.status = 'approved';
    plan.approvedAt = new Date().toISOString();
    plan.approvedBy = approver;
    await this.savePlan(plan);
    return plan;
  }

  async executePlan(planId: string): Promise<ExecutionPlan | null> {
    const plan = await this.loadPlan(planId);
    if (!plan) return null;

    if (plan.status !== 'approved') {
      throw new Error(`Plan ${planId} is not approved. Current status: ${plan.status}`);
    }

    plan.status = 'executing';
    plan.executionStarted = new Date().toISOString();
    await this.savePlan(plan);
    return plan;
  }

  async completePlan(planId: string, result: {actualFilesChanged?: string[]; actualStepsExecuted?: number; summary?: string; errors?: string[]}): Promise<ExecutionPlan | null> {
    const plan = await this.loadPlan(planId);
    if (!plan) return null;

    plan.status = 'completed';
    plan.executionCompleted = new Date().toISOString();
    plan.actualFilesChanged = result.actualFilesChanged;
    plan.actualStepsExecuted = result.actualStepsExecuted;
    plan.summary = result.summary;
    plan.errors = result.errors;
    await this.savePlan(plan);
    return plan;
  }

  async failPlan(planId: string, errors: string[]): Promise<ExecutionPlan | null> {
    const plan = await this.loadPlan(planId);
    if (!plan) return null;

    plan.status = 'failed';
    plan.executionCompleted = new Date().toISOString();
    plan.errors = errors;
    await this.savePlan(plan);
    return plan;
  }

  async revertPlan(planId: string): Promise<ExecutionPlan | null> {
    const plan = await this.loadPlan(planId);
    if (!plan) return null;

    plan.status = 'reverted';
    plan.executionCompleted = new Date().toISOString();
    await this.savePlan(plan);
    return plan;
  }

  getActivePlan(plans: ExecutionPlan[]): ExecutionPlan | null {
    return plans.find(p => p.status === 'executing') || null;
  }

  getRecentPlan(plans: ExecutionPlan[]): ExecutionPlan | null {
    const first = plans[0];
    return first ?? null;
  }
}
