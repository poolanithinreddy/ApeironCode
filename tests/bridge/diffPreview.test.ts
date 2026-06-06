import {describe, expect, it} from 'vitest';
import {
  summarizeDiffForBridge,
  createDiffPreviewMessage,
  formatBridgeDiffSummary,
} from '../../src/bridge/diffPreview.js';

const SAMPLE_DIFF = `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,7 @@
-const OLD = 1;
+const NEW = 2;
+const ADDED = 3;
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,2 +1,2 @@
-const old = 'x';
+const config = 'y';
`;

describe('summarizeDiffForBridge', () => {
  it('counts additions and deletions', () => {
    const summary = summarizeDiffForBridge(SAMPLE_DIFF);
    expect(summary.totalAdditions).toBeGreaterThan(0);
    expect(summary.totalDeletions).toBeGreaterThan(0);
  });

  it('identifies changed files', () => {
    const summary = summarizeDiffForBridge(SAMPLE_DIFF);
    expect(summary.files.some((f) => f.path.includes('auth.ts'))).toBe(true);
    expect(summary.files.some((f) => f.path.includes('config.ts'))).toBe(true);
  });

  it('flags protected paths as risky', () => {
    const riskyDiff = `--- a/.env
+++ b/.env
@@ -1 +1 @@
-API_KEY=old
+API_KEY=new
`;
    const summary = summarizeDiffForBridge(riskyDiff);
    expect(summary.riskyPaths.length).toBeGreaterThan(0);
    expect(summary.files.some((f) => f.risky)).toBe(true);
  });

  it('truncates large diffs', () => {
    const hugeDiff = '+' + 'a'.repeat(5000);
    const summary = summarizeDiffForBridge(hugeDiff);
    expect(summary.truncated).toBe(true);
    expect(summary.patchPreview.length).toBeLessThanOrEqual(3100);
  });

  it('handles empty diff', () => {
    const summary = summarizeDiffForBridge('');
    expect(summary.files).toHaveLength(0);
    expect(summary.totalAdditions).toBe(0);
  });
});

describe('createDiffPreviewMessage', () => {
  it('creates diff.preview bridge message', () => {
    const msg = createDiffPreviewMessage(SAMPLE_DIFF);
    expect(msg.type).toBe('diff.preview');
    expect(Array.isArray(msg.payload['files'])).toBe(true);
    expect(typeof msg.payload['totalAdditions']).toBe('number');
  });

  it('redacts secrets from patch preview', () => {
    const secretDiff = `+++ b/src/main.ts\n+const key = 'sk-ant-api-secretxxxxxxxxx12345678';\n`;
    const msg = createDiffPreviewMessage(secretDiff);
    const preview = msg.payload['patchPreview'] as string;
    expect(preview).not.toContain('sk-ant-api-secret');
  });

  it('includes risky paths in payload', () => {
    const riskyDiff = `--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-old\n+new\n`;
    const msg = createDiffPreviewMessage(riskyDiff);
    expect(Array.isArray(msg.payload['riskyPaths'])).toBe(true);
    expect((msg.payload['riskyPaths'] as string[]).length).toBeGreaterThan(0);
  });
});

describe('formatBridgeDiffSummary', () => {
  it('includes file count and +/- stats', () => {
    const summary = summarizeDiffForBridge(SAMPLE_DIFF);
    const formatted = formatBridgeDiffSummary(summary);
    expect(formatted).toContain('Files changed:');
    expect(formatted).toContain('+');
  });

  it('includes risky path warning', () => {
    const riskyDiff = `--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-old\n+new\n`;
    const summary = summarizeDiffForBridge(riskyDiff);
    const formatted = formatBridgeDiffSummary(summary);
    expect(formatted).toContain('Risky paths');
  });
});
