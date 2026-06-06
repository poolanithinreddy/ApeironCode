export type HookEventType =
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'Stop'
  | 'FileChanged'
  | 'CwdChanged';

export type HookResultAction =
  | 'continue'
  | 'warn'
  | 'block'
  | 'approve'
  | 'deny'
  | 'modifyInput'
  | 'injectContext';

export interface HookEvent {
  type: HookEventType;
  timestamp: number;
  toolName?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  path?: string;
  cwd?: string;
  permissionAction?: string;
}

export interface HookResult {
  action: HookResultAction;
  message?: string;
  modifiedInput?: Record<string, unknown>;
  injectedContext?: string;
}

export type HookHandler = (event: HookEvent) => Promise<HookResult> | HookResult;

export interface RegisteredHook {
  id: string;
  events: HookEventType[];
  handler: HookHandler;
  priority?: number;
}
