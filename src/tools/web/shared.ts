import {isIP} from 'node:net';

import {AppError} from '../../utils/errors.js';

export interface WebPageContent {
  text: string;
  title?: string;
  url: string;
}

export interface WebSearchResult {
  snippet: string;
  title: string;
  url: string;
}

export interface PreparedSearchRequest {
  query: string;
  searchProvider: 'duckduckgo';
  searchUrl: string;
}

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
};

export const stripHtml = (html: string): string => {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  );
};

const isPrivateIpv4 = (host: string): boolean => {
  const octets = host.split('.').map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return false;
  }

  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) {
    return false;
  }

  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
};

const isPrivateIpv6 = (host: string): boolean => {
  const normalized = host.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
};

const isPrivateHost = (hostname: string): boolean => {
  const normalized = hostname.replace(/^\[(.*)\]$/u, '$1').split('%')[0]?.toLowerCase() ?? hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
};

export const normalizeWebUrl = (
  value: string,
  options: {allowPrivateHosts?: boolean} = {},
): string => {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(`Unsupported URL protocol: ${parsed.protocol}`, 'WEB_UNSUPPORTED_PROTOCOL');
  }

  if (!options.allowPrivateHosts && isPrivateHost(parsed.hostname)) {
    throw new AppError(
      'Web fetch to localhost and private IP ranges is blocked by default. Set web.allowPrivateHosts=true only for trusted local testing.',
      'WEB_PRIVATE_HOST_BLOCKED',
    );
  }

  return parsed.toString();
};

export const resolveSearchProvider = (searchProvider?: string): 'duckduckgo' => {
  const normalizedProvider = searchProvider?.trim().toLowerCase();
  if (!normalizedProvider) {
    throw new AppError(
      'Web search provider is not configured. Set web.searchProvider to "duckduckgo" before using web_search or web_research.',
      'WEB_SEARCH_PROVIDER_MISSING',
    );
  }

  if (normalizedProvider !== 'duckduckgo') {
    throw new AppError(
      `Unsupported web search provider: ${searchProvider}. Set web.searchProvider to "duckduckgo".`,
      'WEB_SEARCH_PROVIDER_UNSUPPORTED',
    );
  }

  return 'duckduckgo';
};

export const sanitizeSearchQuery = (query: string): string => {
  const sanitized = query
    .trim()
    .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s]+)/giu, '$1=[redacted]')
    .replace(/\bbearer\s+[a-z0-9._-]+/giu, 'bearer [redacted]')
    .replace(/\b(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{16,}|eyj[a-z0-9._-]+\.[a-z0-9._-]+\.[a-z0-9._-]+)\b/giu, '[redacted]')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!sanitized) {
    throw new AppError(
      'Web search query is empty after removing secret-like content. Remove secrets and try again.',
      'WEB_QUERY_REDACTED',
    );
  }

  return sanitized;
};

export const prepareSearchRequest = ({
  query,
  searchProvider,
}: {
  query: string;
  searchProvider?: string;
}): PreparedSearchRequest => {
  const resolvedProvider = resolveSearchProvider(searchProvider);
  const sanitizedQuery = sanitizeSearchQuery(query);

  const url = new URL('https://duckduckgo.com/html/');
  url.searchParams.set('q', sanitizedQuery);
  return {
    query: sanitizedQuery,
    searchProvider: resolvedProvider,
    searchUrl: url.toString(),
  };
};

const unwrapDuckDuckGoUrl = (href: string): string => {
  const normalizedHref = href.startsWith('//')
    ? `https:${href}`
    : href.startsWith('/')
      ? `https://duckduckgo.com${href}`
      : href;

  try {
    const parsed = new URL(normalizedHref);
    return parsed.searchParams.get('uddg') ?? normalizedHref;
  } catch {
    return normalizedHref;
  }
};

export const fetchWebPage = async ({
  allowPrivateHosts,
  maxChars,
  url,
  userAgent,
}: {
  allowPrivateHosts?: boolean;
  maxChars: number;
  url: string;
  userAgent: string;
}): Promise<WebPageContent> => {
  const normalizedUrl = normalizeWebUrl(url, {allowPrivateHosts});
  const response = await fetch(normalizedUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
      'user-agent': userAgent,
    },
  });

  if (!response.ok) {
    throw new AppError(`Web fetch failed with HTTP ${response.status}`, 'WEB_FETCH_FAILED');
  }

  const html = await response.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  return {
    text: stripHtml(html).slice(0, maxChars),
    title: title ? stripHtml(title) : undefined,
    url: response.url || normalizedUrl,
  };
};

export const parseDuckDuckGoResults = (html: string, maxResults: number): WebSearchResult[] => {
  const results: WebSearchResult[] = [];
  const anchorPattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) && results.length < maxResults) {
    const href = match[1] ? unwrapDuckDuckGoUrl(match[1]) : null;
    const title = match[2] ? stripHtml(match[2]) : null;
    if (!href || !title) {
      continue;
    }

    const nearbyHtml = html.slice(match.index, match.index + 1_600);
    const snippet = stripHtml(
      nearbyHtml.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/iu)?.[1] ?? '',
    );

    results.push({
      snippet: snippet || 'No snippet available.',
      title,
      url: href,
    });
  }

  return results;
};

export const performDuckDuckGoSearch = async ({
  maxResults,
  query,
  searchProvider,
  userAgent,
}: {
  maxResults: number;
  query: string;
  searchProvider?: string;
  userAgent: string;
}): Promise<{query: string; results: WebSearchResult[]; searchUrl: string}> => {
  const request = prepareSearchRequest({query, searchProvider});
  const response = await fetch(request.searchUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': userAgent,
    },
  });

  if (!response.ok) {
    throw new AppError(`Web search failed with HTTP ${response.status}`, 'WEB_SEARCH_FAILED');
  }

  const html = await response.text();
  return {
    query: request.query,
    results: parseDuckDuckGoResults(html, maxResults),
    searchUrl: request.searchUrl,
  };
};