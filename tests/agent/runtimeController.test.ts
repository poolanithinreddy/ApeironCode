import {describe, expect, it} from 'vitest';

import {RuntimeController} from '../../src/agent/runtimeController.js';
import {EventBus} from '../../src/core/events/bus.js';

describe('RuntimeController', () => {
  it('emits state, checkpoint, verification, recovery, and cancellation events', () => {
    const eventBus = new EventBus();
    const runtime = new RuntimeController(eventBus);

    runtime.startRun();
    runtime.startCheckpoint('cp_1');
    runtime.startToolExecution('edit_file', 1);
    runtime.finishToolExecution({createdAt: '', id: '1', input: {}, status: 'success', toolName: 'edit_file'});
    runtime.startVerification('npm test');
    runtime.completeVerification(true, 'passed');
    runtime.startRecovery('retry without token=secret');
    runtime.completeRecovery(true, 'ok');
    runtime.cancelRun('user interrupt');

    const types = eventBus.snapshot().map((event) => event.type);
    expect(types).toContain('runtime.state_changed');
    expect(types).toContain('runtime.checkpoint_created');
    expect(types).toContain('runtime.verification_started');
    expect(types).toContain('runtime.recovery_started');
    expect(types).toContain('runtime.cancelled');
    expect(runtime.summary()).toMatchObject({cancelled: true, checkpointIds: ['cp_1'], recoveryAttempts: 1});
  });

  it('records rollback events', () => {
    const eventBus = new EventBus();
    const runtime = new RuntimeController(eventBus);

    runtime.startRollback('cp_2');
    runtime.completeRollback('cp_2', true, 'restored');

    expect(eventBus.snapshot().map((event) => event.type)).toEqual([
      'runtime.rollback_started',
      'runtime.rollback_completed',
    ]);
  });
});
