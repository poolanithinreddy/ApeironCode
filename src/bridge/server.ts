/**
 * ApeironCode IDE Bridge Server.
 * Local-only, auth-required, no unauthenticated requests except hello/auth.
 */

import type {BridgeMessage} from './types.js';
import {
  createBridgeMessage,
  createBridgeErrorMessage,
  createBridgePong,
  isBridgeMessage,
  isBridgeRequest,
} from './types.js';
import {sanitizeBridgeMessage} from './redaction.js';
import {validateBridgeToken} from './auth.js';
import type {BridgeSecretInfo} from './auth.js';
import type {BridgeTransport, BridgeConnection, BridgeServerOptions} from './transport/types.js';
import {InMemoryTransport} from './transport/inMemory.js';
import {
  validateSendPromptPayload,
  validateSessionStartPayload,
  validateSessionStopPayload,
  createSessionBusyMessage,
} from './commands.js';
import {BridgeAgentSessionRunner} from './agentSessionRunner.js';
import type {AgentRunnerFn} from './agentSessionRunner.js';
import {getBridgeProviderCatalog, getBridgeProvider, validateBridgeSessionModel} from './providerCommands.js';
import {validateDiffApplyPayload, executeDiffApplyRequest, formatDiffApplyResultPayload, type PatchFileInvoker} from './diffApply.js';
import {
  applyProjectBrainInitPlan,
  createProjectBrainInitPlan,
  createRunSummaryFromAgentResult,
  formatProjectBrainInitPlan,
  formatProjectBrainInitResult,
  formatProjectBrainSummary,
  readProjectBrain,
  appendRunSummary,
  auditProjectBrainFeatures,
  formatProjectBrainAuditReport,
  createProjectBrainSyncPreview,
  applyProjectBrainSync,
  formatProjectBrainSyncPreview,
  formatProjectBrainSyncResult,
  createBrainPlanFromAppBuildPrompt,
} from '../projectBrain/index.js';
import {handleBrainIntelligenceMessage} from './brainHandlers.js';

export interface BridgeServerConfig {
  transport?: BridgeTransport;
  secretInfo?: BridgeSecretInfo;
  serverOptions?: BridgeServerOptions;
  /** Injectable agent runner. Defaults to placeholder (no real agent calls). */
  agentRunner?: AgentRunnerFn;
  /** Optional test hook for diff apply ToolRegistry path. */
  diffApplyInvoker?: PatchFileInvoker;
}

export interface BridgeStatus {
  running: boolean;
  localOnly: boolean;
  connectionCount: number;
  authRequired: boolean;
}

/** Safe payload providers — return empty/placeholder data when live data unavailable. */
export interface BridgeDataProviders {
  getTaskList?: () => Promise<unknown[]>;
  getTask?: (taskId: string) => Promise<unknown>;
  getContextView?: () => Promise<unknown>;
  getRuntimeState?: () => Promise<unknown>;
  getCheckpointList?: () => Promise<unknown[]>;
}

export class BridgeServer {
  private readonly transport: BridgeTransport;
  private readonly secretInfo: BridgeSecretInfo | undefined;
  private started = false;
  private readonly providers: BridgeDataProviders;
  private readonly sessionRunner: BridgeAgentSessionRunner;
  /** Per-connection active session id. */
  private readonly connectionSessions = new Map<string, string>();
  /** Per-connection preferred provider/model for the next agent run. */
  private readonly connectionModelPrefs = new Map<string, {providerId: string; modelId: string}>();
  private readonly diffApplyInvoker?: PatchFileInvoker;

  constructor(config: BridgeServerConfig = {}, providers: BridgeDataProviders = {}) {
    this.transport = config.transport ?? new InMemoryTransport();
    this.secretInfo = config.secretInfo;
    this.providers = providers;
    this.diffApplyInvoker = config.diffApplyInvoker;
    this.sessionRunner = new BridgeAgentSessionRunner(
      // eslint-disable-next-line @typescript-eslint/require-await
      config.agentRunner ?? (async () => ({status: 'completed' as const, finalMessage: ''})),
    );
    this.transport.onMessage(this.handleMessage.bind(this));
    this.transport.onClose((connId) => {
      this.connectionSessions.delete(connId);
      this.connectionModelPrefs.delete(connId);
    });
  }

  async start(options: BridgeServerOptions = {localOnly: true}): Promise<void> {
    await this.transport.start(options);
    this.started = true;
  }

  async stop(): Promise<void> {
    await this.transport.stop();
    this.started = false;
  }

  getStatus(): BridgeStatus {
    return {
      running: this.started,
      localOnly: true,
      connectionCount: this.transport.connectionCount(),
      authRequired: !!this.secretInfo,
    };
  }

