import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ApprovalManager} from '../safety/approvals.js';
import {HookEventLog} from './eventLog.js';
import {HookRegistry} from './registry.js';
import {runHook} from './runner.js';
import type {HookEvent, HookExecutionRecord} from './types.js';

export interface HookRuntimeOptions {
  approvalManager?: ApprovalManager;
  cwd: string;
  eventBus?: EventBus;
}

export class HookRuntime {
  private readonly eventLog: HookEventLog;
  private readonly registry: HookRegistry;

  constructor(private readonly options: HookRuntimeOptions) {
    this.eventLog = new HookEventLog(options.cwd);
    this.registry = new HookRegistry(options.cwd);
  }

  async fire(event: HookEvent, payload: Record<string, unknown> = {}): Promise<HookExecutionRecord[]> {
    const hooks = (await this.registry.list()).filter((hook) => hook.enabled && hook.event === event);
    const records: HookExecutionRecord[] = [];
    for (const hook of hooks) {
      const startedAt = Date.now();
      const result = await runHook(hook, {
        approvalManager: this.options.approvalManager,
        cwd: this.options.cwd,
        event,
        payload,
      });
      const record: HookExecutionRecord = {
        ...result,
        durationMs: Date.now() - startedAt,
        event,
        timestamp: createEventTimestamp(),
      };
      await this.eventLog.append(record);
      records.push(record);
      if (record.ok) {
        this.options.eventBus?.emit({
          message: `hook:${hook.name}:${event}:ok${record.skipped ? ':skipped' : ''}`,
          timestamp: createEventTimestamp(),
          type: 'status.updated',
        });
      } else {
        this.options.eventBus?.emit({
          message: `hook:${hook.name}:${event}:failed:${record.message}`,
          scope: `hook:${hook.name}`,
          timestamp: createEventTimestamp(),
          type: 'error',
        });
      }
      if (!record.ok && hook.failClosed) {
        throw new Error(`Hook ${hook.name} failed for ${event}: ${record.message}`);
      }
    }
    return records;
  }
}
