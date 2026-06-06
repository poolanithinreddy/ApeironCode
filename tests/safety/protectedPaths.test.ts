import {describe, expect, it} from 'vitest';

import {
  classifyPathRisk,
  formatProtectedPathWarning,
} from '../../src/safety/protectedPaths.js';

describe('protectedPaths', () => {
  it('.env is critical credential', () => {
    const r = classifyPathRisk('.env');
    expect(r.riskLevel).toBe('critical');
    expect(r.category).toBe('credential');
  });

  it('.env.local is critical', () => {
    expect(classifyPathRisk('.env.local').riskLevel).toBe('critical');
  });

  it('id_rsa is critical', () => {
    expect(classifyPathRisk('/home/user/.ssh/id_rsa').riskLevel).toBe('critical');
  });

  it('aws credentials is critical', () => {
    expect(classifyPathRisk('/home/user/.aws/credentials').riskLevel).toBe('critical');
  });

  it('/etc/passwd is high system', () => {
    const r = classifyPathRisk('/etc/passwd');
    expect(r.riskLevel).toBe('high');
    expect(r.category).toBe('system');
  });

  it('.git/config is high vcs', () => {
    const r = classifyPathRisk('.git/config');
    expect(r.riskLevel).toBe('high');
    expect(r.category).toBe('vcs');
  });

  it('.github/workflows/ci.yml is medium ci', () => {
    const r = classifyPathRisk('.github/workflows/ci.yml');
    expect(r.riskLevel).toBe('medium');
    expect(r.category).toBe('ci');
  });

  it('package-lock.json is low lockfile', () => {
    const r = classifyPathRisk('package-lock.json');
    expect(r.riskLevel).toBe('low');
    expect(r.category).toBe('lockfile');
  });

  it('src/index.ts is safe', () => {
    expect(classifyPathRisk('src/index.ts').riskLevel).toBe('safe');
  });

  it('format does not include any obvious secret content', () => {
    const text = formatProtectedPathWarning([classifyPathRisk('.env')]);
    expect(text).toContain('.env');
    expect(text).not.toMatch(/[A-Za-z0-9_-]{40,}/u);
  });
});
