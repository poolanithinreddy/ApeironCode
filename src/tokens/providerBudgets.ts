import {findCatalogEntry, getProviderCapabilities} from '../providers/modelCatalog.js';

export interface TokenBudgetProfile {
  contextBudget: number;
  contextWindow: number;
  historyBudget: number;
  memoryBudget: number;
  modelId: string;
  providerId: string;
  reservedOutputTokens: number;
  safeInputTokens: number;
  toolSchemaBudget: number;
  warnings: string[];
}

const DEFAULT_CONTEXT_WINDOW = 32_000;
const DEFAULT_OUTPUT_RESERVE = 2_000;

const resolveContextWindow = (providerId: string, modelId: string): {contextWindow: number; known: boolean} => {
  const entry = findCatalogEntry(providerId, modelId);
  const contextWindow = entry?.contextWindow
    ?? getProviderCapabilities(providerId, modelId).contextWindow
    ?? DEFAULT_CONTEXT_WINDOW;
  return {contextWindow, known: Boolean(entry)};
};

const detectModeReserve = (mode?: string): number => {
  switch (mode) {
    case 'debug':
    case 'review':
    case 'test-fix':
      return 3_500;
    case 'feature':
    case 'edit':
    case 'fix':
    case 'refactor':
      return 3_000;
    case 'explain':
      return 1_500;
    default:
      return DEFAULT_OUTPUT_RESERVE;
  }
};

export const getReservedOutputBudget = (
  providerId: string,
  modelId: string,
  mode?: string,
): number => {
  const window = resolveContextWindow(providerId, modelId).contextWindow;
  return Math.min(Math.max(1_000, detectModeReserve(mode)), Math.floor(window * 0.2));
};

export const getSafeInputBudget = (providerId: string, modelId: string): number => {
  const profile = getModelTokenBudget(providerId, modelId);
  return profile.safeInputTokens;
};

export const getModelTokenBudget = (
  providerId: string,
  modelId: string,
  mode?: string,
): TokenBudgetProfile => {
  const resolved = resolveContextWindow(providerId, modelId);
  const warnings: string[] = [];

  if (!resolved.known) {
    warnings.push(`Unknown model profile for ${providerId}/${modelId}; using conservative fallback budget.`);
  }
  const contextWindow = resolved.contextWindow;

  const reservedOutputTokens = getReservedOutputBudget(providerId, modelId, mode);
  const safeInputTokens = Math.max(2_000, Math.floor(contextWindow * 0.78) - reservedOutputTokens);
  const toolSchemaBudget = Math.min(12_000, Math.max(800, Math.floor(safeInputTokens * 0.12)));
  const memoryBudget = Math.min(4_000, Math.max(300, Math.floor(safeInputTokens * 0.12)));
  const historyBudget = Math.min(10_000, Math.max(600, Math.floor(safeInputTokens * 0.18)));
  const contextBudget = Math.max(1_500, safeInputTokens - toolSchemaBudget - memoryBudget - historyBudget);

  return {
    contextBudget,
    contextWindow,
    historyBudget,
    memoryBudget,
    modelId,
    providerId,
    reservedOutputTokens,
    safeInputTokens,
    toolSchemaBudget,
    warnings,
  };
};

export const formatTokenBudgetProfile = (profile: TokenBudgetProfile): string => [
  `${profile.providerId}/${profile.modelId}`,
  `window=${profile.contextWindow}`,
  `safeInput=${profile.safeInputTokens}`,
  `reservedOutput=${profile.reservedOutputTokens}`,
  `context=${profile.contextBudget}`,
  `history=${profile.historyBudget}`,
  `memory=${profile.memoryBudget}`,
  `toolSchemas=${profile.toolSchemaBudget}`,
  profile.warnings.length > 0 ? `warnings=${profile.warnings.join('; ')}` : '',
].filter(Boolean).join(', ');
