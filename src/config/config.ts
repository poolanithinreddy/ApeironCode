import {z} from 'zod';

import {readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getGlobalConfigPath} from '../utils/paths.js';
import {DEFAULT_CONFIG} from './defaults.js';
import {loadIgnorePatterns, loadProjectConfig, loadProjectMemory} from './projectConfig.js';

export const ApprovalModeSchema = z.enum(['ask', 'auto-read', 'trusted', 'trusted-workspace', 'bypass']);
export const ThemeSchema = z.enum(['auto', 'light', 'dark', 'no-color']);
export const UiSettingsSchema = z.object({
  compact: z.boolean().default(false),
  showTips: z.boolean().default(true),
  showWhatsNew: z.boolean().default(true),
  theme: ThemeSchema.default('auto'),
  welcome: z.boolean().default(true),
});
export const PluginSettingsSchema = z.object({
  directories: z.array(z.string()).default([]),
  disabled: z.array(z.string()).default([]),
});
export const MemorySettingsSchema = z.object({
  autoSave: z.boolean().default(false),
  autoSuggest: z.boolean().default(true),
});
export const PlanningSettingsSchema = z.object({
  requireBeforeEdit: z.boolean().default(false),
  requireApproval: z.boolean().default(true),
  autoPlanForLargeTasks: z.boolean().default(true),
  largeTaskThreshold: z.number().int().min(1).default(3),
});
const StdioMcpServerSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  args: z.array(z.string()).default([]),
  command: z.string().min(1),
  deniedTools: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  env: z.record(z.string()).default({}),
  outputTokenLimit: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  trustLevel: z.enum(['low', 'medium', 'high']).default('low'),
  type: z.literal('stdio').default('stdio'),
});
const HttpMcpServerSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  headers: z.record(z.string()).default({}),
  outputTokenLimit: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  trustLevel: z.enum(['low', 'medium', 'high']).default('low'),
  type: z.literal('http').default('http'),
  url: z.string().url(),
});
const SseMcpServerSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  headers: z.record(z.string()).default({}),
  outputTokenLimit: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  trustLevel: z.enum(['low', 'medium', 'high']).default('low'),
  type: z.literal('sse').default('sse'),
  url: z.string().url(),
});
export const McpServerSchema = z.union([StdioMcpServerSchema, HttpMcpServerSchema, SseMcpServerSchema]);
export const McpSettingsSchema = z.object({
  servers: z.record(McpServerSchema).default({}),
});
export const WebSettingsSchema = z.object({
  allowPrivateHosts: z.boolean().default(false),
  enabled: z.boolean().default(true),
  maxFetchChars: z.number().int().min(500).max(20_000).default(6_000),
  maxSearchResults: z.number().int().min(1).max(10).default(5),
  searchProvider: z.string().trim().default('duckduckgo'),
  userAgent: z.string().min(1).default('ApeironCode-Agent/0.1'),
});
export const LspSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  longLivedSessions: z.boolean().default(true),
  idleTimeoutMs: z.number().int().min(1_000).max(3_600_000).default(300_000),
  maxSessions: z.number().int().min(1).max(32).default(5),
  requestTimeoutMs: z.number().int().min(250).max(60_000).default(3_000),
  fallbackOnFailure: z.boolean().default(true),
});
export const SandboxSettingsSchema = z.object({
  fallbackPolicy: z.enum(['never', 'safe-readonly', 'always']).default('safe-readonly'),
});

export const TokenEfficiencySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  context: z.object({
    maxFullFiles: z.number().int().min(1).max(50).default(4),
    maxSummaryFiles: z.number().int().min(0).max(100).default(8),
  }).default({maxFullFiles: 4, maxSummaryFiles: 8}),
  memory: z.object({
    maxMemoryTokens: z.number().int().min(100).max(10_000).default(800),
  }).default({maxMemoryTokens: 800}),
  tools: z.object({
    dynamicExposureEnabled: z.boolean().default(true),
    maxToolOutputTokens: z.number().int().min(100).max(20_000).default(1_200),
  }).default({dynamicExposureEnabled: true, maxToolOutputTokens: 1_200}),
  reasoningStyle: z.object({
    default: z.enum(['fast', 'balanced', 'deep']).default('balanced'),
  }).default({default: 'balanced'}),
});

