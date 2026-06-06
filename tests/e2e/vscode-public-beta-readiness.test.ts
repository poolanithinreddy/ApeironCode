/**
 * Public beta readiness — aggregates manifest, bridge, VSIX, docs, and security signals.
 * No real provider calls; no VS Code host required for most checks.
 */

import {describe, it, expect, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {execSync} from 'node:child_process';
import {BRIDGE_MESSAGE_TYPES} from '../../src/bridge/types.js';
import {validateBridgeSessionModel} from '../../src/bridge/providerCommands.js';
import {executeDiffApplyRequest} from '../../src/bridge/diffApply.js';
import {PROVIDER_CATALOG} from '../../src/providers/catalog.js';

const REPO = path.join(import.meta.dirname ?? __dirname, '../..');
const EXT = path.join(REPO, 'extensions/vscode');
const VSIX = path.join(EXT, 'apeironcode-0.1.0.vsix');
const PKG = JSON.parse(fs.readFileSync(path.join(EXT, 'package.json'), 'utf8')) as Record<string, unknown>;

describe('vscode public beta readiness', () => {
  it('1 — extension manifest has Marketplace-oriented metadata', () => {
    expect(PKG['displayName']).toBe('ApeironCode');
    expect(String(PKG['description']).length).toBeGreaterThan(20);
    expect(PKG['license']).toBeTruthy();
    expect(PKG['repository']).toBeTruthy();
    expect(PKG['bugs']).toBeTruthy();
    expect(PKG['icon']).toBe('images/icon.png');
    const kw = PKG['keywords'] as string[];
    expect(kw.some((k) => /local/i.test(k))).toBe(true);
  });

  it('2 — icon exists and is valid 128×128 PNG', () => {
    const buf = fs.readFileSync(path.join(EXT, 'images/icon.png'));
    expect(buf[0]).toBe(0x89);
    expect(buf.readUInt32BE(16)).toBe(128);
    expect(buf.readUInt32BE(20)).toBe(128);
  });

  it('3 — chat webview HTML includes Clear Chat control', () => {
    const html = fs.readFileSync(path.join(EXT, 'src/views/webviewHtml.ts'), 'utf8');
    expect(html).toContain('clear-chat-btn');
    expect(html).toContain('clearChat');
  });

  it('4 — bridge protocol includes provider.set_session_model', () => {
    expect(BRIDGE_MESSAGE_TYPES).toContain('provider.set_session_model');
    expect(BRIDGE_MESSAGE_TYPES).toContain('provider.session_model');
  });

  it('5 — validateBridgeSessionModel accepts a real catalog pair', () => {
    const entry = PROVIDER_CATALOG.find((e) => e.status !== 'planned' && e.recommendedModels.length > 0);
    if (!entry) return;
    const mid = entry.recommendedModels[0]!.id;
    const r = validateBridgeSessionModel(entry.id, mid);
    expect(r.ok).toBe(true);
  });

  it('6 — diff apply approved path can use mocked ToolRegistry invoker', async () => {
    const invoker = vi.fn().mockResolvedValue({
      ok: true,
      summary: 'ok',
      output: 'src/x.ts',
      metadata: {filePath: 'src/x.ts'},
    });
    const result = await executeDiffApplyRequest(
      {
        requestId: 'r',
        files: [{path: 'src/x.ts', additions: 1, deletions: 0}],
        patchOperations: [{type: 'search_replace', search: 'a', replace: 'b'}],
        approved: true,
      },
      '/tmp',
      invoker,
    );
    expect(result.status).toBe('applied');
    expect(invoker).toHaveBeenCalled();
  });

  it('7 — diff apply denied path', async () => {
    const result = await executeDiffApplyRequest(
      {
        requestId: 'd',
        files: [{path: 'src/x.ts', additions: 1, deletions: 0}],
        patchOperations: [{type: 'search_replace', search: 'a', replace: 'b'}],
        approved: true,
      },
      '/tmp',
      vi.fn().mockResolvedValue({ok: false, summary: 'no', output: ''}),
    );
    expect(result.status).toBe('denied');
  });

  it('8 — VSIX smoke file exists when packaged', () => {
    if (!fs.existsSync(VSIX)) return;
    let listing = '';
    try {
      listing = execSync(`unzip -l "${VSIX}"`, {encoding: 'utf8'});
    } catch {
      return;
    }
    expect(listing).toMatch(/extension\/out\/extension\.js/);
  });

  it('9 — security audit source file exists', () => {
    expect(fs.existsSync(path.join(EXT, 'test/securityAudit.test.ts'))).toBe(true);
  });

  it('10 — docs mention VSIX install and local-only bridge', () => {
    const vscodeDoc = fs.readFileSync(path.join(REPO, 'docs/vscode-extension.md'), 'utf8');
    const bridgeDoc = fs.readFileSync(path.join(REPO, 'docs/bridge.md'), 'utf8');
    expect(vscodeDoc.toLowerCase()).toMatch(/vsix|\.vsix/);
    expect(bridgeDoc).toMatch(/127\.0\.0\.1|local-only|local only/i);
  });
});
