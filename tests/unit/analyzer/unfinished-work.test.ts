import { describe, expect, it } from 'vitest';
import { analyzeUnfinishedWorkFromSource } from '../../../packages/core/src/analyzer/unfinished-work';

describe('Unfinished Work Analysis', () => {
  it('detects TODO-style comment markers', () => {
    const findings = analyzeUnfinishedWorkFromSource(`
      // TODO: support retry logic
      export function run() {
        return true;
      }
    `);

    expect(findings.some((finding) => finding.kind === 'todo')).toBe(true);
    expect(findings[0].detail).toContain('support retry logic');
  });

  it('detects empty stub functions', () => {
    const findings = analyzeUnfinishedWorkFromSource(`
      export function later() {}
    `);

    expect(findings.some((finding) => finding.kind === 'stub')).toBe(true);
  });

  it('detects explicit not-implemented errors', () => {
    const findings = analyzeUnfinishedWorkFromSource(`
      export function launch() {
        throw new Error('Not implemented yet');
      }
    `);

    expect(findings.some((finding) => finding.kind === 'not-implemented')).toBe(true);
    expect(findings.some((finding) => finding.severity === 'critical')).toBe(true);
  });
});