  /** Broadcast a sanitized message to all authenticated connections. */
  async broadcast(message: BridgeMessage): Promise<void> {
    const safe = sanitizeBridgeMessage(message);
    await this.transport.broadcast(safe);
  }

  private async handleMessage(connection: BridgeConnection, rawMessage: unknown): Promise<void> {
    if (!isBridgeMessage(rawMessage)) {
      await connection.send(createBridgeErrorMessage('INVALID_MESSAGE', 'Malformed bridge message'));
      return;
    }

    // Auth gate: only bridge.hello and bridge.auth pass unauthenticated
    if (!connection.authenticated && rawMessage.type !== 'bridge.hello') {
      await connection.send(
        createBridgeErrorMessage('UNAUTHENTICATED', 'Authentication required', rawMessage.id),
      );
      return;
    }

    await this.routeMessage(connection, rawMessage);
  }

  private async routeMessage(connection: BridgeConnection, msg: BridgeMessage): Promise<void> {
    const requestId = isBridgeRequest(msg) ? msg.requestId : undefined;

    switch (msg.type) {
      case 'bridge.hello':
        await this.handleHello(connection, msg);
        return;
      case 'bridge.ping':
        await connection.send(createBridgePong(msg.id));
        return;
      case 'session.start':
        await this.handleSessionStart(connection, msg, requestId);
        return;
      case 'session.send_prompt':
        await this.handleSessionSendPrompt(connection, msg, requestId);
        return;
      case 'session.stop':
        await this.handleSessionStop(connection, msg, requestId);
        return;
      case 'permission.approved':
      case 'permission.denied':
        await this.handlePermissionDecision(connection, msg);
        return;
      case 'session.get_state':
      case 'task.list':
      case 'task.get':
      case 'context.view':
      case 'runtime.get_state':
      case 'checkpoint.list':
        await this.handleDataRequest(connection, msg, requestId);
        return;
      case 'provider.list':
        await this.handleProviderList(connection, requestId);
        return;
      case 'provider.get_active':
        await this.handleProviderGetActive(connection, msg, requestId);
        return;
      case 'provider.set_session_model':
        await this.handleProviderSetSessionModel(connection, msg, requestId);
        return;
      case 'diff.apply_requested':
        await this.handleDiffApplyRequest(connection, msg, requestId);
        return;
      case 'brain.plan':
      case 'brain.init':
      case 'brain.status':
      case 'brain.show':
      case 'brain.update':
      case 'brain.audit':
      case 'brain.sync_preview':
      case 'brain.sync_apply':
      case 'brain.build_plan':
      case 'brain.route':
      case 'brain.context':
      case 'brain.previews':
      case 'brain.preview_show':
      case 'brain.preview_apply':
      case 'brain.orchestrate_app':
      case 'brain.runtime':
      case 'brain.explain':
        await this.handleBrainRequest(connection, msg, requestId);
        return;
      default:
        await connection.send(
          createBridgeErrorMessage('UNKNOWN_TYPE', `Unknown message type: ${String(msg.type)}`, requestId),
        );
    }
  }

  private async handleSessionStart(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const validation = validateSessionStartPayload(msg.payload);
    if (!validation.ok) {
      await connection.send(createBridgeErrorMessage(validation.code, validation.message, requestId));
      return;
    }
    const session = this.sessionRunner.createSession(validation.value.cwd);
    this.connectionSessions.set(connection.id, session.bridgeSessionId);
    await connection.send(sanitizeBridgeMessage(
      createBridgeMessage('session.created', {sessionId: session.bridgeSessionId}, {requestId}),
    ));
  }

  private async handleSessionSendPrompt(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const validation = validateSendPromptPayload({...msg.payload, requestId});
    if (!validation.ok) {
      await connection.send(createBridgeErrorMessage(validation.code, validation.message, requestId));
      return;
    }

    const req = validation.value;

    const prefs = this.connectionModelPrefs.get(connection.id);
    const merged: typeof req = {
      ...req,
      providerName: req.providerName ?? prefs?.providerId,
      model: req.model ?? prefs?.modelId,
    };

    // Resolve or create session
    const existingSessionId = merged.sessionId ?? this.connectionSessions.get(connection.id);
    const session = this.sessionRunner.getOrCreateSession(existingSessionId, merged.cwd);
    this.connectionSessions.set(connection.id, session.bridgeSessionId);

    // Reject if already running
    if (this.sessionRunner.isRunning(session.bridgeSessionId)) {
      await connection.send(createSessionBusyMessage(session.bridgeSessionId, requestId));
      return;
    }

    // Run asynchronously — stream events back to this connection
    const emitter = async (bridgeMsg: BridgeMessage): Promise<void> => {
      await connection.send(bridgeMsg);
    };

    // Fire-and-forget; errors handled inside runPrompt
    void this.sessionRunner.runPrompt({...merged, sessionId: session.bridgeSessionId}, emitter);
  }

