import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  detectStaticAppEntry,
  formatOpenHint,
  resolveLinkedAssets,
} from '../../src/agent/staticAppEntry.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-entry-'));
});
afterEach(async () => {
  await fs.rm(cwd, {force: true, recursive: true});
});

const write = async (rel: string, content: string): Promise<void> => {
  const abs = path.join(cwd, rel);
  await fs.mkdir(path.dirname(abs), {recursive: true});
  await fs.writeFile(abs, content);
};

const HTML = (css: string, js: string): string =>
  `<!doctype html><html><head><link rel="stylesheet" href="${css}"></head><body><script src="${js}"></script></body></html>`;

describe('resolveLinkedAssets', () => {
  it('parses linked css/js relative to the entry directory', () => {
    const {styles, scripts} = resolveLinkedAssets('calculator/index.html', HTML('styles.css', 'script.js'));
    expect(styles).toEqual(['calculator/styles.css']);
    expect(scripts).toEqual(['calculator/script.js']);
  });

  it('ignores external and inline assets', () => {
    const html = `<link rel="stylesheet" href="https://cdn/x.css"><link rel="stylesheet" href="./local.css"><script src="//cdn/a.js"></script><script>inline()</script>`;
    const {styles, scripts} = resolveLinkedAssets('index.html', html);
    expect(styles).toEqual(['local.css']);
    expect(scripts).toEqual([]);
  });

  it('handles href before/after rel and ../ paths', () => {
    const html = `<link href="../shared/theme.css" rel="stylesheet">`;
    const {styles} = resolveLinkedAssets('app/index.html', html);
    expect(styles).toEqual(['shared/theme.css']);
  });
});

describe('detectStaticAppEntry', () => {
  it('prefers a nested app folder over a stale root index.html', async () => {
    await write('index.html', HTML('styles.css', 'app.js'));
    await write('styles.css', 'body{}');
    await write('app.js', '');
    // Make the nested app newer so it is the active app.
    await new Promise((r) => setTimeout(r, 10));
    await write('calculator/index.html', HTML('styles.css', 'script.js'));
    await write('calculator/styles.css', 'body{background:#000}');
    await write('calculator/script.js', '');

    const entry = await detectStaticAppEntry(cwd, [], 'fix the calculator layout');
    expect(entry?.htmlPath).toBe('calculator/index.html');
    expect(entry?.dir).toBe('calculator');
    expect(entry?.styles).toEqual(['calculator/styles.css']);
    expect(entry?.missing).toEqual([]);
  });

  it('honours an explicitly mentioned nested entry', async () => {
    await write('index.html', HTML('styles.css', 'app.js'));
    await write('calculator/index.html', HTML('styles.css', 'script.js'));
    await write('calculator/styles.css', 'body{}');
    await write('calculator/script.js', '');
    const entry = await detectStaticAppEntry(cwd, [], 'read calculator/index.html then fix it');
    expect(entry?.htmlPath).toBe('calculator/index.html');
  });

  it('reports missing linked assets', async () => {
    await write('calculator/index.html', HTML('styles.css', 'script.js'));
    // styles.css and script.js intentionally not created
    const entry = await detectStaticAppEntry(cwd, [], 'fix calculator');
    expect(entry?.missing).toEqual(expect.arrayContaining(['calculator/styles.css', 'calculator/script.js']));
  });

  it('returns null when no html entry exists', async () => {
    await write('package.json', '{}');
    const entry = await detectStaticAppEntry(cwd, [], 'do something');
    expect(entry).toBeNull();
  });
});

describe('formatOpenHint', () => {
  it('names the exact entry file', () => {
    expect(formatOpenHint({dir: 'calculator', htmlPath: 'calculator/index.html', missing: [], scripts: [], styles: []}))
      .toBe('Open calculator/index.html in your browser.');
    expect(formatOpenHint(null)).toBeNull();
  });
});
