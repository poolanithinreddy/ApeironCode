import {formatUnknownError} from './display.js';

export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export const isErrorLike = (value: unknown): value is Error => {
  return value instanceof Error;
};

export const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }

  return new Error(formatUnknownError(value) || 'Unknown error');
};