  private async handleSessionStop(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const validation = validateSessionStopPayload(msg.payload);
    if (!validation.ok) {
      await connection.send(createBridgeErrorMessage(validation.code, validation.message, requestId));
      return;
    }
    const stopped = this.sessionRunner.stopSession(validation.value.sessionId);
    await connection.send(sanitizeBridgeMessage(
      createBridgeMessage(
        stopped ? 'session.updated' : 'bridge.error',
        stopped
          ? {sessionId: validation.value.sessionId, status: 'stopped'}
          : {code: 'SESSION_NOT_FOUND', message: 'Session not found'},
        {requestId},
      ),
    ));
  }

  private async handlePermissionDecision(
    _connection: BridgeConnection,
    msg: BridgeMessage,
  ): Promise<void> {
    const requestId = typeof msg.payload['requestId'] === 'string' ? msg.payload['requestId'] : '';
    if (!requestId) return;

    const {resolveBridgePermissionRequest} = await import('./permissions.js');
    const decision = msg.type === 'permission.approved' ? 'approved' : 'denied';
    resolveBridgePermissionRequest(requestId, decision);
  }

  private async handleHello(connection: BridgeConnection, msg: BridgeMessage): Promise<void> {
    const {token} = msg.payload;
    if (this.secretInfo) {
      if (typeof token !== 'string' || !validateBridgeToken(token, this.secretInfo)) {
        await connection.send(
          createBridgeErrorMessage('AUTH_FAILED', 'Invalid bridge token', msg.id),
        );
        return;
      }
    }
    connection.authenticated = true;
    await connection.send(createBridgeMessage('bridge.ready', {version: '1.0'}, {requestId: msg.id}));
  }

  private async handleDataRequest(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    let data: unknown;

    try {
      if (msg.type === 'task.list') {
        data = (await this.providers.getTaskList?.()) ?? [];
      } else       if (msg.type === 'task.get') {
        const taskId = msg.payload['taskId'];
        data = typeof taskId === 'string' ? (await this.providers.getTask?.(taskId)) ?? null : null;
      } else if (msg.type === 'context.view') {
        data = (await this.providers.getContextView?.()) ?? {files: [], tokenCount: 0};
      } else if (msg.type === 'runtime.get_state') {
        data = (await this.providers.getRuntimeState?.()) ?? {phase: 'idle'};
      } else if (msg.type === 'checkpoint.list') {
        data = (await this.providers.getCheckpointList?.()) ?? [];
      } else {
        data = {};
      }
    } catch {
      await connection.send(
        createBridgeErrorMessage('PROVIDER_ERROR', 'Data unavailable', requestId),
      );
      return;
    }

    const response = {
      ...createBridgeMessage(msg.type, {data}, {requestId}),
      ok: true,
    };
    await connection.send(sanitizeBridgeMessage(response));
  }

  private async handleProviderList(
    connection: BridgeConnection,
    requestId: string | undefined,
  ): Promise<void> {
    const catalog = getBridgeProviderCatalog();
    await connection.send(sanitizeBridgeMessage(
      createBridgeMessage('provider.list', {providers: catalog}, {requestId}),
    ));
  }

  private async handleProviderGetActive(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const providerId = msg.payload['providerId'];
    const entry = getBridgeProvider(providerId);
    if (!entry) {
      await connection.send(createBridgeErrorMessage('PROVIDER_NOT_FOUND', 'Provider not found', requestId));
      return;
    }
    await connection.send(sanitizeBridgeMessage(
      createBridgeMessage('provider.get_active', {provider: entry}, {requestId}),
    ));
  }

  private async handleProviderSetSessionModel(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const providerId = msg.payload['providerId'];
    const modelId = msg.payload['modelId'] ?? msg.payload['model'];
    const validated = validateBridgeSessionModel(providerId, modelId);
    if (!validated.ok) {
      await connection.send(createBridgeErrorMessage(validated.code, validated.message, requestId));
      return;
    }
    this.connectionModelPrefs.set(connection.id, {
      providerId: validated.providerId,
      modelId: validated.modelId,
    });
    await connection.send(sanitizeBridgeMessage(
      createBridgeMessage('provider.session_model', {
        stored: true,
        providerId: validated.providerId,
        modelId: validated.modelId,
      }, {requestId}),
    ));
  }

