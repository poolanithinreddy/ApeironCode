import type {ApprovalManager} from '../safety/approvals.js';
import {ZodError} from 'zod';
import {AuditLog} from '../safety/auditLog.js';
import type {HookRuntime} from '../hooks/runtime.js';
import type {HookEvent} from '../hooks/types.js';
import {UnifiedToolExecutor} from './executor.js';
import {AppError} from '../utils/errors.js';
import {zodToJsonSchema} from './schema.js';
import type {ProviderToolDefinition} from './schema.js';
import {minifyToolSchemas} from './schemaMinifier.js';
import {buildRunnerTool} from './buildRunner.js';
import {commandOutputTool} from './commandOutput.js';
import {commandStatusTool} from './commandStatus.js';
import {editFileTool} from './editFile.js';
import {fileInfoTool} from './fileInfo.js';
import {gitBranchTool} from './gitBranch.js';
import {gitCommitTool} from './gitCommit.js';
import {gitDiffTool} from './gitDiff.js';
import {gitLogTool} from './gitLog.js';
import {gitPrDescriptionTool} from './gitPrDescription.js';
import {gitStatusTool} from './gitStatus.js';
import {globTool} from './glob.js';
import {grepTool} from './grep.js';
import {killCommandTool} from './killCommand.js';
import {listFilesTool} from './listFiles.js';
import {lintRunnerTool} from './lintRunner.js';
import {packageInfoTool} from './packageInfo.js';
import {patchFileTool} from './patchFile.js';
import {projectTreeTool} from './projectTree.js';
import {readFileTool} from './readFile.js';
import {revertPatchTool} from './revertPatch.js';
import {runCommandTool} from './runCommand.js';
import {testRunnerTool} from './testRunner.js';
import {todoWriteTool} from './todoWrite.js';
import type {ToolDefinition, ToolExecutionContext, ToolResult, ToolSource} from './types.js';
import {webFetchTool} from './web/fetch.js';
import {webResearchTool} from './web/research.js';
import {webSearchTool} from './web/search.js';
import {writeFileTool} from './writeFile.js';
import {createConnectorTools} from '../connectors/tools.js';
import {
  formatToolInputError,
  normalizeToolCall,
  validateToolInput,
} from '../agent/toolExecutionContract.js';

const LSP_INVALIDATING_TOOLS = new Set(['edit_file', 'patch_file', 'write_file', 'revert_patch']);

const maybeInvalidateLspCache = async (
  toolName: string,
  result: ToolResult,
  context: ToolExecutionContext,
): Promise<void> => {
  if (!LSP_INVALIDATING_TOOLS.has(toolName)) {
    return;
  }

  const filePath = typeof result.metadata?.filePath === 'string'
    ? result.metadata.filePath
    : null;
  if (!filePath) {
    return;
  }

  const {LspManager} = await import('../lsp/manager.js');
  const manager = new LspManager(context.config.lsp);
  manager.invalidateFile(filePath);
};

export interface ToolExecutorConfig {
  approvalManager: ApprovalManager;
  globalPermissionRules?: string[];
  projectPermissionRules?: string[];
  sessionPermissionRules?: string[];
  auditLog?: AuditLog;
  sessionId?: string;
  agentSessionId?: string;
  hookRuntime?: HookRuntime;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private executor?: UnifiedToolExecutor;
  private executorConfig?: ToolExecutorConfig;
  private allowedTools?: Set<string>;

