import {z} from 'zod';

import {AppError} from '../../utils/errors.js';
import {defineTool} from '../types.js';
import {performDuckDuckGoSearch, prepareSearchRequest} from './shared.js';

const WebSearchInputSchema = z.object({
  maxResults: z.number().int().positive().max(10).optional(),
  query: z.string().min(1),
});

export const webSearchTool = defineTool({
  description: 'Search the web and return top result titles, URLs, and snippets.',
  inputSchema: WebSearchInputSchema,
  name: 'web_search',
  networkTargets(rawInput, context) {
    const parsed = WebSearchInputSchema.safeParse(rawInput);
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

    const input = WebSearchInputSchema.parse(rawInput);
    const {query, results, searchUrl} = await performDuckDuckGoSearch({
      maxResults: input.maxResults ?? context.config.web.maxSearchResults,
      query: input.query,
      searchProvider: context.config.web.searchProvider,
      userAgent: context.config.web.userAgent,
    });

    return {
      ok: true,
      output: results.length > 0
        ? results.map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`).join('\n\n')
        : 'No search results found.',
      summary: `Found ${results.length} web result${results.length === 1 ? '' : 's'} for ${query}`,
      metadata: {
        query,
        results,
        searchUrl,
      },
    };
  },
});