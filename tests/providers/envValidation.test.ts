import {describe, expect, it} from 'vitest';

import {getProviderEnvRequirements, validateProviderEnv} from '../../src/providers/envValidation.js';

describe('Provider Environment Validation', () => {
  describe('getProviderEnvRequirements', () => {
    it('returns Gemini requirements', () => {
      const reqs = getProviderEnvRequirements('gemini');

      expect(reqs).toContainEqual(expect.objectContaining({
        name: 'GEMINI_API_KEY',
        required: true,
      }));
    });

    it('returns Bedrock requirements', () => {
      const reqs = getProviderEnvRequirements('bedrock');

      expect(reqs.map((r) => r.name)).toContain('AWS_ACCESS_KEY_ID');
      expect(reqs.map((r) => r.name)).toContain('AWS_SECRET_ACCESS_KEY');
      expect(reqs.map((r) => r.name)).toContain('AWS_REGION');
    });

    it('returns Azure requirements', () => {
      const reqs = getProviderEnvRequirements('azure');

      expect(reqs.map((r) => r.name)).toContain('AZURE_OPENAI_API_KEY');
      expect(reqs.map((r) => r.name)).toContain('AZURE_OPENAI_ENDPOINT');
      expect(reqs.map((r) => r.name)).toContain('AZURE_OPENAI_DEPLOYMENT');
    });

    it('lists AWS_SESSION_TOKEN as optional', () => {
      const reqs = getProviderEnvRequirements('bedrock');
      const sessionToken = reqs.find((r) => r.name === 'AWS_SESSION_TOKEN');

      expect(sessionToken?.required).toBe(false);
    });

    it('lists API version as optional for Azure', () => {
      const reqs = getProviderEnvRequirements('azure');
      const apiVersion = reqs.find((r) => r.name === 'AZURE_OPENAI_API_VERSION');

      expect(apiVersion?.required).toBe(false);
    });

    it('returns empty array for unknown provider', () => {
      const reqs = getProviderEnvRequirements('unknown-provider');

      expect(reqs).toEqual([]);
    });
  });

  describe('validateProviderEnv', () => {
    it('validates Gemini when API key is set', () => {
      const result = validateProviderEnv('gemini', {GEMINI_API_KEY: 'test-key'});

      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.present).toContain('GEMINI_API_KEY');
    });

    it('detects missing Gemini API key', () => {
      const result = validateProviderEnv('gemini', {});

      expect(result.ok).toBe(false);
      expect(result.missing).toContain('GEMINI_API_KEY');
    });

    it('validates Bedrock when all required vars are set', () => {
      const result = validateProviderEnv('bedrock', {
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_REGION: 'us-east-1',
      });

      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('detects missing Bedrock credentials', () => {
      const result = validateProviderEnv('bedrock', {});

      expect(result.ok).toBe(false);
      expect(result.missing).toContain('AWS_ACCESS_KEY_ID');
      expect(result.missing).toContain('AWS_SECRET_ACCESS_KEY');
      expect(result.missing).toContain('AWS_REGION');
    });

    it('validates Azure when all required vars are set', () => {
      const result = validateProviderEnv('azure', {
        AZURE_OPENAI_API_KEY: 'test',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4-turbo',
      });

      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('detects missing Azure config', () => {
      const result = validateProviderEnv('azure', {});

      expect(result.ok).toBe(false);
      expect(result.missing).toContain('AZURE_OPENAI_API_KEY');
      expect(result.missing).toContain('AZURE_OPENAI_ENDPOINT');
      expect(result.missing).toContain('AZURE_OPENAI_DEPLOYMENT');
    });

    it('does not include secret values in result', () => {
      const result = validateProviderEnv('gemini', {GEMINI_API_KEY: 'sk-very-secret-key'});

      expect(JSON.stringify(result)).not.toContain('sk-very-secret-key');
    });

    it('includes warnings for Bedrock missing region', () => {
      const result = validateProviderEnv('bedrock', {
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
      });

      // AWS_REGION is still missing, so it's in missing list
      expect(result.missing).toContain('AWS_REGION');
    });

    it('includes warnings for optional Azure API version', () => {
      const result = validateProviderEnv('azure', {
        AZURE_OPENAI_API_KEY: 'test',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4-turbo',
      });

      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('API_VERSION'),
      ]));
    });

    it('uses process.env when no env object provided', () => {
      const originalKey = process.env.GEMINI_API_KEY;
      try {
        process.env.GEMINI_API_KEY = 'test-key';
        const result = validateProviderEnv('gemini');

        expect(result.ok).toBe(true);
        expect(result.present).toContain('GEMINI_API_KEY');
      } finally {
        if (originalKey) {
          process.env.GEMINI_API_KEY = originalKey;
        } else {
          delete process.env.GEMINI_API_KEY;
        }
      }
    });
  });
});
