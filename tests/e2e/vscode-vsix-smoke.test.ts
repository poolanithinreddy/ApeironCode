/**
 * VSIX smoke tests — verify the packaged extension is valid and safe.
 * Uses the existing built .vsix file (must run after vscode:package).
 * No real VS Code host required.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {execSync} from 'node:child_process';

const EXT_ROOT = path.join(import.meta.dirname ?? __dirname, '../../extensions/vscode');
const VSIX_PATH = path.join(EXT_ROOT, 'apeironcode-0.1.0.vsix');
const PKG_PATH = path.join(EXT_ROOT, 'package.json');

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as Record<string, unknown>;

describe('VSIX file existence and size', () => {
  it('VSIX file exists', () => {
    expect(fs.existsSync(VSIX_PATH), 'apeironcode-0.1.0.vsix should exist — run npm run private:vscode:package first').toBe(true);
  });

  it('VSIX has nonzero size', () => {
    if (!fs.existsSync(VSIX_PATH)) return;
    const stat = fs.statSync(VSIX_PATH);
    expect(stat.size).toBeGreaterThan(10_000); // should be at least 10KB
  });

  it('VSIX is a ZIP file (PK magic bytes)', () => {
    if (!fs.existsSync(VSIX_PATH)) return;
    const buf = Buffer.allocUnsafe(4);
    const fd = fs.openSync(VSIX_PATH, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    // ZIP magic: PK\x03\x04
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
  });
});

describe('VSIX package manifest (package.json)', () => {
  it('has name apeironcode', () => {
    expect(pkg['name']).toBe('apeironcode');
  });

  it('has displayName ApeironCode', () => {
    expect(pkg['displayName']).toBe('ApeironCode');
  });

  it('has valid version semver', () => {
    expect(String(pkg['version'])).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('has publisher', () => {
    expect(typeof pkg['publisher']).toBe('string');
    expect((pkg['publisher'] as string).length).toBeGreaterThan(0);
  });

  it('has MIT license', () => {
    expect(String(pkg['license'])).toContain('MIT');
  });

  it('engines.vscode is set', () => {
    const engines = pkg['engines'] as Record<string, string>;
    expect(typeof engines?.['vscode']).toBe('string');
  });

  it('has required ApeironCode commands', () => {
    const commands = ((pkg['contributes'] as Record<string, unknown>)?.['commands'] as Array<Record<string, string>>) ?? [];
    const ids = commands.map((c) => c['command']);
    expect(ids).toContain('apeironcode.openChat');
    expect(ids).toContain('apeironcode.startBridge');
    expect(ids).toContain('apeironcode.showSetup');
    expect(ids).toContain('apeironcode.selectModel');
    expect(ids).toContain('apeironcode.clearChat');
  });

  it('no stale OpenCode branding in manifest', () => {
    const raw = JSON.stringify(pkg);
    expect(raw).not.toContain('"opencode"');
    expect(raw).not.toContain('OpenCode Agent');
  });

  it('no publish script in package.json', () => {
    const scripts = (pkg['scripts'] as Record<string, string>) ?? {};
    const raw = JSON.stringify(scripts);
    expect(raw).not.toMatch(/vsce\s+publish/i);
    expect(raw).not.toMatch(/marketplace.*publish/i);
  });
});

describe('VSIX archive contents (requires unzip)', () => {
  const listVsix = (): string => {
    if (!fs.existsSync(VSIX_PATH)) return '';
    try {
      return execSync(`unzip -l "${VSIX_PATH}"`, {encoding: 'utf8', maxBuffer: 4_000_000});
    } catch {
      return '';
    }
  };

  it('includes icon, README, LICENSE, CHANGELOG in extension folder', () => {
    const listing = listVsix();
    if (!listing) return;
    expect(listing).toMatch(/extension\/images\/icon\.png/i);
    expect(listing).toMatch(/extension\/README\.md/i);
    expect(listing).toMatch(/extension\/LICENSE/i);
    expect(listing).toMatch(/extension\/CHANGELOG\.md/i);
  });

  it('includes compiled extension entry', () => {
    const listing = listVsix();
    if (!listing) return;
    expect(listing).toMatch(/extension\/out\/extension\.js/i);
  });

  it('does not ship extension/tests or extension/src', () => {
    const listing = listVsix();
    if (!listing) return;
    expect(listing).not.toMatch(/extension\/test\//i);
    expect(listing).not.toMatch(/extension\/src\//i);
  });

  it('does not ship .env or secrets in extension bundle paths', () => {
    const listing = listVsix();
    if (!listing) return;
    expect(listing).not.toMatch(/extension\/.*\.env/i);
  });
});

describe('Extension source files present', () => {
  it('icon file exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'images/icon.png'))).toBe(true);
  });

  it('icon is a valid PNG', () => {
    const buf = fs.readFileSync(path.join(EXT_ROOT, 'images/icon.png'));
    // PNG magic bytes: \x89PNG\r\n\x1a\n
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  it('icon is 128×128 PNG (IHDR)', () => {
    const iconPath = path.join(EXT_ROOT, 'images/icon.png');
    const buf = fs.readFileSync(iconPath);
    expect(buf.length).toBeGreaterThan(32);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(128);
    expect(h).toBe(128);
  });

  it('README exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'README.md'))).toBe(true);
  });

  it('CHANGELOG exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'CHANGELOG.md'))).toBe(true);
  });

  it('LICENSE exists', () => {
    expect(fs.existsSync(path.join(EXT_ROOT, 'LICENSE'))).toBe(true);
  });
});

describe('Package safety checks (pre-packaging)', () => {
  it('no .env files in extension source tree', () => {
    const srcDir = path.join(EXT_ROOT, 'src');
    const envFiles: string[] = [];
    const scan = (dir: string): void => {
      for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        if (e.isDirectory()) scan(path.join(dir, e.name));
        else if (e.name.startsWith('.env') || e.name.includes('secret')) envFiles.push(e.name);
      }
    };
    scan(srcDir);
    expect(envFiles).toHaveLength(0);
  });

  it('no raw token patterns in package.json', () => {
    const raw = JSON.stringify(pkg);
    expect(raw).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(raw).not.toMatch(/apiKey\s*:/i);
  });

  it('package script produces correct VSIX name', () => {
    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    expect(scripts?.['package']).toContain('vsce package');
    // Version in package.json matches expected VSIX filename
    const version = String(pkg['version']);
    const expectedVsix = `apeironcode-${version}.vsix`;
    if (fs.existsSync(VSIX_PATH)) {
      expect(fs.existsSync(path.join(EXT_ROOT, expectedVsix))).toBe(true);
    }
  });
});