  private async handleDiffApplyRequest(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const validation = validateDiffApplyPayload(msg.payload);
    if (!validation.ok) {
      await connection.send(createBridgeErrorMessage(validation.code, validation.message, requestId));
      return;
    }
    const req = validation.value;
    const bridgeSessionId = this.connectionSessions.get(connection.id);
    const sessionCwd = bridgeSessionId
      ? this.sessionRunner.getSession(bridgeSessionId)?.cwd
      : undefined;
    const cwd = req.cwd && req.cwd.length > 0 ? req.cwd : sessionCwd ?? process.cwd();
    const result = await executeDiffApplyRequest(req, cwd, this.diffApplyInvoker);
    await connection.send(sanitizeBridgeMessage(
      createBridgeMessage('diff.apply_result', formatDiffApplyResultPayload(result), {requestId}),
    ));
  }

  private async handleBrainRequest(
    connection: BridgeConnection,
    msg: BridgeMessage,
    requestId: string | undefined,
  ): Promise<void> {
    const cwd = typeof msg.payload['cwd'] === 'string' && msg.payload['cwd'].length > 0
      ? msg.payload['cwd']
      : process.cwd();
    try {
      if (msg.type === 'brain.plan') {
        const plan = await createProjectBrainInitPlan(cwd);
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.plan', {
          preview: formatProjectBrainInitPlan(plan),
          files: plan.files.map((file) => ({path: file.relativePath, status: file.status})),
          requiresApproval: true,
        }, {requestId})));
        return;
      }
      if (msg.type === 'brain.init') {
        const approved = msg.payload['approved'] === true;
        const plan = await createProjectBrainInitPlan(cwd);
        const result = await applyProjectBrainInitPlan(plan, {approved, mergeStrategy: 'preserve'});
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.init', {
          result,
          text: formatProjectBrainInitResult(result),
        }, {requestId})));
        return;
      }
      if (msg.type === 'brain.update') {
        const approved = msg.payload['approved'] === true;
        const rawSummary = msg.payload['summary'];
        const summary = createRunSummaryFromAgentResult(
          {finalMessage: typeof rawSummary === 'string' ? rawSummary : 'Manual Project Brain update', status: 'completed'},
          {prompt: 'VS Code Project Brain update'},
        );
        const appended = await appendRunSummary(cwd, summary, {approved, enabled: approved});
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.update', {appended}, {requestId})));
        return;
      }
      if (msg.type === 'brain.audit') {
        const report = await auditProjectBrainFeatures(cwd);
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.audit', {
          report,
          text: formatProjectBrainAuditReport(report),
        }, {requestId})));
        return;
      }
      if (msg.type === 'brain.sync_preview') {
        const preview = await createProjectBrainSyncPreview({}, {cwd, mode: 'ask'});
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.sync_preview', {
          preview,
          text: formatProjectBrainSyncPreview(preview),
        }, {requestId})));
        return;
      }
      if (msg.type === 'brain.sync_apply') {
        const approved = msg.payload['approved'] === true;
        const previewPayload = msg.payload['preview'];
        const preview = typeof previewPayload === 'object' && previewPayload !== null
          ? (previewPayload as Parameters<typeof applyProjectBrainSync>[0])
          : await createProjectBrainSyncPreview({}, {cwd, mode: 'ask'});
        const result = await applyProjectBrainSync(preview, {approved});
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.sync_apply', {
          result,
          text: formatProjectBrainSyncResult(result),
        }, {requestId})));
        return;
      }
      if (msg.type === 'brain.build_plan') {
        const prompt = typeof msg.payload['prompt'] === 'string' ? msg.payload['prompt'].slice(0, 8_000) : '';
        if (!prompt) {
          await connection.send(createBridgeErrorMessage('BRAIN_BUILD_PLAN_MISSING_PROMPT', 'prompt required', requestId));
          return;
        }
        const {plan, formatted, suggestsInit} = createBrainPlanFromAppBuildPrompt(prompt);
        await connection.send(sanitizeBridgeMessage(createBridgeMessage('brain.build_plan', {
          phases: plan.phases.length,
          stack: plan.assumedStack,
          suggestsInit,
          text: formatted,
        }, {requestId})));
        return;
      }
      if (await handleBrainIntelligenceMessage(msg, connection.send.bind(connection), cwd)) return;
      const brain = await readProjectBrain(cwd);
      await connection.send(sanitizeBridgeMessage(createBridgeMessage(msg.type, {
        summary: brain.summary,
        text: formatProjectBrainSummary(brain.summary),
        files: msg.type === 'brain.show' ? brain.files.map((file) => file.relativePath) : undefined,
      }, {requestId})));
    } catch {
      await connection.send(createBridgeErrorMessage('BRAIN_ERROR', 'Project Brain request failed', requestId));
    }
  }

  /** Exposes the underlying transport for tests (e.g. InMemoryTransport). */
  getTransport(): BridgeTransport { return this.transport; }
}

export const startBridgeServer = async (
  config?: BridgeServerConfig,
  providers?: BridgeDataProviders,
): Promise<BridgeServer> => {
  const server = new BridgeServer(config, providers);
  await server.start({localOnly: true});
  return server;
};