export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;
export type ThemeMode = z.infer<typeof ThemeSchema>;

export const ApeironCodeConfigSchema = z.object({
  defaultProvider: z.string().min(1),
  defaultModel: z.string().min(1),
  fallbackModel: z.string().optional(),
  models: z.record(z.string()).default({}),
  baseUrls: z.record(z.string()).default({}),
  apiKeyEnvNames: z.record(z.string()).default({}),
  approvalMode: ApprovalModeSchema.default('ask'),
  theme: ThemeSchema.default('auto'),
  localOnly: z.boolean().default(false),
  telemetry: z.boolean().default(false),
  ui: UiSettingsSchema.default({
    compact: false,
    showTips: true,
    showWhatsNew: true,
    theme: 'auto',
    welcome: true,
  }).optional(),
  tokenEfficiency: TokenEfficiencySettingsSchema.default({
    context: {maxFullFiles: 4, maxSummaryFiles: 8},
    enabled: true,
    memory: {maxMemoryTokens: 800},
    reasoningStyle: {default: 'balanced'},
    tools: {dynamicExposureEnabled: true, maxToolOutputTokens: 1_200},
  }),
  maxContextFiles: z.number().int().min(1).max(200).default(20),
  maxFileSize: z.number().int().min(1_024).default(200_000),
  maxFixAttempts: z.number().int().min(1).max(10).default(3),
  maxIterations: z.number().int().min(5).max(200).default(40),
  lsp: LspSettingsSchema.default({
    enabled: true,
    fallbackOnFailure: true,
    idleTimeoutMs: 300_000,
    longLivedSessions: true,
    maxSessions: 5,
    requestTimeoutMs: 3_000,
  }),
  memory: MemorySettingsSchema.default({autoSave: false, autoSuggest: true}),
  mcp: McpSettingsSchema.default({servers: {}}),
  permissions: z.array(z.string()).default([]),
  sandbox: SandboxSettingsSchema.default({fallbackPolicy: 'safe-readonly'}),
  planning: PlanningSettingsSchema.default({requireBeforeEdit: false, requireApproval: true, autoPlanForLargeTasks: true, largeTaskThreshold: 3}),
  plugins: PluginSettingsSchema.default({directories: [], disabled: []}),
  web: WebSettingsSchema.default({
    allowPrivateHosts: false,
    enabled: true,
    maxFetchChars: 6_000,
    maxSearchResults: 5,
    searchProvider: 'duckduckgo',
    userAgent: 'ApeironCode-Agent/0.1',
  }),
  ignoredPaths: z.array(z.string()).default([]),
});

export type ApeironCodeConfig = z.infer<typeof ApeironCodeConfigSchema>;
export type ApeironCodeConfigInput = Partial<ApeironCodeConfig>;

/** @deprecated Use ApeironCodeConfigSchema. Compatibility alias for legacy OpenCode brand. */
export const OpenCodeConfigSchema = ApeironCodeConfigSchema;
/** @deprecated Use ApeironCodeConfig. Compatibility alias for legacy OpenCode brand. */
export type OpenCodeConfig = ApeironCodeConfig;
/** @deprecated Use ApeironCodeConfigInput. Compatibility alias for legacy OpenCode brand. */
export type OpenCodeConfigInput = ApeironCodeConfigInput;

export type ConfigKey =
  | 'provider'
  | 'model'
  | 'fallbackModel'
  | 'baseUrl'
  | 'approvalMode'
  | 'theme'
  | 'localOnly'
  | 'telemetry'
  | 'maxContextFiles'
  | 'maxFileSize'
  | 'maxIterations';

