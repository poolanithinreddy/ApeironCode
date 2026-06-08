import type {SessionExport} from './types.js';

const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  return date.toLocaleString();
};

const formatDuration = (startedAt?: string, completedAt?: string): string => {
  if (!startedAt || !completedAt) {
    return 'In progress';
  }
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

export const formatHtmlExport = (sessionExport: SessionExport): string => {
  const cssReset = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
    body { line-height: 1.6; color: #333; }
  `;

  const cssLayout = `
    body { max-width: 1200px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
    .header { background: #0f172a; color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { font-size: 32px; margin-bottom: 8px; }
    .header p { opacity: 0.9; font-size: 14px; }
    .section { background: white; padding: 24px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section h2 { font-size: 20px; margin-bottom: 16px; color: #0f172a; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 16px; }
    .stat-card { background: #f3f4f6; padding: 16px; border-radius: 4px; border-left: 4px solid #3b82f6; }
    .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #0f172a; }
    .list { list-style: none; }
    .list li { padding: 8px; border-bottom: 1px solid #e5e7eb; }
    .list li:last-child { border-bottom: none; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-right: 8px; }
    .badge-status { background: #dbeafe; color: #1e40af; }
    .badge-mode { background: #dcfce7; color: #166534; }
    .badge-error { background: #fee2e2; color: #991b1b; }
    .code-block { background: #f3f4f6; padding: 12px; border-radius: 4px; overflow-x: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; }
    .meta { font-size: 12px; color: #6b7280; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; margin-top: 30px; }
    .empty { color: #9ca3af; font-style: italic; }
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ApeironCode Session Export</title>
  <style>
    ${cssReset}
    ${cssLayout}
  </style>
</head>
<body>
  <div class="header">
    <h1>ApeironCode Session</h1>
    <p>${escapeHtml(sessionExport.goal)}</p>
  </div>

  <div class="section">
    <h2>Session Overview</h2>
    <div class="grid">
      <div class="stat-card">
        <div class="stat-label">Session ID</div>
        <div class="stat-value" style="font-size: 14px; font-weight: normal; font-family: monospace;">${sessionExport.sessionId.substring(0, 8)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Status</div>
        <div class="stat-value" style="font-size: 16px;">
          <span class="badge badge-status">${escapeHtml(sessionExport.status)}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Mode</div>
        <div class="stat-value" style="font-size: 16px;">
          <span class="badge badge-mode">${escapeHtml(sessionExport.mode || 'default')}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Provider / Model</div>
        <div class="stat-value" style="font-size: 14px;">${escapeHtml(sessionExport.provider || '—')} / ${escapeHtml(sessionExport.model || '—')}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Timeline</h2>
    <ul class="list">
      <li><strong>Created:</strong> <span class="meta">${formatTimestamp(sessionExport.createdAt)}</span></li>
      ${sessionExport.startedAt ? `<li><strong>Started:</strong> <span class="meta">${formatTimestamp(sessionExport.startedAt)}</span></li>` : ''}
      ${sessionExport.completedAt ? `<li><strong>Completed:</strong> <span class="meta">${formatTimestamp(sessionExport.completedAt)}</span></li>` : ''}
      ${sessionExport.startedAt && sessionExport.completedAt ? `<li><strong>Duration:</strong> <span class="meta">${formatDuration(sessionExport.startedAt, sessionExport.completedAt)}</span></li>` : ''}
    </ul>
  </div>

  ${sessionExport.summary ? `
  <div class="section">
    <h2>Summary</h2>
    <p>${escapeHtml(sessionExport.summary).replace(/\n/g, '<br>')}</p>
  </div>
  ` : ''}

  <div class="section">
    <h2>Work Summary</h2>
    <div class="grid">
      <div class="stat-card">
        <div class="stat-label">Files Changed</div>
        <div class="stat-value">${sessionExport.filesChanged.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Files Locked</div>
        <div class="stat-value">${sessionExport.filesLocked.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Commands Run</div>
        <div class="stat-value">${sessionExport.commandsRun.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tests Run</div>
        <div class="stat-value">${sessionExport.testsRun.length}</div>
      </div>
    </div>
  </div>

  ${sessionExport.filesChanged.length > 0 ? `
  <div class="section">
    <h2>Files Changed (${sessionExport.filesChanged.length})</h2>
    <ul class="list">
      ${sessionExport.filesChanged.slice(0, 20).map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join('')}
      ${sessionExport.filesChanged.length > 20 ? `<li class="empty">... and ${sessionExport.filesChanged.length - 20} more</li>` : ''}
    </ul>
  </div>
  ` : ''}

  ${sessionExport.filesLocked.length > 0 ? `
  <div class="section">
    <h2>Files Locked (${sessionExport.filesLocked.length})</h2>
    <ul class="list">
      ${sessionExport.filesLocked.slice(0, 20).map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join('')}
      ${sessionExport.filesLocked.length > 20 ? `<li class="empty">... and ${sessionExport.filesLocked.length - 20} more</li>` : ''}
    </ul>
  </div>
  ` : ''}

  ${sessionExport.commandsRun.length > 0 ? `
  <div class="section">
    <h2>Commands Run (${sessionExport.commandsRun.length})</h2>
    <div class="code-block">
      ${sessionExport.commandsRun.slice(0, 20).map((cmd) => `<div>$ ${escapeHtml(cmd)}</div>`).join('')}
      ${sessionExport.commandsRun.length > 20 ? `<div class="empty"># ... and ${sessionExport.commandsRun.length - 20} more commands</div>` : ''}
    </div>
  </div>
  ` : ''}

  ${sessionExport.testsRun.length > 0 ? `
  <div class="section">
    <h2>Tests Run (${sessionExport.testsRun.length})</h2>
    <div class="code-block">
      ${sessionExport.testsRun.slice(0, 20).map((test) => `<div>✓ ${escapeHtml(test)}</div>`).join('')}
      ${sessionExport.testsRun.length > 20 ? `<div class="empty"># ... and ${sessionExport.testsRun.length - 20} more tests</div>` : ''}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>Project & Export Info</h2>
    <ul class="list">
      <li><strong>Project Path:</strong> <code>${escapeHtml(sessionExport.projectPath)}</code></li>
      <li><strong>Exported:</strong> <span class="meta">${formatTimestamp(sessionExport.exportedAt)}</span></li>
      ${sessionExport.linkedTaskId ? `<li><strong>Linked Task:</strong> <code>${escapeHtml(sessionExport.linkedTaskId)}</code></li>` : ''}
    </ul>
  </div>

  <div class="footer">
    <p>ApeironCode — Open-source, local-first AI coding assistance</p>
    <p style="margin-top: 8px;">This export was generated automatically. Secrets have been redacted.</p>
  </div>
</body>
</html>`;

  return html;
};
