import {redactLogValue} from '../../utils/structuredLogger.js';
import type {SessionExport} from '../types.js';

const escapeHtml = (value: string): string => (redactLogValue(value) as string)
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/"/gu, '&quot;');

const list = (items: string[]): string => items.length
  ? `<ul>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join('')}</ul>`
  : '<p class="empty">None recorded.</p>';

export const formatSessionHtml = (session: SessionExport): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ApeironCode Session Export</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f8fafc;color:#0f172a;line-height:1.5}
main{max-width:980px;margin:0 auto;padding:32px}
section{background:white;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:16px 0}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;overflow:auto}
.meta{color:#475569}.empty{color:#64748b}
</style>
</head>
<body><main>
<h1>ApeironCode Session</h1>
<p class="meta">Secrets and auth headers are redacted in this export.</p>
<section><h2>${escapeHtml(session.goal)}</h2>
<p><strong>Status:</strong> ${escapeHtml(session.status)} | <strong>Mode:</strong> ${escapeHtml(session.mode ?? 'default')}</p>
<p><strong>Provider/Model:</strong> ${escapeHtml(session.provider ?? 'default')} / ${escapeHtml(session.model ?? 'default')}</p>
<p><strong>Session:</strong> <code>${escapeHtml(session.sessionId)}</code></p></section>
<section><h2>Summary</h2><p>${escapeHtml(session.summary ?? 'No summary available.').replace(/\n/gu, '<br>')}</p></section>
<section><h2>Files Changed</h2>${list(session.filesChanged)}</section>
<section><h2>Commands Run</h2>${session.commandsRun.length ? session.commandsRun.map((command) => `<pre>$ ${escapeHtml(command)}</pre>`).join('') : '<p class="empty">None recorded.</p>'}</section>
<section><h2>Tests Run</h2>${list(session.testsRun)}</section>
<section><h2>Events</h2>${session.events?.length ? `<ul>${session.events.slice(-100).map((event) => `<li>${escapeHtml(event.timestamp)} <strong>${escapeHtml(event.type)}</strong> ${escapeHtml(event.message ?? '')}</li>`).join('')}</ul>` : '<p class="empty">None recorded.</p>'}</section>
</main></body></html>`;
