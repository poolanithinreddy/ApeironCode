import {z} from 'zod';

import {AppError} from '../../utils/errors.js';
import {defineTool} from '../types.js';
import {performDuckDuckGoSearch, prepareSearchRequest} from './shared.js';

const WebResearchInputSchema = z.object({
  maxResults: z.number().int().positive().max(8).optional(),
  query: z.string().min(1),
});

export const webResearchTool = defineTool({
  description: 'Research a topic from live search results and return a concise brief with sources.',
  inputSchema: WebResearchInputSchema,
  name: 'web_research',
  networkTargets(rawInput, context) {
    const parsed = WebResearchInputSchema.safeParse(rawInput);
    return parsed.success
      ? [prepareSearchRequest({query: parsed.data.query, searchProvider: context.config.web.searchProvider}).searchUrl]
      : [];
  },
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    if (!context.config.web.enabled) {
      throw new AppError('Web access is disabled in config.', 'WEB_DISABLED');
    }

    const input = WebResearchInputSchema.parse(rawInput);
    const {query, results, searchUrl} = await performDuckDuckGoSearch({
      maxResults: input.maxResults ?? Math.min(3, context.config.web.maxSearchResults),
      query: input.query,
      searchProvider: context.config.web.searchProvider,
      userAgent: context.config.web.userAgent,
    });

    const brief = results.length > 0
      ? results.map((result) => `- ${result.title}: ${result.snippet}\n  Source: ${result.url}`).join('\n')
      : 'No research results found.';

    return {
      ok: true,
      output: [`Research query: ${query}`, `Search URL: ${searchUrl}`, '', brief].join('\n'),
      summary: `Compiled a research brief from ${results.length} live result${results.length === 1 ? '' : 's'}`,
      metadata: {
        query,
        results,
        searchUrl,
      },
    };
  },
});