import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const read = (relPath: string): string => readFileSync(resolve(repoRoot, relPath), 'utf8');

interface PackageJson {
  name: string;
  displayName?: string;
  description?: string;
  bin?: Record<string, string>;
  files?: string[];
}

const pkg = JSON.parse(read('package.json')) as PackageJson;

describe('public ApeironCode branding', () => {
  it('README presents ApeironCode and no user-facing OpenCode brand', () => {
    const readme = read('README.md');
    expect(readme).toContain('ApeironCode');
    // The capitalized product brand must not appear (lowercase `opencode`
    // legacy command/path references are checked separately).
    expect(readme).not.toContain('OpenCode');
  });

  it('package metadata uses the ApeironCode brand', () => {
    expect(pkg.displayName).toBe('ApeironCode');
    expect(pkg.description ?? '').not.toContain('OpenCode');
  });

  it('keeps apeironcode as the primary binary with opencode as a documented legacy alias', () => {
    // The `opencode` bin alias is intentionally retained for backward
    // compatibility (see docs/history.md and the brand-migration test).
    expect(pkg.bin).toHaveProperty('apeironcode');
    expect(pkg.bin).toHaveProperty('opencode');
    expect(pkg.bin?.apeironcode).toBe(pkg.bin?.opencode);
  });

  it('packaged docs do not present the OpenCode product brand', () => {
    const packagedDocs = (pkg.files ?? []).filter(
      (entry) => entry.startsWith('docs/') && entry.endsWith('.md'),
    );
    expect(packagedDocs.length).toBeGreaterThan(0);

    // history.md exists specifically to document the OpenCode -> ApeironCode
    // rename, so it is allowed to name the former brand.
    const allowed = new Set(['docs/history.md']);
    for (const doc of packagedDocs) {
      if (allowed.has(doc)) continue;
      expect(read(doc), `${doc} should not contain the OpenCode brand`).not.toContain('OpenCode');
    }
  });

  it('history.md documents the rename and the retained legacy alias', () => {
    const history = read('docs/history.md');
    expect(history).toContain('ApeironCode');
    expect(history.toLowerCase()).toContain('opencode');
  });
});
