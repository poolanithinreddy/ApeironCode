import type {ToolDefinition} from '../tools/types.js';
import type {AgentMode} from './types.js';
import {buildModePrompt} from './modePrompts.js';
import {buildProjectMemorySection, buildGlobalMemorySection} from './memory.js';
import type {ProjectMemory, GlobalMemory} from './memoryManager.js';
import type {AgentWorkflow} from './workflows/types.js';
import {chooseReasoningStyle, formatReasoningInstruction} from './reasoningStyle.js';
import {optimizePromptSegmentsV2, type PromptOptimizationReport, type PromptSegment} from './promptOptimizer.js';
import {getModelTokenBudget} from '../tokens/providerBudgets.js';
import type {SkillDefinition} from '../workflows/types.js';
import {selectRelevantSkills} from '../workflows/skills/selector.js';
import {formatSkillsForPrompt} from '../workflows/skills/formatter.js';

export interface BuildSystemPromptSkillOptions {
  availableSkills?: SkillDefinition[];
  /** Prompt text used for skill relevance selection. Defaults to projectContext. */
  userPrompt?: string;
  maxSkills?: number;
}

interface BuildSystemPromptOptions {
  projectContext: string;
  tools: ToolDefinition[];
  mode?: AgentMode;
  projectMemory?: ProjectMemory | null;
  globalMemory?: GlobalMemory | null;
  relevantMemory?: string | null;
  workflow?: AgentWorkflow | null;
  providerPromptHints?: string;
  providerId?: string;
  modelId?: string;
  skillOptions?: BuildSystemPromptSkillOptions;
  /** Compact Project Brain context injection (≤900 tokens). Injected after memory. */
  brainContext?: string | null;
}

export interface BuiltSystemPrompt {
  prompt: string;
  report: PromptOptimizationReport;
}

export const buildSystemPromptBundle = ({
  projectContext,
  tools,
  mode = 'chat',
  projectMemory,
  globalMemory,
  relevantMemory,
  workflow,
  providerPromptHints,
  providerId = 'unknown',
  modelId = 'unknown',
  skillOptions,
  brainContext,
}: BuildSystemPromptOptions): BuiltSystemPrompt => {
  const toolList = tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  const projectMemorySection = buildProjectMemorySection(projectMemory ?? null);
  const globalMemorySection = buildGlobalMemorySection(globalMemory ?? null);
  const memoryContext = relevantMemory?.trim()
    ? `Relevant Memory (local/offline; may be stale, verify against current files before relying on it):\n${relevantMemory.trim()}`
    : `\nProject Memory:\n${projectMemorySection}${globalMemorySection}`;

  const modePrompt = buildModePrompt(mode, {
    projectContext,
    toolList,
    userMemory: relevantMemory?.trim() ? '' : globalMemorySection,
  });
  const workflowSection = workflow
    ? `Workflow:\n${workflow.promptAddendum}`
    : '';
  const reasoningInstruction = formatReasoningInstruction(chooseReasoningStyle('', mode, {
    largeContext: projectContext.length > 12_000,
  }));

  // Skill selection: pick relevant skills based on user prompt, include compact instructions
  let skillsSection = '';
  if (skillOptions?.availableSkills && skillOptions.availableSkills.length > 0) {
    const selectionPrompt = skillOptions.userPrompt ?? projectContext;
    const selected = selectRelevantSkills(
      selectionPrompt,
      skillOptions.availableSkills,
      {maxSkills: skillOptions.maxSkills ?? 3},
    );
    if (selected.length > 0) {
      skillsSection = formatSkillsForPrompt(selected, 'full');
    }
  }

  const segments = [
    {content: modePrompt, id: 'mode', priority: 100, required: true, type: 'system' as const},
    {content: reasoningInstruction, id: 'reasoning-style', priority: 90, required: true, type: 'system' as const},
    {content: workflowSection, id: 'workflow', priority: 80, type: 'task' as const},
    {content: skillsSection, id: 'skills', priority: 75, type: 'task' as const},
    {content: providerPromptHints ? `Model guidance:\n${providerPromptHints}` : '', id: 'provider-hints', priority: 70, type: 'system' as const},
    {content: memoryContext, id: 'memory', priority: 60, type: 'memory' as const},
    {content: brainContext?.trim() ?? '', id: 'brain-context', priority: 55, type: 'task' as const},
    {
      content: [
        'Tool use:',
        'Use normal Markdown when no tool is needed.',
        'When tools are needed, use the provider-native tool calling interface with valid JSON input.',
        'Multiple tool calls are allowed when they are independent and safe to run sequentially.',
      ].join('\n'),
      id: 'tool-format',
      priority: 100,
      required: true,
      type: 'tools' as const,
    },
  ].filter((segment) => segment.content.trim().length > 0) satisfies PromptSegment[];
  const budget = getModelTokenBudget(providerId, modelId, mode);
  const optimized = optimizePromptSegmentsV2(segments, {maxTokens: Math.min(16_000, budget.safeInputTokens)});
  return {
    prompt: optimized.segments.map((segment) => segment.content).join('\n\n'),
    report: optimized.report,
  };
};

export const buildSystemPrompt = (options: BuildSystemPromptOptions): string =>
  buildSystemPromptBundle(options).prompt;
