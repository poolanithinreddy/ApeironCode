import {describe, expect, it} from 'vitest';

import {
  createStaticWebAppFiles,
  formatStaticWebAppPlan,
} from '../../src/agent/staticWebAppTemplates.js';

describe('staticWebAppTemplates', () => {
  it('returns exactly three deterministic files with correct paths', () => {
    const files = createStaticWebAppFiles({theme: 'modern landing page'});
    expect(files.map((file) => file.path)).toEqual(['index.html', 'styles.css', 'app.js']);
    expect(files.every((file) => file.content.trim().length > 0)).toBe(true);
    expect(createStaticWebAppFiles({theme: 'modern landing page'})).toEqual(files);
  });

  it('links CSS and JS from index.html', () => {
    const index = createStaticWebAppFiles().find((file) => file.path === 'index.html')?.content ?? '';
    expect(index).toContain('href="styles.css"');
    expect(index).toContain('src="app.js"');
  });

  it('does not include external network links or secret-looking content', () => {
    const all = createStaticWebAppFiles().map((file) => file.content).join('\n');
    expect(all).not.toMatch(/https?:\/\//iu);
    expect(all).not.toMatch(/api[_-]?key|token|secret|password/iu);
  });

  it('formats a concise scaffold plan', () => {
    const plan = formatStaticWebAppPlan(createStaticWebAppFiles());
    expect(plan).toContain('index.html');
    expect(plan).toContain('styles.css');
    expect(plan).toContain('app.js');
  });
});
