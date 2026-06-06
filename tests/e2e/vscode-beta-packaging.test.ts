/**
 * E2E tests for VS Code Beta Packaging + UX polish.
 * No real VS Code host, no marketplace publish, no real provider calls.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const EXT_ROOT = path.join(import.meta.dirname ?? __dirname, '../../extensions/vscode');
const ROOT = path.join(import.meta.dirname ?? __dirname, '../..');

const pkg = JSON.parse(
  fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'),
) as Record<string, unknown>;

const rootPkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
) as Record<string, unknown>;

describe('Extension manifest — beta commands', () => {
  const commands = ((pkg['contributes'] as Record<string, unknown>)?.['commands'] as Array<Record<string, string>>) ?? [];
  const commandIds = commands.map((c) => c['command']);

  const expectedCommands = [
    'apeironcode.openChat',
    'apeironcode.startBridge',
    'apeironcode.stopBridge',
    'apeironcode.showContext',
    'apeironcode.showTasks',
    'apeironcode.sendSelectionToChat',
    'apeironcode.showSetup',
    'apeironcode.selectModel',
    'apeironcode.runDoctor',
    'apeironcode.approvePermission',
    'apeironcode.denyPermission',
  ];

  for (const cmdId of expectedCommands) {
    it(`has command: ${cmdId}`, () => {
      expect(commandIds).toContain(cmdId);
    });
  }

  it('all command titles include ApeironCode category or label', () => {
    for (const cmd of commands) {
      const hasCategory = cmd['category'] === 'ApeironCode';
      expect(hasCategory, `Command ${cmd['command']} missing ApeironCode category`).toBe(true);
    }
  });

  it('no stale OpenCode branding in command titles', () => {
    for (const cmd of commands) {
      expect(String(cmd['title'] ?? '')).not.toContain('OpenCode');
    }
  });
});

describe('Extension manifest — settings', () => {
  const props = (
    (pkg['contributes'] as Record<string, unknown>)?.['configuration'] as Record<string, unknown>
  )?.['properties'] as Record<string, unknown>;

  it('has bridge auto-start setting', () => {
    expect(props).toHaveProperty('apeironcode.bridge.autoStart');
    const setting = props['apeironcode.bridge.autoStart'] as Record<string, unknown>;
    expect(setting['type']).toBe('boolean');
    expect(setting['default']).toBe(false);
  });

  it('has CLI path setting', () => {
    expect(props).toHaveProperty('apeironcode.cli.path');
  });

  it('has selected model setting', () => {
    expect(props).toHaveProperty('apeironcode.selectedModel');
  });

  it('bridge endpoint default is empty or local', () => {
    const endpointProp = props['apeironcode.bridgeEndpoint'] as Record<string, unknown>;
    const defaultVal = endpointProp?.['default'];
    if (typeof defaultVal === 'string' && defaultVal.length > 0) {
      expect(defaultVal).toMatch(/^ws:\/\/127\.0\.0\.1/);
    }
  });
});

describe('VSIX packaging', () => {
  it('package script exists in extension package.json', () => {
    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    expect(scripts).toBeDefined();
    expect(typeof scripts?.['package']).toBe('string');
    expect(scripts!['package']).toContain('vsce package');
  });

  it('a vscode package script exists in root package.json', () => {
    // Phase 19C: VS Code is not part of the CLI-only public alpha, so the
    // build scripts are kept under a `private:` prefix (not removed — the
    // extension source and its tests still live in the repo). Accept either
    // the legacy name or the private-gated name.
    const scripts = rootPkg['scripts'] as Record<string, string> | undefined;
    expect(scripts).toBeDefined();
    const packageScript = scripts?.['private:vscode:package'] ?? scripts?.['vscode:package'];
    expect(typeof packageScript).toBe('string');
  });

  it('.vscodeignore exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, '.vscodeignore'))).toBe(true);
  });

  it('.vscodeignore excludes test files', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, '.vscodeignore'), 'utf8');
    expect(content).toContain('test/**');
  });

  it('.vscodeignore excludes source maps', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, '.vscodeignore'), 'utf8');
    expect(content).toContain('*.map');
  });

  it('@vscode/vsce is a dev dependency', () => {
    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
    expect(devDeps).toHaveProperty('@vscode/vsce');
  });
});

describe('Auto-start safety', () => {
  it('autoStart.ts exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'src/bridge/autoStart.ts'))).toBe(true);
  });

  it('autoStart.ts does not log token', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/bridge/autoStart.ts'), 'utf8');
    expect(content).not.toMatch(/logger\.\w+\([^)]*token[^)]*\)/);
  });
});

describe('Status bar', () => {
  it('statusBar.ts exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'src/status/statusBar.ts'))).toBe(true);
  });

  it('status bar registers all connection states', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/status/statusBar.ts'), 'utf8');
    expect(content).toContain('disconnected');
    expect(content).toContain('connected');
    expect(content).toContain('error');
    expect(content).toContain('connecting');
  });
});

describe('Model selector', () => {
  it('modelSelector.ts exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'src/model/modelSelector.ts'))).toBe(true);
  });

  it('model selector does not call provider APIs directly', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/model/modelSelector.ts'), 'utf8');
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('http.get');
    expect(content).not.toContain('axios');
  });

  it('FALLBACK_MODELS is static and non-empty', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/model/modelSelector.ts'), 'utf8');
    expect(content).toContain('FALLBACK_MODELS');
    expect(content).toContain('anthropic');
  });
});

describe('First-run setup view', () => {
  it('buildSetupHtml is exported from webviewHtml', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/views/webviewHtml.ts'), 'utf8');
    expect(content).toContain('buildSetupHtml');
    expect(content).toContain('export');
  });

  it('setup HTML contains CLI start instructions', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/views/webviewHtml.ts'), 'utf8');
    expect(content).toContain('apeironcode bridge start');
  });

  it('setup HTML does not embed or print full token values', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'src/views/webviewHtml.ts'), 'utf8');
    // Should not hardcode or echo a real token string
    expect(content).not.toMatch(/token\s*=\s*["'][a-zA-Z0-9_-]{20,}["']/);
    // Should not call logger.info/debug with raw token
    expect(content).not.toMatch(/logger\.(info|debug)\([^)]*bridgeToken[^)]*\)/);
  });
});

describe('Docs — VSIX install guide', () => {
  it('vscode-extension.md exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/vscode-extension.md'))).toBe(true);
  });

  it('docs mention VSIX install', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docs/vscode-extension.md'), 'utf8');
    expect(content.toLowerCase()).toContain('vsix');
  });

  it('README mentions VSIX install', () => {
    const content = fs.readFileSync(path.join(EXT_ROOT, 'README.md'), 'utf8');
    expect(content.toLowerCase()).toContain('vsix');
  });

  it('docs mention bridge start command', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docs/vscode-extension.md'), 'utf8');
    expect(content).toContain('apeironcode bridge start');
  });
});
