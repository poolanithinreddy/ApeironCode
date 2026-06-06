export interface ProviderEnvRequirement {
  name: string;
  required: boolean;
  description?: string;
}

export interface ProviderEnvValidationResult {
  providerId: string;
  ok: boolean;
  missing: string[];
  present: string[];
  warnings: string[];
}

const PROVIDER_ENV_REQUIREMENTS: Record<string, ProviderEnvRequirement[]> = {
  anthropic: [
    {name: 'ANTHROPIC_API_KEY', required: true, description: 'API key for Anthropic Claude models'},
  ],
  bedrock: [
    {name: 'AWS_ACCESS_KEY_ID', required: true, description: 'AWS access key for Bedrock'},
    {name: 'AWS_SECRET_ACCESS_KEY', required: true, description: 'AWS secret key for Bedrock'},
    {name: 'AWS_REGION', required: true, description: 'AWS region (e.g., us-east-1)'},
    {name: 'AWS_SESSION_TOKEN', required: false, description: 'Optional AWS session token'},
  ],
  azure: [
    {name: 'AZURE_OPENAI_API_KEY', required: true, description: 'Azure OpenAI API key'},
    {name: 'AZURE_OPENAI_ENDPOINT', required: true, description: 'Azure OpenAI endpoint URL'},
    {name: 'AZURE_OPENAI_DEPLOYMENT', required: true, description: 'Azure deployment name'},
    {name: 'AZURE_OPENAI_API_VERSION', required: false, description: 'Optional API version'},
  ],
  deepseek: [
    {name: 'DEEPSEEK_API_KEY', required: true, description: 'API key for DeepSeek'},
  ],
  gemini: [
    {name: 'GEMINI_API_KEY', required: true, description: 'API key for Google Gemini'},
  ],
  groq: [
    {name: 'GROQ_API_KEY', required: true, description: 'API key for Groq'},
  ],
  mock: [],
  ollama: [
    {name: 'OLLAMA_BASE_URL', required: false, description: 'Base URL for local Ollama server'},
  ],
  openai: [
    {name: 'OPENAI_API_KEY', required: true, description: 'API key for OpenAI'},
  ],
  openaiCompatible: [
    {name: 'OPENAI_API_KEY', required: false, description: 'API key (depends on provider)'},
  ],
  openrouter: [
    {name: 'OPENROUTER_API_KEY', required: true, description: 'API key for OpenRouter'},
  ],
};

export function getProviderEnvRequirements(providerId: string): ProviderEnvRequirement[] {
  return PROVIDER_ENV_REQUIREMENTS[providerId] ?? [];
}

export function validateProviderEnv(
  providerId: string,
  env?: Record<string, string | undefined>,
): ProviderEnvValidationResult {
  const processEnv = env ?? process.env;
  const requirements = getProviderEnvRequirements(providerId);

  const missing: string[] = [];
  const present: string[] = [];
  const warnings: string[] = [];

  for (const req of requirements) {
    const value = processEnv[req.name];
    if (value) {
      present.push(req.name);
    } else if (req.required) {
      missing.push(req.name);
    } else if (req.name === 'AZURE_OPENAI_API_VERSION' || req.name === 'OLLAMA_BASE_URL') {
      // These are optional and have sensible defaults
    } else if (req.name === 'AWS_SESSION_TOKEN') {
      // Session token is optional
    }
  }

  // Special checks for new providers
  if (providerId === 'bedrock' && !processEnv.AWS_REGION) {
    if (!missing.includes('AWS_REGION')) {
      warnings.push('AWS_REGION not set; will default to us-east-1');
    }
  }

  if (providerId === 'azure' && !processEnv.AZURE_OPENAI_API_VERSION) {
    warnings.push('AZURE_OPENAI_API_VERSION not set; will default to 2024-10-21');
  }

  return {
    providerId,
    ok: missing.length === 0,
    missing,
    present,
    warnings,
  };
}
