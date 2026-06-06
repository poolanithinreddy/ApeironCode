import {describe, expect, it} from 'vitest';

import {formatApprovalReview} from '../../src/safety/approvalFormat.js';

describe('approval review formatter', () => {
  it('redacts previews and includes risk context', () => {
    const output = formatApprovalReview({
      action: 'GitHub issue create',
      filesAffected: ['src/a.ts'],
      preview: 'API_KEY=super-secret',
      reason: 'posting connector write',
      riskLevel: 'high',
      target: 'github issue',
    });

    expect(output).toContain('Risk: high');
    expect(output).toContain('src/a.ts');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('super-secret');
  });

  it('never renders a misleading "Files affected: none" line', () => {
    const output = formatApprovalReview({
      action: 'Approve shell command',
      preview: 'Run validation',
      reason: 'validate build',
      riskLevel: 'medium',
      target: 'npm run build',
    });
    expect(output).not.toContain('Files affected: none');
    expect(output).not.toContain('Preview: none');
  });

  it('derives the affected files from a comma-joined file-plan target', () => {
    const output = formatApprovalReview({
      action: 'Approve file plan',
      preview: 'Plan: repair UI',
      reason: 'apply UI repair',
      riskLevel: 'medium',
      target: 'calculator/index.html, calculator/styles.css',
    });
    expect(output).toContain('Files affected:');
    expect(output).toContain('- calculator/index.html');
    expect(output).toContain('- calculator/styles.css');
  });
});
