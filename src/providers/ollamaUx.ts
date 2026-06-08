import type {ApeironCodeConfig} from '../config/config.js';

export interface OllamaStatus {
  baseUrl: string;
  models: string[];
  reachable: boolean;
  statusCode?: number;
}

export const OLLAMA_RECOMMENDED_MODELS = [
  'qwen2.5-coder:7b',
  'qwen2.5-coder:14b',
  'deepseek-coder',
  'codellama',
];

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const getOllamaBaseUrl = (config: ApeironCodeConfig): string => {
  return config.baseUrls.ollama ?? 'http://localhost:11434';
};

export const checkOllamaStatus = async (
  config: ApeironCodeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaStatus> => {
  const baseUrl = getOllamaBaseUrl(config);
  try {
    const response = await withTimeout(fetchImpl(`${baseUrl}/api/tags`), 1_500);
    if (!response.ok) {
      return {baseUrl, models: [], reachable: false, statusCode: response.status};
    }

    const payload = (await response.json()) as {models?: Array<{name?: string}>};
    const models = payload.models
      ?.map((model) => model.name)
      .filter((model): model is string => Boolean(model)) ?? [];
    return {baseUrl, models, reachable: true, statusCode: response.status};
  } catch {
    return {baseUrl, models: [], reachable: false};
  }
};

export const formatOllamaStatus = (status: OllamaStatus): string => {
  if (!status.reachable) {
    return [
      `Ollama: unreachable at ${status.baseUrl}`,
      status.statusCode ? `HTTP status: ${status.statusCode}` : null,
      'Setup: run `ollama serve`',
    ].filter(Boolean).join('\n');
  }

  return [
    `Ollama: reachable at ${status.baseUrl}`,
    `Installed models: ${status.models.length > 0 ? status.models.join(', ') : 'none'}`,
  ].join('\n');
};

export const formatOllamaModels = (status: OllamaStatus): string => {
  if (!status.reachable) {
    return `${formatOllamaStatus(status)}\nModels unavailable until the server is running.`;
  }

  return status.models.length > 0
    ? status.models.map((model) => `- ${model}`).join('\n')
    : 'No Ollama models installed.';
};

export const formatOllamaPullHint = (model: string): string => {
  return `Run: ollama pull ${model}`;
};

export const formatOllamaRecommendations = (status?: OllamaStatus): string => {
  const installed = new Set(status?.models ?? []);
  const lines = ['Recommended Ollama models:'];
  for (const model of OLLAMA_RECOMMENDED_MODELS) {
    lines.push(`- ${model}${installed.has(model) ? ' | installed' : ` | missing | ${formatOllamaPullHint(model)}`}`);
  }
  if (status && !status.reachable) {
    lines.push('', 'Ollama is not reachable. Run `ollama serve` before using local models.');
  }
  return lines.join('\n');
};
