import type {SessionExport} from './types.js';

export const formatJsonExport = (session: SessionExport): string => {
  return JSON.stringify(session, null, 2);
};
