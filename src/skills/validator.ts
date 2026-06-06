import {z} from 'zod';

import type {SkillMetadata} from './types.js';

export const SkillMetadataSchema = z.object({
  allowedTools: z.array(z.string()).default([]),
  author: z.string().optional(),
  description: z.string().min(1),
  examples: z.array(z.string()).default([]),
  modelPreference: z.string().optional(),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
  promptInstructions: z.string().min(1),
  requiredPermissions: z.array(z.string()).default([]),
  safetyLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  version: z.string().default('1.0.0'),
});

export const validateSkillMetadata = (value: unknown): SkillMetadata => {
  const parsed = SkillMetadataSchema.parse(value);
  if (parsed.safetyLevel === 'low' && parsed.requiredPermissions.some((permission) => /Bash|FileWrite|FileEdit/iu.test(permission))) {
    throw new Error('Low-safety skills cannot request write or shell permissions.');
  }
  return parsed;
};

export const validateSkillName = (name: string): string => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(name)) {
    throw new Error('Skill names must be lowercase kebab-case and at most 64 characters.');
  }
  return name;
};
