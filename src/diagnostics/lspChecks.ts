import {scanProject} from '../context/scanner.js';
import {LspContextBuilder} from '../lsp/context.js';
import {LspManager} from '../lsp/manager.js';
import type {ResolvedConfig} from '../config/config.js';
import type {DoctorCheck} from './doctor.js';

export const buildLspDoctorChecks = async (cwd: string, config: ResolvedConfig): Promise<DoctorCheck[]> => {
  const projectScan = await scanProject(cwd);
  const projectLanguages = projectScan.languages.length > 0
    ? projectScan.languages
    : ['TypeScript', 'JavaScript', 'Python'];
  const lspManager = new LspManager(config.effective.lsp);
  const lspBuilder = new LspContextBuilder(lspManager);
  const [projectLspStatuses, lspSummary] = await Promise.all([
    Promise.all(projectLanguages.map((language) => lspManager.getLanguageStatus(language))),
    lspBuilder.buildSummary(projectLanguages),
  ]);
  return [
    {
      detail: projectLspStatuses.map((status) => lspManager.formatStatusReport(status)).join('; '),
      fix: projectLspStatuses.some((status) => status.status === 'missing')
        ? 'Install the missing language server for your workspace language, or continue with fallback code intelligence. Run `apeironcode lsp status` for details.'
        : undefined,
      label: 'LSP servers',
      status: projectLspStatuses.some((status) => status.status === 'available') ? 'pass' : 'warn',
    },
    {
      detail: lspBuilder.formatContextForSummary(lspSummary),
      fix: lspSummary.mode === 'lsp'
        ? undefined
        : 'ApeironCode will rely on repository-map, symbol-hint, and grep-style fallback code intelligence until a supported language server is available.',
      label: 'Code intelligence',
      status: lspSummary.mode === 'lsp' ? 'pass' : 'warn',
    },
    {
      detail: lspSummary.sessions.length > 0
        ? lspSummary.sessions.map((session) => `${session.language}:${session.status}:docs=${session.openDocuments}:diags=${session.diagnosticsCount}`).join('; ')
        : config.effective.lsp.longLivedSessions
          ? 'No active LSP sessions'
          : 'Long-lived LSP sessions are disabled',
      label: 'LSP sessions',
      status: config.effective.lsp.longLivedSessions
        ? lspSummary.sessions.length > 0 ? 'pass' : 'skip'
        : 'skip',
    },
    {
      detail: `entries=${lspSummary.cache.entries}; hits=${lspSummary.cache.hits}; misses=${lspSummary.cache.misses}; writes=${lspSummary.cache.writes}; invalidations=${lspSummary.cache.invalidations}`,
      label: 'LSP cache',
      status: config.effective.lsp.longLivedSessions ? 'pass' : 'skip',
    },
  ];
};
