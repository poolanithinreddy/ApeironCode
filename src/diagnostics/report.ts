import os from 'node:os';

import type {ResolvedConfig} from '../config/config.js';
import {listConnectorStatuses} from '../connectors/registry.js';
import {formatDoctorReport, runDoctor, type DoctorReport} from './doctor.js';
import type {ProviderRegistry} from '../providers/registry.js';
import {redactLogValue} from '../utils/structuredLogger.js';

export interface SystemReport {
  config: unknown;
  connectors: Awaited<ReturnType<typeof listConnectorStatuses>>;
  doctor: DoctorReport;
  generatedAt: string;
  node: string;
  platform: string;
}

export const generateSystemReport = async (
  options: {config: ResolvedConfig; cwd: string; providerRegistry: ProviderRegistry},
): Promise<SystemReport> => ({
  config: redactLogValue(options.config.effective),
  connectors: await listConnectorStatuses(options.cwd),
  doctor: await runDoctor({config: options.config, cwd: options.cwd, providerRegistry: options.providerRegistry}),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${os.platform()}/${os.arch()}`,
});

export const formatSystemReportMarkdown = (report: SystemReport): string => [
  '# ApeironCode System Report',
  '',
  `Generated: ${report.generatedAt}`,
  `Node: ${report.node}`,
  `Platform: ${report.platform}`,
  '',
  '## Connectors',
  ...report.connectors.map((connector) => `- ${connector.name}: ${connector.configured ? 'configured' : 'missing'} (${connector.detail})`),
  '',
  '## Doctor',
  '```text',
  formatDoctorReport(report.doctor),
  '```',
  '',
  '## Redacted Config',
  '```json',
  JSON.stringify(report.config, null, 2),
  '```',
].join('\n');
