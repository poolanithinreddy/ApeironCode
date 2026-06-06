export type HookEvent =
  | 'after_command'
  | 'after_commit'
  | 'after_edit'
  | 'after_skill'
  | 'after_plan'
  | 'after_tool'
  | 'before_command'
  | 'before_commit'
  | 'before_edit'
  | 'before_skill'
  | 'before_plan'
  | 'before_tool'
  | 'memory_suggested'
  | 'session_complete'
  | 'session_fail'
  | 'session_start'
  | 'skill_completed'
  | 'skill_started'
  | 'tool_error';

export interface HookDefinition {
  command?: string;
  enabled: boolean;
  event: HookEvent;
  failClosed?: boolean;
  name: string;
  skill?: string;
  type: 'built-in' | 'shell' | 'skill';
}

export interface HookConfig {
  hooks: HookDefinition[];
}

export interface HookRunResult {
  event?: HookEvent;
  message: string;
  name: string;
  ok: boolean;
  skipped?: boolean;
}

export interface HookExecutionRecord extends HookRunResult {
  durationMs: number;
  timestamp: string;
}
