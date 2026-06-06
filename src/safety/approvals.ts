import readline from 'node:readline/promises';

import pc from 'picocolors';

import type {ApprovalMode} from '../config/config.js';
import type {AgentEvent} from '../core/events/events.js';
import {createEventTimestamp} from '../core/events/events.js';
import {AppError} from '../utils/errors.js';
import {colorizeDiff} from '../utils/format.js';
import {parsePermissionRules} from './permissionParser.js';
import {evaluatePermissionRules} from './permissionMatcher.js';
import type {ApprovalKind, ApprovalScope, RiskLevel} from './policy.js';
import {shouldAutoApprove} from './policy.js';
import {formatPromptText} from '../utils/display.js';

export interface ApprovalRequest {
  kind: ApprovalKind;
  scope: ApprovalScope;
  title: string;
  message: string;
  riskLevel: RiskLevel;
  details?: string;
  diff?: string;
  requiresExtraConfirmation?: boolean;
  resource?: string;
  matchedRule?: string; // Permission rule that triggered this approval
}

export interface ApprovalResponse {
  approved: boolean;
}

export type ApprovalHandler = (
  request: ApprovalRequest,
) => Promise<ApprovalResponse>;

const promptForApproval = async (
  request: ApprovalRequest,
): Promise<ApprovalResponse> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    process.stdout.write(`\n${pc.bold(formatPromptText(request.title))}\n${formatPromptText(request.message)}\n`);

    if (request.details) {
      process.stdout.write(`${pc.dim(formatPromptText(request.details))}\n`);
    }

    if (request.diff) {
      process.stdout.write(`${colorizeDiff(request.diff)}\n`);
    }

    const question = request.requiresExtraConfirmation
      ? `${pc.yellow('Type YES to approve: ')}`
      : `${pc.yellow('Approve? [y/N]: ')}`;
    const answer = await rl.question(question);

    return {
      approved: request.requiresExtraConfirmation
        ? answer.trim() === 'YES'
        : /^y(es)?$/iu.test(answer.trim()),
    };
  } finally {
    rl.close();
  }
};

export class ApprovalManager {
  constructor(
    private readonly mode: ApprovalMode,
    private readonly handler?: ApprovalHandler,
    private readonly permissionRules: string[] = [],
    private readonly emitEvent?: (event: AgentEvent) => void,
  ) {}

  async request(request: ApprovalRequest): Promise<ApprovalResponse> {
    this.emitEvent?.({
      request,
      timestamp: createEventTimestamp(),
      type: 'approval.requested',
    });

    if (request.resource) {
      const rules = parsePermissionRules(this.permissionRules).valid;
      const actionType = request.kind === 'command' || request.kind === 'git'
        ? 'Bash'
        : request.kind === 'write'
          ? 'FileEdit'
          : 'FileRead';

      const {decision, matchedRule} = evaluatePermissionRules(rules, {
        actionType,
        resource: request.resource,
      });

      if (decision === 'deny') {
        this.emitEvent?.({
          approved: false,
          decision: 'rule-deny',
          request,
          timestamp: createEventTimestamp(),
          type: 'approval.completed',
        });
        throw new AppError(
          `Action blocked by permission rule: ${matchedRule?.raw || 'Deny rule matched'}`,
          'PERMISSION_DENIED',
        );
      }

      if (decision === 'allow') {
        this.emitEvent?.({
          approved: true,
          decision: 'rule-allow',
          request,
          timestamp: createEventTimestamp(),
          type: 'approval.completed',
        });
        return {approved: true};
      }
    }

    if (
      !request.requiresExtraConfirmation &&
      shouldAutoApprove(this.mode, {
        kind: request.kind,
        riskLevel: request.riskLevel,
        scope: request.scope,
      })
    ) {
      this.emitEvent?.({
        approved: true,
        decision: 'auto-approved',
        request,
        timestamp: createEventTimestamp(),
        type: 'approval.completed',
      });
      return {approved: true};
    }

    if (this.handler) {
      const response = await this.handler(request);
      this.emitEvent?.({
        approved: response.approved,
        decision: response.approved ? 'approved' : 'denied',
        request,
        timestamp: createEventTimestamp(),
        type: 'approval.completed',
      });
      return response;
    }

    const response = await promptForApproval(request);
    this.emitEvent?.({
      approved: response.approved,
      decision: response.approved ? 'approved' : 'denied',
      request,
      timestamp: createEventTimestamp(),
      type: 'approval.completed',
    });
    return response;
  }
}

export const ensureApproved = async (
  approvalManager: ApprovalManager,
  request: ApprovalRequest,
): Promise<void> => {
  const response = await approvalManager.request(request);
  if (!response.approved) {
    throw new AppError('Action was not approved.', 'APPROVAL_DENIED');
  }
};