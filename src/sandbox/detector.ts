import {execa} from 'execa';

import type {SandboxBackendId, SandboxBackendStatus, SandboxStatus} from './types.js';

export type SandboxProbe = (command: string, args: string[]) => Promise<{exitCode: number; stdout?: string}>;

const defaultProbe: SandboxProbe = async (command, args) => {
  const result = await execa(command, args, {reject: false, timeout: 2000});
  return {exitCode: result.exitCode ?? 1, stdout: result.stdout};
};

const backends: Array<{args: string[]; command: string; id: SandboxBackendId}> = [
  {args: ['--version'], command: 'docker', id: 'docker'},
  {args: ['--version'], command: 'podman', id: 'podman'},
  {args: ['--version'], command: 'firejail', id: 'firejail'},
];

export const detectSandboxStatus = async (probe: SandboxProbe = defaultProbe): Promise<SandboxStatus> => {
  const statuses: SandboxBackendStatus[] = [];
  for (const backend of backends) {
    try {
      const result = await probe(backend.command, backend.args);
      const available = result.exitCode === 0;
      statuses.push({
        available,
        command: backend.command,
        detail: available ? (result.stdout?.split('\n')[0] ?? 'available') : 'not available',
        id: backend.id,
      });
    } catch (error) {
      statuses.push({
        available: false,
        command: backend.command,
        detail: error instanceof Error ? error.message : 'not available',
        id: backend.id,
      });
    }
  }

  return {
    backends: statuses,
    limitations: [
      'Command sandboxing is advisory only in this build.',
      'Agent tools still run in the local process unless a future sandbox runner is explicitly enabled.',
      'Provider credentials are inherited from the current environment.',
    ],
    mode: 'none',
  };
};

