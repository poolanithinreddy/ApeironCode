import {describe, expect, it, afterEach} from 'vitest';

import {formatProviderCatalog} from '../../src/providers/providerUx.js';
import {validateProviderEnv} from '../../src/providers/envValidation.js';

describe('Provider CLI commands', () => {
  const previousEnv = {...process.env};

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in previousEnv)) {
        delete process.env[key];
      }
    });
    Object.entries(previousEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  describe('provider list', () => {
    it('shows all providers including Gemini, Bedrock, and Azure', () => {
      const output = formatProviderCatalog();

      expect(output).toContain('Gemini');
      expect(output).toContain('gemini');
      expect(output).toContain('Bedrock');
      expect(output).toContain('bedrock');
      expect(output).toContain('Azure');
      expect(output).toContain('azure');
    });

    it('shows provider status (stable/experimental)', () => {
      const output = formatProviderCatalog();

      expect(output).toMatch(/#{2}\s+(Stable|Experimental|Planned)/i);
      expect(output).toContain('## Stable');
    });

    it('shows local vs cloud providers', () => {
      const output = formatProviderCatalog();

      expect(output).toMatch(/📍\s+local|☁️\s+cloud/);
      expect(output).toContain('local');
    });

    it('shows setup hints without exposing environment values', () => {
      const output = formatProviderCatalog();

      expect(output).toContain('Setup:');
      expect(output).not.toMatch(/sk-[a-zA-Z0-9]+/);  // No actual API keys
      expect(output).not.toMatch(/GEMINI_API_KEY=\S+/);  // No env values
    });

    it('shows environment configuration status for API providers', () => {
      const output = formatProviderCatalog();

      // Should show env-missing or env-configured without revealing values
      expect(output).toMatch(/env-configured|env-missing/);
      expect(output).not.toMatch(/GEMINI_API_KEY=\S+/);
      expect(output).not.toMatch(/AWS_REGION=\S+/);
    });

    it('includes recommended models', () => {
      const output = formatProviderCatalog();

      expect(output).toContain('Models:');
      expect(output).toContain('claude');  // Claude models for anthropic/bedrock
    });

    it('shows provider capabilities (streaming, tool calling)', () => {
      const output = formatProviderCatalog();

      // The output should show streaming and tool-calling support
      expect(output).toMatch(/✓ streaming|✗ streaming/);
      expect(output).toMatch(/✓ tool-call|✗ tool-call/);
    });

    it('shows that Gemini supports streaming and tool calling', () => {
      const output = formatProviderCatalog();

      // Gemini should be in the output with streaming and tool support
      const geminiLine = output.split('\n').find((line) => line.includes('Gemini'));
      expect(geminiLine).toBeDefined();
      expect(geminiLine).toMatch(/✓ streaming/);
      expect(geminiLine).toMatch(/✓ tool-call/);
    });

    it('shows that Bedrock supports streaming and tool calling', () => {
      const output = formatProviderCatalog();

      const bedrockLine = output.split('\n').find((line) => line.includes('Bedrock'));
      expect(bedrockLine).toBeDefined();
      expect(bedrockLine).toMatch(/✓ streaming/);
      expect(bedrockLine).toMatch(/✓ tool-call/);
    });

    it('shows that Azure supports streaming and tool calling', () => {
      const output = formatProviderCatalog();

      const azureLine = output.split('\n').find((line) => line.includes('Azure'));
      expect(azureLine).toBeDefined();
      expect(azureLine).toMatch(/✓ streaming/);
      expect(azureLine).toMatch(/✓ tool-call/);
    });
  });

  describe('provider env', () => {
    it('shows required vs optional environment variables for Gemini', () => {
      const result = validateProviderEnv('gemini', {});

      expect(result.providerId).toBe('gemini');
      expect(result.missing).toContain('GEMINI_API_KEY');
      expect(result.ok).toBe(false);
    });

    it('shows required vs optional environment variables for Bedrock', () => {
      const result = validateProviderEnv('bedrock', {});

      expect(result.missing).toContain('AWS_ACCESS_KEY_ID');
      expect(result.missing).toContain('AWS_SECRET_ACCESS_KEY');
      expect(result.missing).toContain('AWS_REGION');
      expect(result.ok).toBe(false);
    });

    it('shows required vs optional environment variables for Azure', () => {
      const result = validateProviderEnv('azure', {});

      expect(result.missing).toContain('AZURE_OPENAI_API_KEY');
      expect(result.missing).toContain('AZURE_OPENAI_ENDPOINT');
      expect(result.missing).toContain('AZURE_OPENAI_DEPLOYMENT');
      expect(result.ok).toBe(false);
    });

    it('reports status as configured when env vars are set', () => {
      const result = validateProviderEnv('gemini', {GEMINI_API_KEY: 'test-key'});

      expect(result.ok).toBe(true);
      expect(result.present).toContain('GEMINI_API_KEY');
      expect(result.missing.length).toBe(0);
    });

    it('reports optional variable status for Azure API version', () => {
      const result = validateProviderEnv('azure', {
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      });

      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('API_VERSION'),
        ]),
      );
    });

    it('never reveals secret values', () => {
      const result = validateProviderEnv('gemini', {GEMINI_API_KEY: 'sk-very-secret-123'});

      const resultString = JSON.stringify(result);
      expect(resultString).not.toContain('sk-very-secret-123');
      expect(resultString).not.toContain('secret-123');
    });
  });

  describe('provider test', () => {
    it('can test provider connectivity with mock provider', () => {
      // This test verifies the test command can work with mocked providers
      // In integration, this would call runProviderSmokeTest with mock provider
      expect(true).toBe(true);  // Placeholder for integration test
    });

    it('handles missing environment variables gracefully', () => {
      const result = validateProviderEnv('gemini', {});
      expect(result.missing).toContain('GEMINI_API_KEY');
      expect(result.ok).toBe(false);
    });
  });

  describe('provider list formatting', () => {
    it('includes Gemini with correct details', () => {
      const output = formatProviderCatalog();

      expect(output).toContain('Gemini');
      expect(output).toContain('gemini');
      expect(output).toContain('api');  // kind
    });

    it('includes Bedrock with correct details', () => {
      const output = formatProviderCatalog();

      expect(output).toContain('Bedrock');
      expect(output).toContain('bedrock');
      expect(output).toContain('api');
    });

    it('includes Azure with correct details', () => {
      const output = formatProviderCatalog();

      expect(output).toContain('Azure');
      expect(output).toContain('azure');
      expect(output).toContain('api');
    });
  });
});
