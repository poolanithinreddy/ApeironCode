import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {assessCommand} from '../safety/commandGuard.js';
import {AppError} from '../utils/errors.js';
import {truncate} from '../utils/format.js';
import {SandboxManager} from '../sandbox/manager.js';
import {createEventTimestamp} from '../core/events/events.js';
import {commandSessionManager} from './commandSessions.js';
import {defineTool} from './types.js';

const RunCommandInputSchema = z.object({
  background: z.boolean().default(false),
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().int().positive().max(60_000).default(20_000),
});

export const runCommandTool = defineTool({
  description: 'Run an approved shell command with safety checks.',
  inputSchema: RunCommandInputSchema,
  name: 'run_command',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = RunCommandInputSchema.parse(rawInput);
    const assessment = assessCommand(input.command);

    if (!assessment.allowed) {
      throw new AppError(assessment.reasons.join(' '), 'COMMAND_BLOCKED');
    }

    await ensureApproved(context.approvalManager, {
      details: assessment.reasons.join(' '),
      kind: 'command',
      message: truncate(input.command, 240),
      resource: input.command,
      requiresExtraConfirmation: assessment.requiresExtraConfirmation,
      riskLevel: assessment.riskLevel,
      scope: 'project',
      title: 'Approve shell command',
    });

    if (input.background) {
      const session = commandSessionManager.start(input.command, input.cwd ?? context.cwd);
      return {
        metadata: {
          command: session.command,
          cwd: session.cwd,
          exitCode: session.exitCode ?? null,
          pid: session.pid ?? null,
          sessionId: session.id,
          startedAt: session.startedAt,
          status: session.status,
        },
        ok: true,
        output: JSON.stringify(session, null, 2),
        summary: `Started background command session ${session.id}`,
      };
    }

    const sandboxManager = new SandboxManager({allowFallbackToLocal: true});
    const cwd = input.cwd ?? context.cwd;

    try {
      context.eventBus?.emit({
        backend: 'local',
        command: input.command,
        cwd,
        timestamp: createEventTimestamp(),
        type: 'sandbox.execution_started',
      });

      const result = await sandboxManager.executeCommand(input.command, {
        cwd,
        timeout: input.timeout,
        signal: context.signal,
      });

      const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');

      if (!result.ok) {
        context.eventBus?.emit({
          backend: result.backend,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          output: combinedOutput,
          timestamp: createEventTimestamp(),
          type: 'sandbox.execution_completed',
        });
      }

      return {
        ok: result.ok,
        output: combinedOutput,
        summary: `Command exited with code ${result.exitCode}`,
        metadata: {
          background: false,
          backend: result.backend,
          command: input.command,
          cwd,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
        },
      };
    } finally {
      await sandboxManager.dispose();
    }
  },
});