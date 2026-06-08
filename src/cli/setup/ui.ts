import type {ResolvedConfig} from '../../config/config.js';
import type {CliHandlers} from '../commands.js';
import {buildProgram} from '../commands.js';

export interface UiLaunchState {
  config: ResolvedConfig;
  cwd: string;
  needsSetup: boolean;
}

export const createUiLaunchState = (
  cwd: string,
  config: ResolvedConfig,
  needsSetup: boolean,
): UiLaunchState => ({config, cwd, needsSetup});

export const createCliProgram = (handlers: CliHandlers) => {
  return buildProgram(handlers);
};
