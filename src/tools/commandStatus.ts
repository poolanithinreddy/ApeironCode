import {z} from 'zod';

import {commandSessionManager} from './commandSessions.js';
import {defineTool} from './types.js';

const CommandStatusInputSchema = z.object({
  sessionId: z.string().uuid(),
});

export const commandStatusTool = defineTool({
  description: 'Read the status of a background command session.',
  inputSchema: CommandStatusInputSchema,
  name: 'command_status',
  requiresApproval: false,
  riskLevel: 'low',
  run(rawInput) {
    const input = CommandStatusInputSchema.parse(rawInput);
    const session = commandSessionManager.get(input.sessionId);

    return Promise.resolve({
      ok: Boolean(session),
      output: session ? JSON.stringify(session, null, 2) : 'Command session not found.',
      summary: session ? `Command session ${session.status}` : 'Command session not found',
    });
  },
});