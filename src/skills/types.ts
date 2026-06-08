export type SkillSafetyLevel = 'low' | 'medium' | 'high';

export interface SkillMetadata {
  allowedTools: string[];
  author?: string;
  description: string;
  examples: string[];
  modelPreference?: string;
  name: string;
  promptInstructions: string;
  requiredPermissions: string[];
  safetyLevel: SkillSafetyLevel;
  tags: string[];
  triggers: string[];
  version: string;
}

export interface LoadedSkill {
  directory: string;
  markdown: string;
  metadata: SkillMetadata;
}

export interface SkillRunRequest {
  input?: string;
  skillName: string;
}

export interface SkillRunPlan {
  allowedTools: string[];
  prompt: string;
  requiredPermissions: string[];
  safetyLevel: SkillSafetyLevel;
  skillName: string;
}
