import {createServer, type Server} from 'node:http';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {createMockConfig} from '../support/mocks.js';

let server: Server | null = null;

const createToolContext = ({
  approvalManager = new ApprovalManager('bypass'),
  config = createMockConfig(),
}: {
  approvalManager?: ApprovalManager;
  config?: ReturnType<typeof createMockConfig>;
} = {}) => {
  return {
    approvalManager,
    auditLog: new AuditLog(),
    context: {
      approvalManager,
      config,
      cwd: '/test-workspace',
    },
  };
};

describe('web tools', () => {
  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches and strips web page content', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      '<html><head><title>Example Article</title></head><body><h1>Parser Guide</h1><p>Useful parser details.</p></body></html>',
      {status: 200},
    ))));

    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext();
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_fetch))', 'Allow(Network(https://example.com/*))'],
      sessionId: 'web-fetch-session',
    });

    const result = await registry.invoke('web_fetch', {url: 'https://example.com/article'}, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain('Example Article');
    expect(result.output).toContain('Parser Guide Useful parser details.');
  });

  it('blocks file URLs and private hosts by default', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext();
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_fetch))'],
      sessionId: 'web-block-session',
    });

    await expect(registry.invoke('web_fetch', {url: 'file:///tmp/secret.txt'}, context)).rejects.toThrow(/Unsupported URL protocol/);
    await expect(registry.invoke('web_fetch', {url: 'http://127.0.0.1:4312/guide'}, context)).rejects.toThrow(/blocked by default/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('searches and researches via duckduckgo result pages', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      [
        '<html><body>',
        '<div class="result">',
        '<a class="result__a" href="https://example.com/parser">Parser Guide</a>',
        '<div class="result__snippet">Useful parser details from the web.</div>',
        '</div>',
        '</body></html>',
      ].join(''),
      {status: 200},
    ))));

    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext();
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_search))', 'Allow(Tool(web_research))', 'Allow(Network(https://duckduckgo.com/*))'],
      sessionId: 'web-search-session',
    });

    const searchResult = await registry.invoke('web_search', {query: 'parser'}, context);
    expect(searchResult.output).toContain('Parser Guide');
    expect(searchResult.output).toContain('https://example.com/parser');

    const researchResult = await registry.invoke('web_research', {query: 'parser'}, context);
    expect(researchResult.output).toContain('Research query: parser');
    expect(researchResult.output).toContain('Useful parser details from the web.');
  });

  it('shows a clear setup error when no search provider is configured', async () => {
    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext({
      config: createMockConfig({
        web: {
          ...createMockConfig().web,
          searchProvider: '',
        },
      }),
    });
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_search))'],
      sessionId: 'web-provider-missing-session',
    });

    await expect(registry.invoke('web_search', {query: 'parser'}, context)).rejects.toThrow(/Set web.searchProvider to "duckduckgo"/);
  });

  it('sanitizes obvious secrets before search requests leave the process', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(
      '<html><body><a class="result__a" href="https://example.com/parser">Parser Guide</a><div class="result__snippet">Safe snippet.</div></body></html>',
      {status: 200},
    )));
    vi.stubGlobal('fetch', fetchSpy);

    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext();
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_search))'],
      sessionId: 'web-sanitize-session',
    });

    const secretQuery = 'parser api_key=super-secret sk-abcdefghijklmnopqrstuvwxyz123456';
    const result = await registry.invoke('web_search', {query: secretQuery}, context);
    const firstCall = fetchSpy.mock.calls[0] as [string | URL | Request] | undefined;
    const firstArgument = firstCall?.[0];
    const requestedUrl = typeof firstArgument === 'string'
      ? firstArgument
      : firstArgument instanceof URL
        ? firstArgument.toString()
        : firstArgument instanceof Request
          ? firstArgument.url
          : '';

    expect(requestedUrl).not.toContain('super-secret');
    expect(requestedUrl).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(requestedUrl).toContain('%5Bredacted%5D');
    expect(result.summary).not.toContain('super-secret');
  });

  it('supports direct URL fetch from a mocked local server only when private hosts are explicitly enabled', async () => {
    server = createServer((request, response) => {
      expect(request.url).toBe('/guide');
      response.writeHead(200, {'content-type': 'text/html'});
      response.end('<html><head><title>Local Guide</title></head><body><p>Served from a mocked local HTTP server.</p></body></html>');
    });

    await new Promise<void>((resolve) => {
      server?.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral local address for the mocked HTTP server.');
    }

    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext({
      config: createMockConfig({
        web: {
          ...createMockConfig().web,
          allowPrivateHosts: true,
        },
      }),
    });
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_fetch))', 'Allow(Network(http://127.0.0.1:*/**))'],
      sessionId: 'web-local-server-session',
    });

    const result = await registry.invoke('web_fetch', {url: `http://127.0.0.1:${address.port}/guide`}, context);
    expect(result.output).toContain('Local Guide');
    expect(result.output).toContain('Served from a mocked local HTTP server.');
  });

  it('requests explicit network approval when no Network rule matches', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(
      '<html><head><title>Example Article</title></head><body><p>Approved through network ask.</p></body></html>',
      {status: 200},
    )));
    vi.stubGlobal('fetch', fetchSpy);
    const approvalHandler = vi.fn(() => Promise.resolve({approved: true}));
    const approvalManager = new ApprovalManager('ask', approvalHandler);

    const registry = createDefaultToolRegistry();
    const {auditLog, context} = createToolContext({approvalManager});
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_fetch))'],
      sessionId: 'web-network-ask-session',
    });

    await registry.invoke('web_fetch', {url: 'https://example.com/article'}, context);

    expect(approvalHandler).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Allow network access to https://example.com/article?',
      title: 'Network access for web_fetch',
    }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('denies web access when network rules block the target', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const registry = createDefaultToolRegistry();
    const {approvalManager, auditLog, context} = createToolContext();
    registry.configureExecutor({
      approvalManager,
      auditLog,
      globalPermissionRules: ['Allow(Tool(web_fetch))', 'Deny(Network(https://example.com/*))'],
      sessionId: 'web-deny-session',
    });

    await expect(
      registry.invoke('web_fetch', {url: 'https://example.com/article'}, context),
    ).rejects.toThrow(/Network access denied/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});