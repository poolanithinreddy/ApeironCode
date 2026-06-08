import {describe, it, expect} from 'vitest';

import {
  createAgentRoutingPlan,
  routePromptToProjectAgents,
  formatAgentRoutingPlan,
  selectProjectSkillsForPrompt,
} from '../../src/projectBrain/agentRouter.js';
import type {AgentRegistrySummary} from '../../src/projectBrain/agentRouter.js';
import {detectBrainContextIntent} from '../../src/projectBrain/brainContextPlanner.js';

const registry: AgentRegistrySummary = {
  agents: [
    {name: 'frontend-agent', description: 'Builds React UI components and pages'},
    {name: 'backend-agent', description: 'Implements API endpoints and database migrations'},
    {name: 'test-agent', description: 'Writes Vitest and Playwright tests and coverage reports'},
  ],
  skills: [
    {name: 'code-review', description: 'Reviews code for security and quality', whenToUse: 'review'},
    {name: 'deploy', description: 'Deploys to Vercel or Docker', whenToUse: 'deploy'},
  ],
};

describe('agentRouter', () => {
  describe('createAgentRoutingPlan', () => {
    it('returns no-agent for short simple prompts', () => {
      const plan = createAgentRoutingPlan('Fix typo in README');
      expect(plan.executionMode).toBe('no-agent');
    });

    it('returns planned-subagents for large build prompts', () => {
      const prompt = 'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with analytics dashboard';
      const plan = createAgentRoutingPlan(prompt);
      expect(plan.executionMode).toBe('planned-subagents');
    });

    it('selects frontend agent for UI prompts', () => {
      const plan = routePromptToProjectAgents(
        'Create a React component for the dashboard page with Tailwind CSS',
        null,
        registry,
      );
      const names = plan.selectedAgents.map((a) => a.name);
      expect(names).toContain('frontend-agent');
    });

    it('selects backend agent for API prompts', () => {
      const plan = routePromptToProjectAgents(
        'Implement a REST API endpoint for user authentication with JWT and database',
        null,
        registry,
      );
      const names = plan.selectedAgents.map((a) => a.name);
      expect(names).toContain('backend-agent');
    });

    it('selects test agent for test prompts', () => {
      const plan = routePromptToProjectAgents(
        'Implement Vitest and Playwright tests for the complete authentication flow with full coverage reporting',
        null,
        registry,
      );
      const names = plan.selectedAgents.map((a) => a.name);
      expect(names).toContain('test-agent');
    });

    it('does not exceed maxAgents limit', () => {
      const plan = routePromptToProjectAgents(
        'Build a React frontend with a backend API, write tests, and deploy to Docker',
        null,
        registry,
        {maxAgents: 2},
      );
      expect(plan.selectedAgents.length).toBeLessThanOrEqual(2);
    });

    it('includes reason field', () => {
      const plan = createAgentRoutingPlan('Build a React frontend component');
      expect(typeof plan.reason).toBe('string');
      expect(plan.reason.length).toBeGreaterThan(0);
    });

    it('includes estimatedTokenCost', () => {
      const plan = createAgentRoutingPlan('Fix null pointer bug in login flow');
      expect(['low', 'medium', 'high']).toContain(plan.estimatedTokenCost);
    });
  });

  describe('selectProjectSkillsForPrompt', () => {
    it('returns empty array when no skills match', () => {
      const skills = selectProjectSkillsForPrompt('Fix a typo in docs', []);
      expect(skills).toEqual([]);
    });

    it('selects code-review skill for review prompt', () => {
      const skills = selectProjectSkillsForPrompt('Review this code for security vulnerabilities', registry.skills);
      expect(skills).toContain('code-review');
    });
  });

  describe('formatAgentRoutingPlan', () => {
    it('returns a non-empty string', () => {
      const plan = createAgentRoutingPlan('Build a React dashboard with Tailwind CSS and API integration');
      const text = formatAgentRoutingPlan(plan);
      expect(text.length).toBeGreaterThan(10);
    });

    it('does not expose secrets', () => {
      const plan = createAgentRoutingPlan('Fix bug with sk-abcdefghijklmnopqrstuvwxyz12345678 in module');
      const text = formatAgentRoutingPlan(plan);
      expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });

    it('includes execution mode in output', () => {
      const plan = createAgentRoutingPlan('Fix a small bug in login.ts');
      const text = formatAgentRoutingPlan(plan);
      expect(text).toContain(plan.executionMode);
    });
  });
});

// Re-export detectBrainContextIntent from agentRouter for unified testing
describe('detectBrainContextIntent (via agentRouter)', () => {
  it('detects continue intent', () => {
    expect(detectBrainContextIntent('continue where we left off')).toBe('continue');
  });

  it('detects app-build intent', () => {
    expect(detectBrainContextIntent(
      'build a complete multi-tenant SaaS application with billing, auth, and admin dashboard for enterprise customers as a product',
    )).toBe('app-build');
  });

  it('falls back to no-agent for very short prompts', () => {
    const plan = createAgentRoutingPlan('hi');
    expect(plan.executionMode).toBe('no-agent');
  });
});
