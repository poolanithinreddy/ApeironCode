import {z} from 'zod';

import {commandSessionManager} from './commandSessions.js';
import {defineTool} from './types.js';

const CommandOutputInputSchema = z.object({
  maxChars: z.number().int().positive().max(20_000).default(6_000),
  sessionId: z.string().uuid(),
});

export const commandOutputTool = defineTool({
  description: 'Read buffered output from a background command session.',
  inputSchema: CommandOutputInputSchema,
  name: 'command_output',
  requiresApproval: false,
  riskLevel: 'low',
  run(rawInput) {
    const input = CommandOutputInputSchema.parse(rawInput);
    const output = commandSessionManager.getOutput(input.sessionId, input.maxChars);

    return Promise.resolve({
      ok: output !== null,
      output: output ?? 'Command session not found.',
      summary: output !== null ? 'Command output collected' : 'Command session not found',
    });
  },
});