  constructor(tools: ToolDefinition[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  add(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  addMultiple(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.add(tool);
    }
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  removeBySource(sources: ToolSource[]): void {
    for (const [name, tool] of this.tools.entries()) {
      if (tool.source && sources.includes(tool.source)) {
        this.tools.delete(name);
      }
    }
  }

  get(name: string): ToolDefinition {
    if (this.allowedTools && !this.allowedTools.has(name)) {
      throw new AppError(`Tool not allowed in current scope: ${name}`, 'TOOL_NOT_ALLOWED');
    }
    const tool = this.tools.get(name);
    if (!tool) {
      throw new AppError(`Unknown tool: ${name}`, 'TOOL_NOT_FOUND');
    }

    return tool;
  }

  configureExecutor(config: ToolExecutorConfig): void {
    this.executorConfig = config;
    this.executor = new UnifiedToolExecutor(this, {
      approvalManager: config.approvalManager,
      globalPermissionRules: config.globalPermissionRules ?? [],
      projectPermissionRules: config.projectPermissionRules,
      sessionPermissionRules: config.sessionPermissionRules,
      auditLog: config.auditLog ?? new AuditLog(),
      sessionId: config.sessionId,
      agentSessionId: config.agentSessionId,
    });
  }

  setAllowedTools(toolNames: string[] | null): void {
    this.allowedTools = toolNames ? new Set(toolNames) : undefined;
  }

  getProviderToolDefinitions(): ProviderToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.inputSchema),
    }));
  }

  getProviderToolDefinitionsFor(
    toolNames: string[],
    options?: {minifyForProvider?: string},
  ): ProviderToolDefinition[] {
    return this.getProviderToolDefinitionsBundleFor(toolNames, options).definitions;
  }

  getProviderToolDefinitionsBundleFor(
    toolNames: string[],
    options?: {minifyForProvider?: string},
  ): {definitions: ProviderToolDefinition[]; tokensSaved: number} {
    const allowed = new Set(toolNames);
    const definitions = Array.from(this.tools.values())
      .filter((tool) => allowed.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: zodToJsonSchema(tool.inputSchema),
      }));
    if (!options?.minifyForProvider) {
      return {definitions, tokensSaved: 0};
    }
    const minified = minifyToolSchemas(definitions, {providerId: options.minifyForProvider});
    return {
      definitions: minified.map((entry) => entry.minified),
      tokensSaved: minified.reduce((sum, entry) => sum + entry.tokensSaved, 0),
    };
  }

  private getLifecycleHookEvents(toolName: string): {after?: HookEvent; before?: HookEvent} {
    if (['edit_file', 'write_file', 'patch_file', 'revert_patch'].includes(toolName)) {
      return {after: 'after_edit', before: 'before_edit'};
    }
    if (toolName === 'git_commit') {
      return {after: 'after_commit', before: 'before_commit'};
    }
    if (['run_command', 'test_runner', 'lint_runner', 'build_runner'].includes(toolName)) {
      return {after: 'after_command', before: 'before_command'};
    }
    return {};
  }

  async invoke(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const tool = this.get(name);
    // Central tool execution contract: normalize input, then validate against
    // the tool's OWN required fields. A failure here is always reported with
    // this tool's name — never another tool's message.
    const {input: normalizedInput} = normalizeToolCall(name, input);
    const schemaRequired = zodToJsonSchema(tool.inputSchema).required ?? [];
    const contractError = validateToolInput(name, normalizedInput, schemaRequired);
    if (contractError) {
      throw new AppError(formatToolInputError(contractError), 'TOOL_INPUT_INVALID');
    }
    let parsedInput: unknown;
    try {
      parsedInput = tool.inputSchema.parse(normalizedInput);
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`);
        throw new AppError(`${name} received invalid input: ${details.join('; ')}`, 'TOOL_INPUT_INVALID');
      }
      throw error;
    }
    const hookPayload = {
      input: parsedInput as Record<string, unknown>,
      sessionId: context.sessionId,
      toolName: name,
    };
    const lifecycleHooks = this.getLifecycleHookEvents(name);
    await this.executorConfig?.hookRuntime?.fire('before_tool', hookPayload);
    if (lifecycleHooks.before) {
      await this.executorConfig?.hookRuntime?.fire(lifecycleHooks.before, hookPayload);
    }

    try {
      // If executor is configured, use it for permission checking and audit logging
      if (this.executor && this.executorConfig) {
        const result = await this.executor.execute(name, parsedInput, context);
        await maybeInvalidateLspCache(name, result, context);
        if (lifecycleHooks.after) {
          await this.executorConfig.hookRuntime?.fire(lifecycleHooks.after, {...hookPayload, result});
        }
        await this.executorConfig.hookRuntime?.fire('after_tool', {...hookPayload, result});
        return result;
      }

      // Otherwise, invoke the tool directly
      const result = await tool.run(parsedInput, context);
      await maybeInvalidateLspCache(name, result, context);
      if (lifecycleHooks.after) {
        await this.executorConfig?.hookRuntime?.fire(lifecycleHooks.after, {...hookPayload, result});
      }
      await this.executorConfig?.hookRuntime?.fire('after_tool', {...hookPayload, result});
      return result;
    } catch (error) {
      await this.executorConfig?.hookRuntime?.fire('tool_error', {
        ...hookPayload,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const createDefaultToolRegistry = (): ToolRegistry => {
  const tools = [
    readFileTool,
    listFilesTool,
    fileInfoTool,
    globTool,
    grepTool,
    editFileTool,
    patchFileTool,
    revertPatchTool,
    writeFileTool,
    runCommandTool,
    commandStatusTool,
    commandOutputTool,
    killCommandTool,
    gitStatusTool,
    gitDiffTool,
    gitBranchTool,
    gitLogTool,
    gitCommitTool,
    gitPrDescriptionTool,
    testRunnerTool,
    lintRunnerTool,
    buildRunnerTool,
    packageInfoTool,
    projectTreeTool,
    todoWriteTool,
    webFetchTool,
    webSearchTool,
    webResearchTool,
    ...createConnectorTools(),
  ];

  // Mark all tools as built-in
  for (const tool of tools) {
    tool.source = 'builtin';
  }

  return new ToolRegistry(tools);
};