export interface ResolvedConfig {
  user: ApeironCodeConfig;
  project: Partial<ApeironCodeConfig>;
  effective: ApeironCodeConfig;
  projectMemory: string | null;
  ignorePatterns: string[];
}

const normalizeConfig = (input: ApeironCodeConfigInput): ApeironCodeConfig => {
  return ApeironCodeConfigSchema.parse({
    ...DEFAULT_CONFIG,
    ...input,
    apiKeyEnvNames: {
      ...DEFAULT_CONFIG.apiKeyEnvNames,
      ...(input.apiKeyEnvNames ?? {}),
    },
    baseUrls: {
      ...DEFAULT_CONFIG.baseUrls,
      ...(input.baseUrls ?? {}),
    },
    models: {
      ...DEFAULT_CONFIG.models,
      ...(input.models ?? {}),
    },
    memory: {
      ...DEFAULT_CONFIG.memory,
      ...(input.memory ?? {}),
    },
    mcp: {
      servers: {
        ...DEFAULT_CONFIG.mcp.servers,
        ...(input.mcp?.servers ?? {}),
      },
    },
    lsp: {
      ...DEFAULT_CONFIG.lsp,
      ...(input.lsp ?? {}),
    },
    web: {
      ...DEFAULT_CONFIG.web,
      ...(input.web ?? {}),
    },
    ui: {
      ...DEFAULT_CONFIG.ui,
      ...(input.ui ?? {}),
    },
    sandbox: {
      ...DEFAULT_CONFIG.sandbox,
      ...(input.sandbox ?? {}),
    },
    tokenEfficiency: {
      ...DEFAULT_CONFIG.tokenEfficiency,
      ...(input.tokenEfficiency ?? {}),
      context: {
        ...DEFAULT_CONFIG.tokenEfficiency.context,
        ...(input.tokenEfficiency?.context ?? {}),
      },
      memory: {
        ...DEFAULT_CONFIG.tokenEfficiency.memory,
        ...(input.tokenEfficiency?.memory ?? {}),
      },
      tools: {
        ...DEFAULT_CONFIG.tokenEfficiency.tools,
        ...(input.tokenEfficiency?.tools ?? {}),
      },
      reasoningStyle: {
        ...DEFAULT_CONFIG.tokenEfficiency.reasoningStyle,
        ...(input.tokenEfficiency?.reasoningStyle ?? {}),
      },
    },
    plugins: {
      directories: Array.from(
        new Set([...DEFAULT_CONFIG.plugins.directories, ...(input.plugins?.directories ?? [])]),
      ),
      disabled: Array.from(
        new Set([...DEFAULT_CONFIG.plugins.disabled, ...(input.plugins?.disabled ?? [])]),
      ),
    },
    ignoredPaths: Array.from(
      new Set([...DEFAULT_CONFIG.ignoredPaths, ...(input.ignoredPaths ?? [])]),
    ),
  });
};

export class ConfigStore {
  constructor(private readonly cwd = process.cwd()) {}

  async readUserConfig(): Promise<ApeironCodeConfig> {
    const filePath = getGlobalConfigPath();
    const raw = await readJsonFile<ApeironCodeConfigInput>(filePath, {});
    return normalizeConfig(raw);
  }

  async load(): Promise<ResolvedConfig> {
    const user = await this.readUserConfig();
    const project = await loadProjectConfig(this.cwd);
    const projectMemory = await loadProjectMemory(this.cwd);
    const ignorePatterns = await loadIgnorePatterns(this.cwd);
    const effective = normalizeConfig({
      ...user,
      ...project,
      ignoredPaths: Array.from(
        new Set([...user.ignoredPaths, ...(project.ignoredPaths ?? []), ...ignorePatterns]),
      ),
      apiKeyEnvNames: {
        ...user.apiKeyEnvNames,
        ...(project.apiKeyEnvNames ?? {}),
      },
      baseUrls: {
        ...user.baseUrls,
        ...(project.baseUrls ?? {}),
      },
      mcp: {
        servers: {
          ...user.mcp.servers,
          ...(project.mcp?.servers ?? {}),
        },
      },
      lsp: {
        ...user.lsp,
        ...(project.lsp ?? {}),
      },
      web: {
        ...user.web,
        ...(project.web ?? {}),
      },
    });

    return {
      user,
      project,
      effective,
      ignorePatterns: effective.ignoredPaths,
      projectMemory,
    };
  }

