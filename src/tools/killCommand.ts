import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {commandSessionManager} from './commandSessions.js';
import {defineTool} from './types.js';

const KillCommandInputSchema = z.object({
  sessionId: z.string().uuid(),
});

export const killCommandTool = defineTool({
  description: 'Terminate a running background command session after approval.',
  inputSchema: KillCommandInputSchema,
  name: 'kill_command',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = KillCommandInputSchema.parse(rawInput);

    await ensureApproved(context.approvalManager, {
      kind: 'command',
      message: `Kill command session ${input.sessionId}`,
      resource: `kill:${input.sessionId}`,
      riskLevel: 'medium',
      scope: 'project',
      title: 'Approve command termination',
    });

    const killed = commandSessionManager.kill(input.sessionId);
    return {
      ok: killed,
      output: killed ? `Killed ${input.sessionId}` : 'Command session not found.',
      summary: killed ? 'Command session terminated' : 'Command session not found',
    };
  },
});