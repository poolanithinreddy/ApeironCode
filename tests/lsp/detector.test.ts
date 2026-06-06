import {describe, expect, it, vi, beforeEach} from 'vitest';
import {LspDetector} from '../../src/lsp/detector.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('LspDetector', () => {
  let detector: LspDetector;

  beforeEach(() => {
    detector = new LspDetector();
    vi.clearAllMocks();
  });

  it('should detect TypeScript as unsupported when ts not available', async () => {
    const {execa} = await import('execa');
    vi.mocked(execa).mockRejectedValue(new Error('not found'));

    const result = await detector.detectLanguage('TypeScript');
    expect(result.language).toBe('TypeScript');
    expect(result.status).toBe('missing');
    expect(result.installed).toBe(false);
  });

  it('should detect unsupported language', async () => {
    const result = await detector.detectLanguage('Unsupported Language');
    expect(result.language).toBe('Unsupported Language');
    expect(result.status).toBe('unsupported');
    expect(result.installed).toBe(false);
  });

  it('should cache detection results', async () => {
    const {execa} = await import('execa');
    vi.mocked(execa).mockRejectedValue(new Error('not found'));

    const result1 = await detector.detectLanguage('TypeScript');
    const callCountAfterFirst = vi.mocked(execa).mock.calls.length;

    const result2 = await detector.detectLanguage('TypeScript');
    const callCountAfterSecond = vi.mocked(execa).mock.calls.length;

    expect(result1).toBe(result2);
    expect(callCountAfterSecond).toBe(callCountAfterFirst);
  });

  it('should clear cache', async () => {
    const {execa} = await import('execa');
    vi.mocked(execa).mockRejectedValue(new Error('not found'));

    await detector.detectLanguage('TypeScript');
    detector.clearCache();

    vi.mocked(execa).mockClear();
    vi.mocked(execa).mockRejectedValue(new Error('not found'));

    await detector.detectLanguage('TypeScript');
    expect(vi.mocked(execa).mock.calls.length).toBeGreaterThan(0);
  });
});
