import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './csp';

const scriptDirective = (policy: string): string =>
  policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src')) ?? '';

describe('buildContentSecurityPolicy', () => {
  it('matches the production policy from SPEC §15.3 exactly', () => {
    expect(buildContentSecurityPolicy('production')).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'",
    );
  });

  it('never allows inline scripts, eval or localhost connections in production', () => {
    const policy = buildContentSecurityPolicy('production');

    expect(scriptDirective(policy)).toBe("script-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('ws://');
    expect(policy).not.toContain('http://');
    expect(policy).not.toContain('localhost');
  });

  it('allows the Vite dev server and HMR socket only in development', () => {
    const policy = buildContentSecurityPolicy('development');

    expect(scriptDirective(policy)).toContain("'unsafe-inline'");
    expect(policy).toContain('ws://localhost:*');
    expect(policy).toContain('http://localhost:*');
    expect(policy.startsWith("default-src 'self';")).toBe(true);
  });

  it('keeps the remaining directives unchanged between modes', () => {
    const directives = (policy: string): string[] =>
      policy
        .split(';')
        .map((directive) => directive.trim())
        .filter((directive) => !directive.startsWith('script-src'))
        .filter((directive) => !directive.startsWith('connect-src'));

    expect(directives(buildContentSecurityPolicy('development'))).toEqual(
      directives(buildContentSecurityPolicy('production')),
    );
  });
});
