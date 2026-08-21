import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Configuration test (roadmap §11): the retired image-generation backend must
 * stay dormant behind a server-side disabled flag. The function source is the
 * deployed artifact (supabase functions deploy ships this file), so asserting
 * its default and its disabled-path response proves the configuration unless
 * someone deliberately sets AI_GENERATION_ENABLED=true in project secrets —
 * which D-012 classifies as a material decision requiring sign-off.
 */

const repoRoot = resolve(__dirname, '..', '..', '..', '..');
const functionSource = readFileSync(
  resolve(repoRoot, 'supabase', 'functions', 'ai-bookmate', 'index.ts'),
  'utf8',
);

describe('image-generation backend flag', () => {
  it('defaults AI_GENERATION_ENABLED to false', () => {
    expect(functionSource).toContain(
      'Deno.env.get("AI_GENERATION_ENABLED") ?? "false"',
    );
  });

  it('refuses generation requests with 410 Gone while disabled', () => {
    const disabledGuard = functionSource.indexOf('if (!AI_GENERATION_ENABLED)');
    expect(disabledGuard).toBeGreaterThan(-1);
    const guardBlock = functionSource.slice(disabledGuard, disabledGuard + 400);
    expect(guardBlock).toContain('410');
  });

  it('is not force-enabled anywhere in version-controlled configuration', () => {
    const configToml = readFileSync(resolve(repoRoot, 'supabase', 'config.toml'), 'utf8');
    expect(configToml).not.toMatch(/AI_GENERATION_ENABLED\s*=\s*"?true"?/i);
  });
});
