import {describe, expect, it} from 'vitest';

import {formatBrandName, renderApeironLogo} from '../../src/ui/brand.js';
import {stripAnsi} from '../../src/ui/theme.js';

describe('ApeironCode brand', () => {
  it('formats brand and logo without stale branding', () => {
    expect(formatBrandName()).toBe('ApeironCode');
    const compact = stripAnsi(renderApeironLogo({variant: 'compact', colorMode: 'no-color'}));
    const wide = stripAnsi(renderApeironLogo({variant: 'wide', colorMode: 'no-color'}));
    expect(compact).toContain('APEIRONCODE');
    expect(wide).toContain('local-first coding agent OS');
    expect(`${compact}\n${wide}`).not.toContain('OpenCode');
  });
});
