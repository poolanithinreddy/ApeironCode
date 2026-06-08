import {describe, expect, it} from 'vitest';

import {
  formatToolInputError,
  isToolInputContractError,
  normalizeToolCall,
  shouldRetryToolInputError,
  validateToolInput,
} from '../../src/agent/toolExecutionContract.js';

describe('toolExecutionContract', () => {
  it('read_file missing path gives a read_file-specific error, never write_file', () => {
    const {input} = normalizeToolCall('read_file', {});
    const error = validateToolInput('read_file', input);
    expect(error).not.toBeNull();
    expect(error!.message).toBe('read_file requires path');
    expect(error!.message).not.toMatch(/write_file/);
  });

  it('write_file missing path/content gives write_file-specific error', () => {
    const error = validateToolInput('write_file', {});
    expect(error!.message).toBe('write_file requires path and content');
  });

  it('todo_write missing todos gives todo_write-specific error', () => {
    const error = validateToolInput('todo_write', {});
    expect(error!.message).toBe('todo_write requires todos');
  });

  it('project_tree missing args normalizes to {} and is valid', () => {
    const {input} = normalizeToolCall('project_tree', '');
    expect(input).toEqual({});
    expect(validateToolInput('project_tree', input)).toBeNull();
  });

  it('valid inputs pass', () => {
    expect(validateToolInput('read_file', {path: 'a.ts'})).toBeNull();
    expect(
      validateToolInput('write_file', {path: 'a.ts', content: ''}),
    ).toBeNull();
    expect(validateToolInput('todo_write', {todos: []})).toBeNull();
  });

  it('null-ish / string inputs normalize correctly', () => {
    expect(normalizeToolCall('read_file', 'null').input).toEqual({});
    expect(normalizeToolCall('read_file', '{"path":"a.ts"}').input).toEqual({
      path: 'a.ts',
    });
    expect(normalizeToolCall('read_file', undefined).input).toEqual({});
  });

  it('missing-required errors are never retried', () => {
    const error = validateToolInput('write_file', {});
    expect(shouldRetryToolInputError(error)).toBe(false);
    expect(isToolInputContractError(error)).toBe(true);
  });

  it('debug mode appends details, normal mode stays concise', () => {
    const error = validateToolInput('write_file', {path: 'a'})!;
    expect(formatToolInputError(error, 'normal')).toBe(
      'write_file requires path and content',
    );
    expect(formatToolInputError(error, 'debug')).toContain('Missing fields: content');
  });
});