  async writeUserConfig(input: ApeironCodeConfigInput): Promise<ApeironCodeConfig> {
    const next = normalizeConfig(input);
    await writeJsonFile(getGlobalConfigPath(), next);
    return next;
  }

  async patchUserConfig(input: ApeironCodeConfigInput): Promise<ApeironCodeConfig> {
    const current = await this.readUserConfig();
    return this.writeUserConfig({
      ...current,
      ...input,
      apiKeyEnvNames: {
        ...current.apiKeyEnvNames,
        ...(input.apiKeyEnvNames ?? {}),
      },
      baseUrls: {
        ...current.baseUrls,
        ...(input.baseUrls ?? {}),
      },
      models: {
        ...current.models,
        ...(input.models ?? {}),
      },
      memory: input.memory
        ? {
            ...current.memory,
            ...input.memory,
          }
        : current.memory,
      mcp: input.mcp
        ? {
            servers: {
              ...current.mcp.servers,
              ...(input.mcp.servers ?? {}),
            },
          }
        : current.mcp,
      lsp: input.lsp
        ? {
            ...current.lsp,
            ...input.lsp,
          }
        : current.lsp,
      web: input.web
        ? {
            ...current.web,
            ...input.web,
          }
        : current.web,
      plugins: input.plugins
        ? {
            directories: Array.from(
              new Set([...current.plugins.directories, ...(input.plugins.directories ?? [])]),
            ),
            disabled: input.plugins.disabled ?? current.plugins.disabled,
          }
        : current.plugins,
      ignoredPaths: input.ignoredPaths ?? current.ignoredPaths,
    });
  }

  async setUserValue(
    key: ConfigKey,
    value: string,
    providerName?: string,
  ): Promise<ApeironCodeConfig> {
    switch (key) {
      case 'provider':
        return this.patchUserConfig({defaultProvider: value});
      case 'model':
        return this.patchUserConfig({defaultModel: value});
      case 'fallbackModel':
        return this.patchUserConfig({fallbackModel: value});
      case 'baseUrl': {
        const activeProvider = providerName ?? (await this.readUserConfig()).defaultProvider;
        return this.patchUserConfig({
          baseUrls: {
            [activeProvider]: value,
          },
        });
      }
      case 'approvalMode':
        return this.patchUserConfig({approvalMode: ApprovalModeSchema.parse(value)});
      case 'theme':
        return this.patchUserConfig({theme: ThemeSchema.parse(value)});
      case 'localOnly':
        return this.patchUserConfig({localOnly: value === 'true'});
      case 'telemetry':
        return this.patchUserConfig({telemetry: value === 'true'});
      case 'maxContextFiles':
        return this.patchUserConfig({maxContextFiles: Number.parseInt(value, 10)});
      case 'maxFileSize':
        return this.patchUserConfig({maxFileSize: Number.parseInt(value, 10)});
      default:
        return this.readUserConfig();
    }
  }

  async getValue(key: ConfigKey, providerName?: string): Promise<unknown> {
    const config = await this.readUserConfig();

    switch (key) {
      case 'provider':
        return config.defaultProvider;
      case 'model':
        return config.defaultModel;
      case 'fallbackModel':
        return config.fallbackModel ?? null;
      case 'baseUrl':
        return config.baseUrls[providerName ?? config.defaultProvider] ?? null;
      case 'approvalMode':
        return config.approvalMode;
      case 'theme':
        return config.theme;
      case 'localOnly':
        return config.localOnly;
      case 'telemetry':
        return config.telemetry;
      case 'maxContextFiles':
        return config.maxContextFiles;
      case 'maxFileSize':
        return config.maxFileSize;
      default:
        return null;
    }
  }
}
