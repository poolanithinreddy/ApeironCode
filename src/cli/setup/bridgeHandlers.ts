/**
 * CLI handlers for bridge commands (Phase 16F / 16F.1).
 */

import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {
  loadOrCreateBridgeSecret,
  getBridgeSecretPath,
  fingerprintToken,
} from '../../bridge/auth.js';
import {BridgeServer} from '../../bridge/server.js';
import {WebSocketTransport, buildWsEndpoint} from '../../bridge/transport/webSocket.js';
import {
  writeBridgeConnectionFile,
  removeBridgeConnectionFile,
  readBridgeConnectionFile,
} from '../../bridge/connectionFile.js';
import type {AgentRunnerFn, AgentRunResult} from '../../bridge/agentSessionRunner.js';

/** In-process bridge server instance (one per CLI process). */
let activeBridgeServer: BridgeServer | null = null;
let activeBridgeCwd: string | null = null;

/**
 * Creates an AgentRunnerFn from the bootstrap context.
 * Uses existing createAgent + config path. No provider bypass.
 */
const createBridgeAgentRunner = (cwd: string, configStore: BootstrapRuntimeContext['configStore']): AgentRunnerFn =>
  async (prompt, runCwd, opts): Promise<AgentRunResult> => {
    try {
      const {createAgent, createDefaultToolRegistry} = await import('../setup/shared.js');
      const config = await configStore.load();
      const toolRegistry = createDefaultToolRegistry();
      const agent = createAgent(runCwd ?? cwd, config, null, toolRegistry);

      const result = await agent.run(
        {
          allowModeInference: !opts.mode,
          mode: opts.mode as never ?? undefined,
          prompt,
          providerName: opts.providerName ?? config.effective.defaultProvider,
          model: opts.model ?? config.effective.defaultModel,
          agentSessionId: opts.sessionId,
        },
        {
          onStatus: (s) => { void opts.onEvent?.(
            {id: `status-${Date.now()}`, type: 'agent.progress', timestamp: new Date().toISOString(),
              payload: {note: s}}); },
          onToolCall: (tc) => { void opts.onEvent?.(
            {id: `tc-${Date.now()}`, type: 'tool.started', timestamp: new Date().toISOString(),
              payload: {toolName: tc.toolName, toolCallId: tc.id}}); },
          onToolResult: (tc) => { void opts.onEvent?.(
            {id: `tr-${Date.now()}`, type: 'tool.completed', timestamp: new Date().toISOString(),
              payload: {toolName: tc.toolName, toolCallId: tc.id}}); },
        },
      );
      return {
        status: 'completed',
        finalMessage: result.finalMessage.content.slice(0, 4000),
      };
    } catch (err) {
      return {
        status: 'failed',
        error: err instanceof Error ? err.message.slice(0, 200) : 'Agent run failed',
      };
    }
  };

export const createBridgeHandlers = ({cwd, configStore}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
  async bridgeStart(options?: {port?: number}): Promise<void> {
    if (activeBridgeServer?.getStatus().running) {
      process.stdout.write('Bridge already running.\n');
      return;
    }

    const secretInfo = await loadOrCreateBridgeSecret(cwd);
    const secretPath = getBridgeSecretPath(cwd);
    const agentRunner = createBridgeAgentRunner(cwd, configStore);

    const wsTransport = new WebSocketTransport({secretInfo});
    activeBridgeServer = new BridgeServer({transport: wsTransport, secretInfo, agentRunner});
    activeBridgeCwd = cwd;

    await activeBridgeServer.start({localOnly: true, port: options?.port ?? 0});

    const port = wsTransport.getPort();
    const endpoint = buildWsEndpoint(port);

    await writeBridgeConnectionFile(cwd, {
      endpoint,
      tokenFingerprint: secretInfo.fingerprint,
      startedAt: new Date().toISOString(),
      pid: process.pid,
    });

    process.stdout.write([
      'ApeironCode Bridge — local WebSocket server started.',
      `Endpoint: ${endpoint}`,
      `Token fingerprint: ${secretInfo.fingerprint}`,
      `Token stored at: ${secretPath}`,
      'Auth: required (token in bridge-secret.json)',
      'Remote/cloud: not available (local-only).',
      'Server runs until this process exits.',
    ].join('\n') + '\n');
  },

  async bridgeStatus(): Promise<void> {
    const secretInfo = await loadOrCreateBridgeSecret(cwd).catch(() => null);
    const fingerprint = secretInfo ? fingerprintToken(secretInfo.token) : 'none';
    const status = activeBridgeServer?.getStatus();
    const running = status?.running ?? false;

    // Also check connection file for externally started bridge
    const connFile = await readBridgeConnectionFile(cwd).catch(() => null);
    const endpointInfo = running
      ? `see server output`
      : connFile ? `${connFile.endpoint} (fingerprint: ${connFile.tokenFingerprint})` : 'not available';

    process.stdout.write([
      `Bridge status: ${running ? 'running (local WebSocket)' : 'not running'}`,
      `Auth: ${secretInfo ? `configured (fingerprint: ${fingerprint})` : 'not configured'}`,
      `Connections: ${status?.connectionCount ?? 0}`,
      `Endpoint: ${endpointInfo}`,
      'Transport: WebSocket (local-only, 127.0.0.1)',
      'Remote/cloud: not available.',
    ].join('\n') + '\n');
  },

  async bridgeToken(options?: {show?: boolean}): Promise<void> {
    const secretInfo = await loadOrCreateBridgeSecret(cwd);
    const secretPath = getBridgeSecretPath(cwd);

    if (options?.show) {
      process.stdout.write([
        `Bridge token: ${secretInfo.token}`,
        `Fingerprint: ${secretInfo.fingerprint}`,
        `Path: ${secretPath}`,
        'Keep this token secure — it grants access to your local bridge.',
      ].join('\n') + '\n');
    } else {
      process.stdout.write([
        `Bridge token fingerprint: ${secretInfo.fingerprint}`,
        `Full token stored at: ${secretPath}`,
        'Use --show to reveal the full token.',
      ].join('\n') + '\n');
    }
  },

  async bridgeStop(): Promise<void> {
    if (!activeBridgeServer?.getStatus().running) {
      // Try to clean up stale connection file
      await removeBridgeConnectionFile(cwd).catch(() => undefined);
      process.stdout.write('Bridge not running (server stops when process exits).\n');
      return;
    }
    await activeBridgeServer.stop();
    activeBridgeServer = null;
    if (activeBridgeCwd) {
      await removeBridgeConnectionFile(activeBridgeCwd).catch(() => undefined);
      activeBridgeCwd = null;
    }
    process.stdout.write('Bridge stopped.\n');
  },
});
