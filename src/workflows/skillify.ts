/**
 * Skillify: Convert a repeated workflow/checklist description into a SKILL.md draft.
 * No file writes. Deterministic. Secrets redacted.
 */

import {stringifyMarkdownFrontmatter} from './markdown/frontmatter.js';
import {redactSecrets} from '../share/redactor.js';

export interface SkillifyInput {
  name?: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  tokenBudget?: number;
  body: string;
}

export interface SkillDraft {
  name: string;
  slug: string;
  frontmatter: Record<string, string | boolean | number | string[]>;
  body: string;
  markdown: string;
}

const SLUG_REPLACE_RE = /[^a-z0-9]+/gu;

export const suggestSkillName = (text: string): string => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w.length > 2)
    .slice(0, 4);
  return words.join('-').replace(SLUG_REPLACE_RE, '-').replace(/^-+|-+$/gu, '') || 'custom-skill';
};

export const createSkillDraftFromWorkflow = (input: SkillifyInput): SkillDraft => {
  // Redact before deriving slug to avoid leaking secrets into names
  const safeDescription = redactSecrets(input.description);

  const slug = input.name
    ? input.name.toLowerCase().replace(SLUG_REPLACE_RE, '-').replace(/^-+|-+$/gu, '')
    : suggestSkillName(safeDescription);

  const name = input.name ?? slug;
  const safeWhenToUse = input.whenToUse ? redactSecrets(input.whenToUse) : safeDescription;
  const safeBody = redactSecrets(input.body);

  const frontmatter: Record<string, string | boolean | number | string[]> = {
    name,
    description: safeDescription,
    whenToUse: safeWhenToUse,
    progressiveDisclosure: true,
  };

  if (input.allowedTools && input.allowedTools.length > 0) {
    frontmatter['allowedTools'] = input.allowedTools;
  }

  if (input.tokenBudget && input.tokenBudget > 0) {
    frontmatter['tokenBudget'] = input.tokenBudget;
  }

  const markdown = stringifyMarkdownFrontmatter(frontmatter, safeBody);

  return {name, slug, frontmatter, body: safeBody, markdown};
};

export const formatSkillDraftAsMarkdown = (draft: SkillDraft): string => draft.markdown;
