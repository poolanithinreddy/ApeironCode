import {describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {
  checkOllamaStatus,
  formatOllamaPullHint,
  formatOllamaRecommendations,
  formatOllamaStatus,
} from '../../src/providers/ollamaUx.js';

describe('ollama UX helpers', () => {
  it('formats unreachable setup guidance', async () => {
    const status = await checkOllamaStatus(DEFAULT_CONFIG, () => Promise.reject(new Error('offline')));
    expect(status.reachable).toBe(false);
    expect(formatOllamaStatus(status)).toContain('ollama serve');
  });

  it('lists installed recommendations and missing pull hints', async () => {
    const response = new Response(JSON.stringify({models: [{name: 'qwen2.5-coder:7b'}]}), {status: 200});
    const status = await checkOllamaStatus(DEFAULT_CONFIG, () => Promise.resolve(response));
    const formatted = formatOllamaRecommendations(status);

    expect(formatted).toContain('qwen2.5-coder:7b | installed');
    expect(formatted).toContain('ollama pull qwen2.5-coder:14b');
    expect(formatOllamaPullHint('codellama')).toContain('ollama pull codellama');
  });
});
