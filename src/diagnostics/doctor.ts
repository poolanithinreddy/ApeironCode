import fs from 'node:fs/promises';
import {execa} from 'execa';
import type {ResolvedConfig} from '../config/config.js';
import {resolveProviderApiKey} from '../config/secrets.js';
import {RepoMapManager} from '../context/repoMap.js';
import {loadPluginCatalog} from '../plugins/loader.js';
import {listPluginMcpEndpoints} from '../plugins/mcp.js';
import {formatProviderCapabilities, getProviderCapabilities} from '../providers/modelCatalog.js';
import type {ProviderRegistry} from '../providers/registry.js';
import {formatFallbackChain, resolveProviderChain} from '../providers/fallbacks.js';
import {listProviderCatalogEntries} from '../providers/catalog.js';
import {validateProviderEnv} from '../providers/envValidation.js';
import {buildConnectorDoctorChecks} from '../connectors/doctor.js';
import {buildMcpDoctorChecks} from './mcpDoctor.js';
import {TaskStore} from '../tasks/taskStore.js';
import {formatPromptText, formatUnknownError} from '../utils/display.js';
import {readJsonFileStrict} from '../utils/fs.js';
import {getGlobalConfigPath} from '../utils/paths.js';
import {trace} from '../utils/trace.js';
import {buildLspDoctorChecks} from './lspChecks.js';
import {readProjectBrain} from '../projectBrain/reader.js';
import {applySafeDoctorFixes, buildBridgeChecks, buildMemoryTokenEvalChecks, buildRuntimeBrainDoctorChecks, buildSafetyEngineChecks, buildSandboxDoctorChecks, buildSystemDoctorChecks, buildTaskWorktreeDoctorChecks} from './extraChecks.js';
export type DoctorCheckStatus = 'pass' | 'fail' | 'skip' | 'warn';
export type ProviderConfidence = 'high' | 'low' | 'medium' | 'none';
export interface DoctorCheck {
  detail: string;
  fix?: string;
  label: string;
  status: DoctorCheckStatus;
}
export interface DoctorReport {
  checks: DoctorCheck[];
}
interface RunDoctorOptions {
  config: ResolvedConfig;
  cwd: string;
  fix?: boolean;
  modelOverride?: string;
  providerBaseUrlOverride?: string;
  providerOverride?: string;
  providerRegistry: ProviderRegistry;
  strictProviderConnectivity?: boolean;
  testProviderConnectivity?: boolean;
}
export interface ProviderSmokeResult {
  confidence: ProviderConfidence;
  detail: string;
  fix?: string;
  latencyMs?: number;
  status: DoctorCheckStatus;
}
const formatProviderLabel = (providerName: string, model: string): string => `${providerName}/${model}`;
const getSmokeBaseUrl = (
  config: ResolvedConfig,
  providerName: string,
  providerBaseUrlOverride?: string,
): string => {
  return providerBaseUrlOverride
    ?? config.effective.baseUrls[providerName]
    ?? config.effective.baseUrls.openaiCompatible
    ?? '';
};
const buildSmokeConfig = (
  config: ResolvedConfig,
  providerName: string,
  model: string,
  baseUrl: string,
) => {
  return {
    ...config.effective,
    baseUrls: {
      ...config.effective.baseUrls,
      [providerName]: baseUrl,
    },
    defaultModel: model,
    defaultProvider: providerName,
  };
};
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
const formatSmokeMessage = (message: string): string => {
  const normalized = formatPromptText(message).trim();
    if (!normalized) return normalized;
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Fall back to the raw normalized text when the provider response is not JSON.
  }
  return normalized;
};
const commandVersion = async (command: string, args = ['--version']): Promise<string | null> => {
  const result = await execa(command, args, {reject: false});
  if (result.exitCode !== 0) {
      return null;
  }
  return (result.stdout || result.stderr).trim().split('\n')[0] ?? null;
};
const validateConfigFile = async (): Promise<DoctorCheck> => {
  const configPath = getGlobalConfigPath();
  try {
    await fs.access(configPath);
  } catch {
    return {
      detail: 'No user config file found. Default settings will be used until you configure one.',
      label: 'Config valid',
      status: 'pass',
    };
  }
  try {
    await readJsonFileStrict<unknown>(configPath);
    return {
      detail: `Parsed ${configPath}`,
      label: 'Config valid',
      status: 'pass',
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Unknown JSON parse error',
      fix: 'Fix or remove the config file, then rerun `apeironcode doctor`.',
      label: 'Config valid',
      status: 'fail',
    };
  }
};
const testOllamaReachability = async (baseUrl: string, model: string): Promise<ProviderSmokeResult> => {
  try {
    const response = await withTimeout(fetch(`${baseUrl}/api/tags`), 2_500);
    if (!response.ok) {
      return {
        confidence: 'low',
        detail: `Ollama responded with HTTP ${response.status} at ${baseUrl}`,
        fix: 'Run `ollama serve` or set a different base URL with `apeironcode config set baseUrl ...`.',
        status: 'fail',
      };
    }
    const payload = (await response.json()) as {models?: Array<{name?: string}>};
    const models = payload.models
      ?.map((entry) => entry.name)
      .filter((value): value is string => Boolean(value)) ?? [];
    if (models.length > 0 && !models.includes(model)) {
      return {
        confidence: 'medium',
        detail: `Ollama reachable at ${baseUrl}, but model ${model} is not installed`,
        fix: `Run \`ollama pull ${model}\` or switch models before retrying.`,
        status: 'warn',
      };
    }
    return {
      confidence: 'high',
      detail: `Ollama reachable at ${baseUrl}${models.length > 0 ? ` with model ${model} available` : ''}`,
      status: 'pass',
    };
  } catch {
    return {
      confidence: 'low',
      detail: `Ollama not reachable at ${baseUrl}`,
      fix: 'Run `ollama serve`, install Ollama, or switch providers with `apeironcode config set provider ...`.',
      status: 'fail',
    };
  }
};
export const runProviderSmokeTest = async ({
  config,
  modelOverride,
  providerBaseUrlOverride,
  providerOverride,
  providerRegistry,
  strictProviderConnectivity = false,
}: Pick<RunDoctorOptions, 'config' | 'modelOverride' | 'providerBaseUrlOverride' | 'providerOverride' | 'providerRegistry' | 'strictProviderConnectivity'>): Promise<ProviderSmokeResult> => {
  const providerName = providerOverride ?? config.effective.defaultProvider;
  const model = modelOverride ?? config.effective.defaultModel;
  const providerLabel = formatProviderLabel(providerName, model);
  const baseUrl = getSmokeBaseUrl(config, providerName, providerBaseUrlOverride);
  const startedAt = Date.now();
  if (providerName === 'ollama') {
    const ollamaCheck = await testOllamaReachability(baseUrl || 'http://localhost:11434', model);
    if (ollamaCheck.status !== 'pass') {
      if (strictProviderConnectivity && ollamaCheck.status === 'warn') {
        return {
          ...ollamaCheck,
          latencyMs: Date.now() - startedAt,
          status: 'fail',
        };
      }
      return {...ollamaCheck, latencyMs: Date.now() - startedAt};
    }
  }
  const smokeConfig = buildSmokeConfig(config, providerName, model, baseUrl);
  const apiKey = resolveProviderApiKey(providerName, smokeConfig);
  if (!apiKey && !['mock', 'ollama'].includes(providerName)) {
    const envName = smokeConfig.apiKeyEnvNames[providerName] ?? 'API key env var';
    return {
      confidence: 'none',
      detail: strictProviderConnectivity
        ? `Provider ${providerLabel} is missing ${envName}.`
        : `Skipped live smoke for ${providerLabel}: ${envName} is not set.`,
      fix: `Export ${envName} in your shell before testing provider connectivity.`,
      latencyMs: Date.now() - startedAt,
      status: strictProviderConnectivity ? 'fail' : 'skip',
    };
  }
  try {
    const provider = providerRegistry.create(providerName, smokeConfig);
    let message = '';
    const streamPromise = (async () => {
      for await (const chunk of provider.stream({
        messages: [{content: 'Reply with OK.', role: 'user'}],
        model,
        temperature: 0,
      })) {
        if (chunk.type === 'token') {
          message += chunk.token ?? '';
        }
      }
    })();
    await withTimeout(streamPromise, 5_000);
  const normalizedMessage = formatSmokeMessage(message);
    const hasContent = normalizedMessage.trim().length > 0;
    const exactOk = /^ok$/iu.test(normalizedMessage);
    // Any non-empty assistant content means the provider + model + auth all
    // work — that is a PASS. Only an empty response is unexpected.
    return {
      confidence: exactOk ? 'high' : hasContent ? 'medium' : 'low',
      detail: `Provider ${providerLabel} responded${baseUrl ? ` via ${baseUrl}` : ''}: ${normalizedMessage || '(empty response)'}`,
      latencyMs: Date.now() - startedAt,
      status: hasContent ? 'pass' : strictProviderConnectivity ? 'fail' : 'warn',
      fix: hasContent
        ? undefined
        : 'The provider responded with no content. Check the model name and account access.',
    };
  } catch (error) {
    const detail = formatUnknownError(error) || 'Unknown provider error';
    const isAuthError =
      (error as {code?: string})?.code === 'PROVIDER_AUTH_ERROR' ||
      /\b401\b|\b403\b|unauthorized|forbidden|authentication failed/iu.test(detail);
    if (isAuthError) {
      return {
        confidence: 'low',
        detail: `${providerLabel} authentication failed (token invalid, expired, missing Models: Read, or GitHub Models not enabled).`,
        fix: [
          'Recreate a GitHub token with Models: Read permission,',
          'verify GitHub Models access for the account/org,',
          'export it (export GITHUB_TOKEN="github_pat_..."),',
          'then rerun `apeironcode doctor --strict`.',
        ].join(' '),
        latencyMs: Date.now() - startedAt,
        status: 'fail',
      };
    }
    return {
      confidence: 'low',
      detail,
      fix: 'Check provider configuration, base URL, model name, and network connectivity.',
      latencyMs: Date.now() - startedAt,
      status: 'fail',
    };
  }
};
export const runDoctor = async ({
  config,
  cwd,
  fix = false,
  providerRegistry,
  strictProviderConnectivity = false,
  testProviderConnectivity = false,
}: RunDoctorOptions): Promise<DoctorReport> => trace('doctor.run', async () => {
  const checks: DoctorCheck[] = [];
  checks.push({
    detail: process.version,
    fix: process.versions.node < '18.18.0' ? 'Upgrade Node.js to 18.18 or newer.' : undefined,
    label: 'Node',
    status: process.versions.node >= '18.18.0' ? 'pass' : 'fail',
  });
  const npmVersion = await commandVersion('npm', ['--version']);
  checks.push({
    detail: npmVersion ?? 'npm not available',
    fix: npmVersion ? undefined : 'Install npm or ensure it is on your PATH.',
    label: 'npm',
    status: npmVersion ? 'pass' : 'fail',
  });
  const gitVersion = await commandVersion('git', ['--version']);
  checks.push({
    detail: gitVersion ?? 'git not available',
    fix: gitVersion ? undefined : 'Install git and ensure it is on your PATH.',
    label: 'Git available',
    status: gitVersion ? 'pass' : 'fail',
  });
  checks.push(...await buildSystemDoctorChecks(cwd));
  const rgVersion = await commandVersion('rg', ['--version']);
  checks.push({
    detail: rgVersion ?? 'ripgrep not available; JS search fallback will be used',
    fix: rgVersion ? undefined : 'Install ripgrep for faster search and grep operations.',
    label: 'ripgrep available',
    status: rgVersion ? 'pass' : 'warn',
  });
  try {
    await fs.access(cwd, fs.constants.R_OK | fs.constants.W_OK);
    checks.push({
      detail: `${cwd} is readable and writable`,
      label: 'Workspace permissions',
      status: 'pass',
    });
  } catch {
    checks.push({
      detail: `${cwd} is not readable and writable`,
      fix: 'Use a writable project directory or adjust filesystem permissions.',
      label: 'Workspace permissions',
      status: 'fail',
    });
  }
  checks.push(await validateConfigFile());
  const providerName = config.effective.defaultProvider;
  checks.push({
    detail: providerName,
    fix: providerRegistry.has(providerName)
      ? undefined
      : `Choose one of: ${providerRegistry.listProviderNames().join(', ')}`,
    label: 'Provider selection',
    status: providerRegistry.has(providerName) ? 'pass' : 'fail',
  });
  checks.push({
    detail: config.effective.defaultModel,
    fix: config.effective.defaultModel ? undefined : 'Set a model with `apeironcode config set model ...`.',
    label: 'Model selection',
    status: config.effective.defaultModel ? 'pass' : 'fail',
  });
  checks.push({
    detail: formatProviderCapabilities(
      getProviderCapabilities(providerName, config.effective.defaultModel),
    ),
    label: 'Provider capabilities',
    status: 'pass',
  });
  checks.push({
    detail: `${listProviderCatalogEntries().length} provider(s) cataloged`,
    label: 'Provider catalog',
    status: 'pass',
  });
  checks.push({
    detail: config.effective.localOnly ? 'localOnly enabled' : 'localOnly disabled',
    label: 'Provider localOnly',
    status: 'pass',
  });
  // Check environment variables for active provider
  const providerEnvValidation = validateProviderEnv(providerName);
  if (providerEnvValidation.missing.length > 0) {
    checks.push({
      detail: `Missing: ${providerEnvValidation.missing.join(', ')}`,
      fix: `Export ${providerEnvValidation.missing.join(', ')} environment variable(s).`,
      label: `${providerName} environment`,
      status: 'fail',
    });
  } else if (providerEnvValidation.warnings.length > 0) {
    checks.push({
      detail: providerEnvValidation.warnings.join('; '),
      label: `${providerName} environment`,
      status: 'warn',
    });
  } else {
    checks.push({
      detail: `Required env vars present: ${providerEnvValidation.present.join(', ') || '(none)'}`,
      label: `${providerName} environment`,
      status: 'pass',
    });
  }
  checks.push({
    detail: formatFallbackChain(resolveProviderChain('coding', config.effective)),
    label: 'Provider fallback chain',
    status: config.effective.fallbackModel ? 'pass' : 'warn',
    fix: config.effective.fallbackModel ? undefined : 'Set `fallbackModel` to enable automatic provider fallback.',
  });
  const taskStore = new TaskStore(cwd);
  const latestIncompleteTask = await taskStore.getLatestIncomplete();
  checks.push({
    detail: latestIncompleteTask ? `${latestIncompleteTask.id} (${latestIncompleteTask.mode}, ${latestIncompleteTask.status})` : 'No incomplete task plan',
    label: 'Latest incomplete task',
    status: latestIncompleteTask ? 'warn' : 'pass',
  });
  checks.push({
    detail: latestIncompleteTask?.mode ?? 'chat',
    label: 'Active mode',
    status: 'pass',
  });
  checks.push({
    detail: config.projectMemory ? 'Project memory loaded' : 'Project memory is empty',
    fix: config.projectMemory ? undefined : 'Use /memory or apeironcode memory to persist project-specific learnings.',
    label: 'Memory configured',
    status: config.projectMemory ? 'pass' : 'warn',
  });
  checks.push({
    detail: `${(config.user.permissions || []).length + (config.project.permissions || []).length} permission rule(s) configured`,
    label: 'Permission rules',
    status: 'pass',
  });
  checks.push(...buildConnectorDoctorChecks());
  if (fix) checks.push(await applySafeDoctorFixes(cwd));
  checks.push(...await buildSandboxDoctorChecks());
  checks.push(...buildSafetyEngineChecks(config));
  checks.push({
    detail: 'Not enabled by ApeironCode. Use external OS sandboxing if your threat model requires process isolation.',
    fix: 'Run subagents only on trusted repositories or use an external sandbox/container.',
    label: 'OS sandboxing',
    status: 'warn',
  });
  checks.push(...await buildMemoryTokenEvalChecks(cwd, config));
  checks.push(...await buildTaskWorktreeDoctorChecks(cwd));
  checks.push(...await buildBridgeChecks(cwd));
  checks.push({
    detail: 'Not enabled. Team subagents share this process environment and configured provider/connector credentials.',
    fix: 'Use least-privilege environment tokens and avoid exporting secrets unrelated to the task.',
    label: 'Per-subagent credential isolation',
    status: 'warn',
  });
  checks.push({
    detail: 'Not enabled. ApeironCode runs locally in this workspace; no cloud/distributed execution is configured.',
    label: 'Cloud/distributed execution',
    status: 'pass',
  });
  const repoMapManager = new RepoMapManager(cwd);
  const repoMapStatus = await repoMapManager.getMapStatus(cwd);
  checks.push({
    detail: repoMapStatus.map
      ? `${repoMapStatus.stale ? 'stale' : 'fresh'}${repoMapStatus.ageMs !== null ? ` (${Math.max(0, Math.round(repoMapStatus.ageMs / 60000))}m old)` : ''}`
      : 'missing',
    fix: repoMapStatus.stale || !repoMapStatus.map
      ? 'Run `apeironcode context refresh --force` to rebuild the repo map.'
      : undefined,
    label: 'Repo map status',
    status: repoMapStatus.stale || !repoMapStatus.map ? 'warn' : 'pass',
  });
  const plugins = await loadPluginCatalog({config: config.effective, cwd});
  const mcpEndpoints = listPluginMcpEndpoints(plugins);
  checks.push({
    detail: `${plugins.length} plugin(s) loaded`,
    label: 'Plugin load status',
    status: 'pass',
  });
  checks.push({
    detail: `${mcpEndpoints.length} MCP endpoint(s) configured`,
    label: 'MCP config status',
    status: mcpEndpoints.length > 0 ? 'pass' : 'warn',
    fix: mcpEndpoints.length > 0 ? undefined : 'Configure MCP-capable plugins if you expect MCP tools to be available.',
  });
  if (mcpEndpoints.length > 0) {
    const userServers = config.effective.mcp?.servers ?? {};
    const mcpChecks = await buildMcpDoctorChecks({
      endpoints: mcpEndpoints.map((endpoint) => ({
        permissions: userServers[endpoint.server.name]
          ? {
              allowedTools: userServers[endpoint.server.name]?.allowedTools,
              deniedTools: userServers[endpoint.server.name]?.deniedTools,
              trustLevel: userServers[endpoint.server.name]?.trustLevel,
            }
          : undefined,
        serverId: endpoint.server.name,
        spec: endpoint.server,
      })),
    });
    checks.push(...mcpChecks);
  }
  if (providerName === 'ollama') {
    const ollamaBaseUrl = config.effective.baseUrls.ollama ?? 'http://localhost:11434';
    const ollamaCheck = await testOllamaReachability(ollamaBaseUrl, config.effective.defaultModel);
    checks.push({
      detail: ollamaCheck.detail,
      fix: ollamaCheck.fix,
      label: 'Ollama availability',
      status: ollamaCheck.status,
    });
  }
  if (!['mock', 'ollama'].includes(providerName)) {
    const envName = config.effective.apiKeyEnvNames[providerName] ?? 'API key env var';
    const apiKey = resolveProviderApiKey(providerName, config.effective);
    checks.push({
      detail: apiKey ? `${envName} is set` : `${envName} is not set`,
      fix: apiKey ? undefined : `Export ${envName} in your shell before using ${providerName}.`,
      label: 'Provider API key',
      status: apiKey ? 'pass' : 'fail',
    });
  }
  checks.push({
    detail: process.stdin.isTTY && process.stdout.isTTY
      ? 'Interactive TTY detected'
      : 'TTY not available; one-shot mode is recommended',
    fix: process.stdin.isTTY && process.stdout.isTTY
      ? undefined
      : 'Run inside an interactive terminal to use the Ink chat UI.',
    label: 'Interactive terminal',
    status: process.stdin.isTTY && process.stdout.isTTY ? 'pass' : 'warn',
  });
  checks.push(...await buildLspDoctorChecks(cwd, config));
  try {
    const brain = await readProjectBrain(cwd, {maxCharsPerFile: 0});
    checks.push({
      detail: brain.exists
        ? `status=${brain.summary.status}, files=${brain.summary.keyFilesPresent.length}`
        : 'not found — run `apeironcode brain plan` to preview optional per-project context',
      label: 'Project Brain',
      status: brain.exists ? 'pass' : 'warn',
    });
  } catch {
    checks.push({detail: 'could not read Project Brain', label: 'Project Brain', status: 'skip'});
  }
  checks.push(...await buildRuntimeBrainDoctorChecks(cwd));
  if (providerName === 'mock') checks.push({detail: 'Mock provider is for testing only. Run `apeironcode setup` to choose a real provider.', fix: 'Run `apeironcode setup` to configure a usable provider (e.g., ollama, anthropic, openai).', label: 'Mock provider warning', status: 'warn'});
  if (testProviderConnectivity) {
    const smoke = await runProviderSmokeTest({
      config,
      providerRegistry,
      strictProviderConnectivity,
    });
    checks.push({
      detail: `[${smoke.confidence}] ${smoke.detail}`,
      fix: smoke.fix,
      label: 'Provider connectivity',
      status: smoke.status,
    });
  }
  return {checks};
}, {cwd, provider: config.effective.defaultProvider});
const iconByStatus: Record<DoctorCheckStatus, string> = {fail: '✗', pass: '✓', skip: '○', warn: '!'};
export const formatDoctorReport = (report: DoctorReport): string => report.checks.map((check) => {
  const lines = [`${iconByStatus[check.status]} ${check.label}: ${check.detail}`];
  if (check.fix) lines.push(`  Fix: ${check.fix}`);
  return lines.join('\n');
}).join('\n');
