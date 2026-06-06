import type {HookEvent, HookResult, RegisteredHook} from './types.js';

export class HookRunner {
  private hooks: RegisteredHook[] = [];

  register(hook: RegisteredHook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }

  unregister(hookId: string): void {
    this.hooks = this.hooks.filter((h) => h.id !== hookId);
  }

  count(): number {
    return this.hooks.length;
  }

  clear(): void {
    this.hooks = [];
  }

  async run(event: HookEvent): Promise<HookResult> {
    const applicable = this.hooks.filter((h) => h.events.includes(event.type));
    let currentEvent: HookEvent = {...event};
    const warnings: string[] = [];

    for (const hook of applicable) {
      const result = await hook.handler(currentEvent);

      if (result.action === 'block' || result.action === 'deny') {
        return result;
      }
      if (result.action === 'warn' && result.message) {
        warnings.push(result.message);
      }
      if (result.action === 'modifyInput' && result.modifiedInput) {
        currentEvent = {...currentEvent, input: result.modifiedInput};
      }
      if (result.action === 'injectContext') {
        return result;
      }
    }

    if (warnings.length > 0) {
      return {action: 'warn', message: warnings.join('\n')};
    }
    return {action: 'continue'};
  }
}

export const globalHookRunner = new HookRunner();
