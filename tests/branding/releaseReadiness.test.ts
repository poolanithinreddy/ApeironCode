import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));

describe('release readiness — required public files', () => {
  const REQUIRED = [
    'README.md',
    'LICENSE',
    'CONTRIBUTING.md',
    'SECURITY.md',
    '.env.example',
    'docs/release-checklist.md',
    'docs/launch-copy.md',
    'docs/release-notes/v0.1.0-alpha.md',
    '.github/pull_request_template.md',
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/ISSUE_TEMPLATE/dogfood_failure.yml',
  ];

  it.each(REQUIRED)('has %s', (file) => {
    expect(exists(file)).toBe(true);
  });
});

describe('release readiness — honest, accurate copy', () => {
  it('README does not over-claim or mis-state affiliation', () => {
    const readme = read('README.md');
    expect(readme).not.toMatch(/Claude Code killer/i);
    expect(readme).not.toMatch(/production[- ]proven|enterprise[- ]ready|fully autonomous/i);
    // The over-eager rename bug: must not claim non-affiliation with itself.
    expect(readme).not.toMatch(/not affiliated with[^.]*ApeironCode team/i);
  });

  it('.env.example contains placeholders only, never real keys', () => {
    const env = read('.env.example');
    expect(env).toMatch(/OPENAI_API_KEY=\s*$/m);
    expect(env).toMatch(/ANTHROPIC_API_KEY=\s*$/m);
    expect(env).not.toMatch(/sk-[A-Za-z0-9]{20}/);
    expect(env).not.toMatch(/ghp_[A-Za-z0-9]{30}/);
  });

  it('package.json has public-ready metadata', () => {
    const pkg = JSON.parse(read('package.json')) as {
      description: string;
      license: string;
      keywords: string[];
    };
    expect(pkg.license).toBe('MIT');
    expect(pkg.description).toMatch(/local-first/i);
    expect(pkg.keywords).toContain('local-first');
    expect(pkg.keywords).toContain('coding-agent');
  });
});

describe('CLI-only alpha — VS Code / web excluded from the package', () => {
  it('package files allowlist ships CLI artifacts only', () => {
    const pkg = JSON.parse(read('package.json')) as {files: string[]; scripts: Record<string, string>};
    // No extensions/ or ApeironCode-web/ in the published files allowlist.
    expect(pkg.files.some((f) => /extensions|ApeironCode-web/i.test(f))).toBe(false);
    // Public script surface must not expose VS Code build scripts.
    expect(Object.keys(pkg.scripts).some((k) => /^vscode:/.test(k))).toBe(false);
  });

  it('README marks the release CLI-only and does not advertise VS Code as available', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/CLI-only public release/i);
    expect(readme).toMatch(/VS Code extension[\s\S]*?not[\s\S]*?part of this public alpha/i);
  });

  it('release notes state the CLI-only / no-VS-Code limitation', () => {
    const notes = read('docs/release-notes/v0.1.0-alpha.md');
    expect(notes).toMatch(/CLI[- ]only/i);
    expect(notes).toMatch(/VS Code extension is not part of this public alpha/i);
  });
});
