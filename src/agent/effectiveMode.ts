import type {AgentMode} from './types.js';
import {isLikelyTestFixPrompt} from './testFixWorkflow.js';
import {inferAgentMode} from './workflows/index.js';

export type EffectiveModeReason = 'default' | 'explicit' | 'inferred-from-prompt' | 'session-default';

export interface EffectiveModeResolution {
  effectiveMode: AgentMode;
  inferredMode: AgentMode | null;
  reason: EffectiveModeReason;
  requestedMode: AgentMode;
}

interface ResolveEffectiveModeOptions {
  allowPromptInference?: boolean;
  explicitMode?: AgentMode;
  prompt: string;
  sessionMode?: AgentMode;
}

export const resolveEffectiveMode = ({
  allowPromptInference = true,
  explicitMode,
  prompt,
  sessionMode,
}: ResolveEffectiveModeOptions): EffectiveModeResolution => {
  const requestedMode = explicitMode ?? sessionMode ?? 'chat';

  if (allowPromptInference && requestedMode === 'chat') {
    if (isLikelyTestFixPrompt(prompt)) {
      return {
        effectiveMode: 'test-fix',
        inferredMode: 'test-fix',
        reason: 'inferred-from-prompt',
        requestedMode,
      };
    }

    const inferredMode = inferAgentMode('chat', prompt);
    if (inferredMode !== 'chat') {
      return {
        effectiveMode: inferredMode,
        inferredMode,
        reason: 'inferred-from-prompt',
        requestedMode,
      };
    }
  }

  return {
    effectiveMode: requestedMode,
    inferredMode: null,
    reason: explicitMode ? 'explicit' : sessionMode ? 'session-default' : 'default',
    requestedMode,
  };
};

export const formatEffectiveModeLabel = ({
  effectiveMode,
  reason,
}: Pick<EffectiveModeResolution, 'effectiveMode' | 'reason'>): string => {
  if (reason === 'inferred-from-prompt') {
    return `${effectiveMode} (inferred from prompt)`;
  }

  return effectiveMode;
};