import {z} from 'zod';

import {AppError} from '../../utils/errors.js';
import {defineTool} from '../types.js';
import {fetchWebPage, normalizeWebUrl} from './shared.js';

const WebFetchInputSchema = z.object({
  maxChars: z.number().int().positive().max(20_000).optional(),
  url: z.string().url(),
});

export const webFetchTool = defineTool({
  description: 'Fetch a web page and return cleaned text content.',
  inputSchema: WebFetchInputSchema,
  name: 'web_fetch',
  networkTargets(rawInput, context) {
    const parsed = WebFetchInputSchema.safeParse(rawInput);
    return parsed.success
      ? [normalizeWebUrl(parsed.data.url, {allowPrivateHosts: context.config.web.allowPrivateHosts})]
      : [];
  },
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    if (!context.config.web.enabled) {
      throw new AppError('Web access is disabled in config.', 'WEB_DISABLED');
    }

    const input = WebFetchInputSchema.parse(rawInput);
    const page = await fetchWebPage({
      allowPrivateHosts: context.config.web.allowPrivateHosts,
      maxChars: input.maxChars ?? context.config.web.maxFetchChars,
      url: input.url,
      userAgent: context.config.web.userAgent,
    });

    return {
      ok: true,
      output: [`URL: ${page.url}`, page.title ? `Title: ${page.title}` : null, '', page.text].filter(Boolean).join('\n'),
      summary: `Fetched ${page.title ?? page.url}`,
      metadata: {
        title: page.title,
        url: page.url,
      },
    };
  },
});