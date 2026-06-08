import type {MemorySuggestion} from '../memory/suggestions.js';
import {redactSecrets} from '../share/redactor.js';

export interface MemoryReviewItemViewModel {
  factsLine: string;
  factPreviewLines: string[];
  hintLine: string;
  idLine: string;
  redactionLine: string;
  relatedLine: string;
  sourceLine: string;
  summaryLine: string;
  warningLine: string;
}

export interface MemoryReviewViewModel {
  empty: boolean;
  items: MemoryReviewItemViewModel[];
  title: string;
}

export const buildMemoryReviewViewModel = (
  suggestions: MemorySuggestion[],
  filters?: {confidence?: string; source?: string; status?: string; teamRunId?: string},
): MemoryReviewViewModel => {
  const status = filters?.status ?? 'pending';
  const pending = suggestions.filter((suggestion) =>
    suggestion.status === status
    && (!filters?.confidence || suggestion.confidence === filters.confidence)
    && (!filters?.source || suggestion.source === filters.source)
    && (!filters?.teamRunId || suggestion.relatedSessionId === filters.teamRunId || JSON.stringify(suggestion.proposedFacts).includes(filters.teamRunId)));
  return {
    empty: pending.length === 0,
    items: pending.map((suggestion) => {
      const factPreviewLines = suggestion.proposedFacts.slice(0, 3).map((fact, index) => {
        const text = redactSecrets(JSON.stringify(fact));
        return `Fact ${index + 1}: ${text.length > 220 ? `${text.slice(0, 220)}...` : text}`;
      });
      return {
        factsLine: `Facts: ${suggestion.proposedFacts.length} (${suggestion.entityType})`,
        factPreviewLines,
        hintLine: `Approve: /memory approve ${suggestion.id} | Reject: /memory reject ${suggestion.id} | Show: /memory suggestion show ${suggestion.id}`,
        idLine: `${suggestion.id} | ${suggestion.status} | ${suggestion.confidence}`,
        redactionLine: `Redaction: ${suggestion.redactionApplied ? 'applied' : 'not needed'}`,
        relatedLine: `Related: ${suggestion.relatedFiles?.join(', ') || suggestion.relatedSessionId || 'none'}`,
        sourceLine: `Source: ${suggestion.source}${suggestion.relatedSessionId ? ` | Session/team: ${suggestion.relatedSessionId}` : ''}`,
        summaryLine: redactSecrets(suggestion.summary.length > 300 ? `${suggestion.summary.slice(0, 300)}...` : suggestion.summary),
        warningLine: suggestion.redactionApplied ? 'Warnings: redaction applied before review' : 'Warnings: none detected',
      };
    }),
    title: pending.length === 0
      ? `Memory Review (${status}${filters?.confidence ? `, ${filters.confidence}` : ''}${filters?.source ? `, ${filters.source}` : ''}${filters?.teamRunId ? `, team ${filters.teamRunId}` : ''})`
      : `Memory Review (${pending.length} ${status}${filters?.confidence ? `, ${filters.confidence}` : ''}${filters?.source ? `, ${filters.source}` : ''}${filters?.teamRunId ? `, team ${filters.teamRunId}` : ''})`,
  };
};

export const formatMemoryReviewText = (
  suggestions: MemorySuggestion[],
  filters?: {confidence?: string; source?: string; status?: string; teamRunId?: string},
): string => {
  const view = buildMemoryReviewViewModel(suggestions, filters);
  if (view.empty) {
    return `${view.title}\nNo matching memory suggestions.`;
  }
  return [
    view.title,
    '',
    ...view.items.map((item) => [
      item.idLine,
      item.sourceLine,
      item.summaryLine,
      item.factsLine,
      ...item.factPreviewLines,
      item.relatedLine,
      item.redactionLine,
      item.warningLine,
      item.hintLine,
    ].join('\n')),
  ].join('\n\n');
};
