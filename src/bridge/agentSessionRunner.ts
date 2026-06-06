/**
 * ApeironCode Bridge — Agent Session Runner.
 * Runs prompts via an injectable AgentRunnerFn.
 * No provider bypass, no ToolRegistry bypass, no direct LLM calls here.
 */

import {randomUUID} from 'node:crypto';
import type {BridgeMessage} from './types.js';
import {createBridgeMessage, createBridgeErrorMessage} from './types.js';
import {sanitizeBridgeMessage} from './redaction.js';
import type {BridgeSendPromptRequest} from './commands.js';
import {buildPromptWithContext} from './commands.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type BridgeEventEmitter = (msg: BridgeMessage) => Promise<void>;

export interface AgentRunResult {
  status: 'completed' | 'failed' | 'stopped';
  finalMessage?: string;
  error?: string;
}

/**
 * Injectable runner function type.
 * Implementations must use Agent.run() via existing CLI infra — no provider bypass.
 */
export type AgentRunnerFn = (
  prompt: string,
  cwd: string,
  options: AgentRunnerOptions,
) => Promise<AgentRunResult>;

export interface AgentRunnerOptions {
  mode?: string;
  sessionId?: string;
  stopSignal?: StopSignal;
  onEvent?: BridgeEventEmitter;
  /** Bridge-selected provider (catalog id). */
  providerName?: string;
  /** Bridge-selected model id. */
  model?: string;
}

export interface StopSignal {
  stopped: boolean;
}

// ─── Session state tracking ───────────────────────────────────────────────────

export interface ActiveBridgeSession {
  bridgeSessionId: string;
  agentSessionId?: string;
  cwd: string;
  status: 'idle' | 'running' | 'stopped';
  promptCount: number;
  createdAt: string;
  stopSignal: StopSignal;
}

// ─── BridgeAgentSessionRunner ─────────────────────────────────────────────────

export class BridgeAgentSessionRunner {
  private sessions = new Map<string, ActiveBridgeSession>();
  private readonly runner: AgentRunnerFn;

  constructor(runner: AgentRunnerFn) {
    this.runner = runner;
  }

  /** Starts a new bridge session (no agent run yet). */
  createSession(cwd: string): ActiveBridgeSession {
    const id = randomUUID();
    const session: ActiveBridgeSession = {
      bridgeSessionId: id,
      cwd,
      status: 'idle',
      promptCount: 0,
      createdAt: new Date().toISOString(),
      stopSignal: {stopped: false},
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(bridgeSessionId: string): ActiveBridgeSession | undefined {
    return this.sessions.get(bridgeSessionId);
  }

  getOrCreateSession(bridgeSessionId: string | undefined, cwd: string): ActiveBridgeSession {
    if (bridgeSessionId) {
      const existing = this.sessions.get(bridgeSessionId);
      if (existing) return existing;
    }
    return this.createSession(cwd);
  }

  isRunning(bridgeSessionId: string): boolean {
    return this.sessions.get(bridgeSessionId)?.status === 'running';
  }

  stopSession(bridgeSessionId: string): boolean {
    const session = this.sessions.get(bridgeSessionId);
    if (!session) return false;
    session.stopSignal.stopped = true;
    session.status = 'stopped';
    return true;
  }

  getSessionState(bridgeSessionId: string): {
    sessionId: string;
    status: string;
    promptCount: number;
  } | null {
    const session = this.sessions.get(bridgeSessionId);
    if (!session) return null;
    return {
      sessionId: session.bridgeSessionId,
      status: session.status,
      promptCount: session.promptCount,
    };
  }

  /**
   * Runs a prompt via the injected runner, streaming events to onEvent.
   * Returns after the run completes (success or failure).
   */
  async runPrompt(
    request: BridgeSendPromptRequest,
    onEvent: BridgeEventEmitter,
  ): Promise<void> {
    const session = this.getOrCreateSession(request.sessionId, request.cwd);

    if (session.status === 'running') {
      await onEvent(createBridgeErrorMessage(
        'SESSION_BUSY',
        'Session is already processing a prompt',
        request.requestId,
      ));
      return;
    }

    session.status = 'running';
    session.promptCount++;
    session.stopSignal.stopped = false;

    const bridgeSessionId = session.bridgeSessionId;

    // Emit session.created when first prompt starts a new session
    await onEvent(sanitizeBridgeMessage(
      createBridgeMessage('session.created', {
        sessionId: bridgeSessionId,
        status: 'active',
      }, {requestId: request.requestId}),
    ));

    // Emit agent.started
    await onEvent(sanitizeBridgeMessage(
      createBridgeMessage('agent.started', {
        sessionId: bridgeSessionId,
        promptCount: session.promptCount,
      }),
    ));

    // Echo user message
    await onEvent(sanitizeBridgeMessage(
      createBridgeMessage('session.message', {
        role: 'user',
        content: request.prompt.slice(0, 2000),
        sessionId: bridgeSessionId,
      }),
    ));

    const fullPrompt = buildPromptWithContext(request.prompt, request.selectedContext);

    try {
      const result = await this.runner(fullPrompt, request.cwd, {
        mode: request.mode,
        sessionId: bridgeSessionId,
        stopSignal: session.stopSignal,
        onEvent,
        providerName: request.providerName,
        model: request.model,
      });

      session.status = result.status === 'stopped' ? 'stopped' : 'idle';

      if (result.status === 'completed') {
        if (result.finalMessage) {
          await onEvent(sanitizeBridgeMessage(
            createBridgeMessage('session.message', {
              role: 'assistant',
              content: result.finalMessage.slice(0, 4000),
              sessionId: bridgeSessionId,
            }),
          ));
        }
        await onEvent(sanitizeBridgeMessage(
          createBridgeMessage('agent.completed', {
            sessionId: bridgeSessionId,
            promptCount: session.promptCount,
          }),
        ));
        await onEvent(sanitizeBridgeMessage(
          createBridgeMessage('session.completed', {
            sessionId: bridgeSessionId,
          }),
        ));
      } else if (result.status === 'stopped') {
        await onEvent(sanitizeBridgeMessage(
          createBridgeMessage('agent.completed', {
            sessionId: bridgeSessionId,
            stopped: true,
          }),
        ));
      } else {
        await onEvent(sanitizeBridgeMessage(
          createBridgeMessage('agent.failed', {
            sessionId: bridgeSessionId,
            error: 'Agent run failed',
          }),
        ));
      }
    } catch (err) {
      session.status = 'idle';
      const safeMessage = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
      await onEvent(sanitizeBridgeMessage(
        createBridgeMessage('agent.failed', {
          sessionId: bridgeSessionId,
          error: safeMessage,
        }),
      ));
      await onEvent(createBridgeErrorMessage(
        'AGENT_RUN_FAILED',
        'Agent run failed',
        request.requestId,
      ));
    }
  }
}

// ─── No-op runner for tests/placeholder ──────────────────────────────────────

/**
 * A placeholder runner that immediately returns a canned response.
 * Used when no real agent is available (tests, bridge status checks).
 */
export const createPlaceholderRunner = (): AgentRunnerFn =>
  // eslint-disable-next-line @typescript-eslint/require-await
  async (): Promise<AgentRunResult> => ({
    status: 'completed',
    finalMessage: 'Bridge agent routing ready. Prompt submission wired.',
  });
