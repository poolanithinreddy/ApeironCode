import {createDefaultToolRegistry, type ToolRegistry} from '../../tools/registry.js';

export const initializeToolRegistry = (registry?: ToolRegistry): ToolRegistry => {
  return registry ?? createDefaultToolRegistry();
};

export const validateToolRegistry = (registry: ToolRegistry): {ok: boolean; toolCount: number} => {
  const toolCount = registry.list().length;
  return {
    ok: toolCount > 0,
    toolCount,
  };
};
