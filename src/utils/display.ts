const stringifyWithCircularHandling = (value: object): string => {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key: string, candidate: unknown) => {
      if (candidate instanceof Error) {
        return {
          message: candidate.message,
          name: candidate.name,
          stack: candidate.stack,
        };
      }

      if (candidate && typeof candidate === 'object') {
        if (seen.has(candidate)) {
          return '[Circular]';
        }

        seen.add(candidate);
      }

      if (typeof candidate === 'bigint') {
        return `${candidate.toString()}n`;
      }

      return candidate;
    },
    2,
  ) ?? '[Unserializable object]';
};

export const toDisplayString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.message || value.name;
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'symbol') {
    return value.description ? `Symbol(${value.description})` : 'Symbol()';
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (typeof value === 'object') {
    try {
      return stringifyWithCircularHandling(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  return '';
};

export const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (
    error
    && typeof error === 'object'
    && 'message' in error
  ) {
    const message = (error as {message?: unknown}).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return toDisplayString(error);
};

export const formatPromptText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return toDisplayString(value);
};