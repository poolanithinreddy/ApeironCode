import {describe, expect, it, beforeEach, vi} from 'vitest';
import {LspManager} from '../../src/lsp/manager.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('LspManager', () => {
  let manager: LspManager;

  beforeEach(() => {
    manager = new LspManager();
    vi.clearAllMocks();
  });

  it('should initialize with default options', () => {
    expect(manager.isEnabled()).toBe(true);
    expect(manager.isFallbackEnabled()).toBe(true);
  });

  it('should get language status', async () => {
    const status = await manager.getLanguageStatus('TypeScript');
    expect(status.language).toBe('TypeScript');
    expect(['available', 'missing', 'unsupported']).toContain(status.status);
  });

  it('should format status report', async () => {
    const result = await manager.getLanguageStatus('TypeScript');
    const formatted = manager.formatStatusReport(result);
    expect(formatted).toContain('TypeScript');
  });

  it('should format all status report', async () => {
    const report = await manager.formatAllStatusReport();
    expect(report.length).toBeGreaterThan(0);
    expect(report[0]).toContain(':');
  });

  it('should cache language status', async () => {
    const status1 = await manager.getLanguageStatus('TypeScript');
    const status2 = await manager.getLanguageStatus('TypeScript');
    expect(status1).toBe(status2);
  });

  it('should clear cache', async () => {
    await manager.getLanguageStatus('TypeScript');
    manager.clearCache();

    const status = await manager.getLanguageStatus('TypeScript');
    expect(status).toBeDefined();
  });

  it('should get file status by extension', async () => {
    const status = await manager.getFileStatus('test.ts');
    expect(status.language).toBe('TypeScript');
  });

  it('should infer language from JavaScript file', async () => {
    const status = await manager.getFileStatus('test.js');
    expect(status.language).toBe('JavaScript');
  });

  it('should infer language from Python file', async () => {
    const status = await manager.getFileStatus('test.py');
    expect(status.language).toBe('Python');
  });
});
