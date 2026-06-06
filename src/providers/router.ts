import type {AgentMode} from '../agent/types.js';
import type {ApeironCodeConfig} from '../config/config.js';
import {CostTracker} from './costTracker.js';
import {classifyProviderError} from './errorClassification.js';
import {getProviderCapabilities, type ModelRole} from './modelCatalog.js';
import {estimateUsageCost} from './pricing.js';
import type {ProviderRegistry} from './registry.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk, ProviderUsage} from './types.js';

export interface ProviderRoute {
  capabilities: ReturnType<typeof getProviderCapabilities>;
  model: string;
  modelRef: string;
  providerName: string;
  role: ModelRole;
  source: 'default' | 'explicit' | 'fallback' | 'role';
}

export interface ProviderRoutingResult {
  fallback: ProviderRoute | null;
  primary: ProviderRoute;
}

const MODE_TO_ROLE: Record<AgentMode, ModelRole> = {
  'autonomous-with-approval': 'coding',
  chat: 'fast',
  commit: 'cheap',
  debug: 'reasoning',
  edit: 'coding',
  explain: 'reasoning',
  feature: 'coding',
  fix: 'coding',
  plan: 'reasoning',
  refactor: 'coding',
  review: 'reasoning',
  'test-fix': 'coding',
};

const parseModelReference = (
  modelReference: string,
  defaultProvider: string,
): {model: string; providerName: string} => {
  const separatorIndex = modelReference.indexOf(':');
  if (separatorIndex <= 0) {
    return {
      model: modelReference,
      providerName: defaultProvider,
    };
  }

  return {
    model: modelReference.slice(separatorIndex + 1),
    providerName: modelReference.slice(0, separatorIndex),
  };
};

const createRoute = (
  config: ApeironCodeConfig,
  modelReference: string,
  role: ModelRole,
  source: ProviderRoute['source'],
  providerOverride?: string,
): ProviderRoute => {
  const parsed = parseModelReference(modelReference, providerOverride ?? config.defaultProvider);
  const providerName = providerOverride ?? parsed.providerName;
  return {
    capabilities: getProviderCapabilities(providerName, parsed.model),
    model: parsed.model,
    modelRef: `${providerName}:${parsed.model}`,
    providerName,
    role,
    source,
  };
};

export const resolveProviderRouting = ({
  config,
  mode = 'chat',
  requestedModel,
  requestedProvider,
}: {
  config: ApeironCodeConfig;
  mode?: AgentMode;
  requestedModel?: string;
  requestedProvider?: string;
}): ProviderRoutingResult => {
  const role = MODE_TO_ROLE[mode];
  const explicitReference = requestedModel
    ? requestedProvider
      ? `${requestedProvider}:${requestedModel}`
      : requestedModel
    : null;
  const roleReference = config.models?.[role] ?? null;
  const primaryReference = explicitReference
    ?? roleReference
    ?? `${requestedProvider ?? config.defaultProvider}:${config.defaultModel}`;
  const primary = createRoute(
    config,
    primaryReference,
    role,
    explicitReference ? 'explicit' : roleReference ? 'role' : 'default',
    explicitReference && requestedProvider ? requestedProvider : undefined,
  );
  const fallback = config.fallbackModel
    ? createRoute(config, config.fallbackModel, role, 'fallback')
    : null;

  return {
    fallback:
      fallback && fallback.modelRef !== primary.modelRef
        ? fallback
        : null,
    primary,
  };
};

export class RoutedProvider implements ModelProvider {
  private activeProvider: ModelProvider;
  private activeRoute: ProviderRoute;
  private readonly costTracker = new CostTracker();
  private fallbackUsed = false;
  private fallbackEvents: Array<{from: ProviderRoute; reason: string; to: ProviderRoute}> = [];

  constructor(
    private readonly config: ApeironCodeConfig,
    private readonly providerRegistry: ProviderRegistry,
    private readonly routing: ProviderRoutingResult,
    private readonly onFallback?: (from: ProviderRoute, to: ProviderRoute, error: unknown) => void,
  ) {
    this.activeRoute = routing.primary;
    this.activeProvider = providerRegistry.create(routing.primary.providerName, config);
  }

  get currentRoute(): ProviderRoute {
    return this.activeRoute;
  }

  get displayName(): string {
    return this.activeProvider.displayName;
  }

  get name(): string {
    return this.activeProvider.name;
  }

  get supportsStreaming(): boolean {
    return this.activeProvider.supportsStreaming;
  }

  get supportsToolCalling(): boolean {
    return this.activeProvider.supportsToolCalling;
  }

  get nativeToolFormat(): 'anthropic' | 'openai' | 'ollama' {
    return this.activeProvider.nativeToolFormat;
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    return this.activeProvider.listModels(signal);
  }

  private failover(error: unknown): void {
    const classification = classifyProviderError(error);
    if (!this.routing.fallback || this.fallbackUsed || !classification.retryable) {
      throw error;
    }

    this.fallbackUsed = true;
    const previousRoute = this.activeRoute;
    this.activeRoute = this.routing.fallback;
    this.activeProvider = this.providerRegistry.create(this.routing.fallback.providerName, this.config);
    this.fallbackEvents.push({
      from: previousRoute,
      reason: classification.summary,
      to: this.activeRoute,
    });
    this.onFallback?.(previousRoute, this.activeRoute, error);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    try {
      for await (const chunk of this.activeProvider.stream({...options, model: this.activeRoute.model})) {
        if (chunk.type === 'done' && chunk.usage) {
          const usage = estimateUsageCost(this.activeRoute.providerName, this.activeRoute.model, chunk.usage);
          this.costTracker.addCall(this.activeRoute.providerName, this.activeRoute.model, usage);
          yield {
            ...chunk,
            usage,
          };
        } else {
          yield chunk;
        }
      }
    } catch (error) {
      this.failover(error);
      for await (const chunk of this.activeProvider.stream({...options, model: this.activeRoute.model})) {
        if (chunk.type === 'done' && chunk.usage) {
          const usage = estimateUsageCost(this.activeRoute.providerName, this.activeRoute.model, chunk.usage);
          this.costTracker.addCall(this.activeRoute.providerName, this.activeRoute.model, usage);
          yield {
            ...chunk,
            usage,
          };
        } else {
          yield chunk;
        }
      }
    }
  }

  getUsageSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEstimatedCostUsd: number;
    breakdown: Array<{
      provider: string;
      model: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    }>;
  } {
    return this.costTracker.getSummary();
  }

  getUsageTotals(): ProviderUsage | undefined {
    const summary = this.costTracker.getSummary();
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    if (totalTokens === 0 && summary.totalEstimatedCostUsd === 0) {
      return undefined;
    }

    return {
      breakdown: summary.breakdown,
      estimatedCostUsd: summary.totalEstimatedCostUsd,
      inputTokens: summary.totalInputTokens,
      outputTokens: summary.totalOutputTokens,
      totalTokens,
    };
  }

  getFallbackEvents(): Array<{from: ProviderRoute; reason: string; to: ProviderRoute}> {
    return [...this.fallbackEvents];
  }
}
