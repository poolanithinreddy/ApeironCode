import type {SandboxExecutionResult, SandboxStatus} from './types.js';

export const formatSandboxStatus = (status: SandboxStatus): string => {
  const backendLines = status.backends.map((backend) =>
    `- ${backend.id}: ${backend.available ? 'available' : 'not available'} (${backend.detail})`,
  );
  return [
    'Sandbox Status',
    `Mode: ${status.mode}`,
    '',
    'Backends',
    ...(backendLines.length > 0 ? backendLines : ['- No sandbox backends probed.']),
    '',
    'Current limits',
    ...status.limitations.map((limit) => `- ${limit}`),
    '',
    'Next step: use approvals, workspace isolation, and review flows for safety; OS sandboxed execution is not enabled.',
  ].join('\n');
};

export const formatSandboxExecutionResult = (result: SandboxExecutionResult): string => {
  const lines: string[] = [
    `Execution via ${result.backend}`,
    `Exit code: ${result.exitCode}`,
    `Duration: ${result.durationMs}ms`,
  ];

  if (result.containerId) {
    lines.push(`Container: ${result.containerId}`);
  }

  if (result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }

  if (result.stdout) {
    lines.push('', 'stdout:', result.stdout);
  }

  if (result.stderr) {
    lines.push('', 'stderr:', result.stderr);
  }

  return lines.join('\n');
};

