import type {EvalSuite} from '../types.js';

import {codingSuite} from './coding.js';
import {safetySuite} from './safety.js';
import {smokeSuite} from './smoke.js';
import {toolsSuite} from './tools.js';
import {tokenEfficiencySuite} from './tokenEfficiency.js';
import {githubAutomationSuite} from './githubAutomation.js';
import {mcpSuite} from './mcp.js';
import {contextIntelligenceSuite} from './contextIntelligence.js';
import {memoryIntelligenceSuite} from './memoryIntelligence.js';
import {runtimeReliabilitySuite} from './runtimeReliability.js';
import {nativeToolCallingSuite} from './nativeToolCalling.js';
import {tokenEfficiencyV2Suite} from './tokenEfficiencyV2.js';

export const suites: EvalSuite[] = [
  smokeSuite,
  codingSuite,
  safetySuite,
  toolsSuite,
  tokenEfficiencySuite,
  githubAutomationSuite,
  mcpSuite,
  contextIntelligenceSuite,
  memoryIntelligenceSuite,
  runtimeReliabilitySuite,
  nativeToolCallingSuite,
  tokenEfficiencyV2Suite,
];

export const getEvalSuite = (id: string): EvalSuite | undefined =>
  suites.find((suite) => suite.id === id);

export const getEvalSuiteIds = (): string[] => suites.map((suite) => suite.id);
