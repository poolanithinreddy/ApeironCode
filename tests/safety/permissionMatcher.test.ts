import {describe, expect, it} from 'vitest';

import {evaluatePermissionRules} from '../../src/safety/permissionMatcher.js';
import {parsePermissionRules} from '../../src/safety/permissionParser.js';

describe('Permission Matcher', () => {
  describe('evaluatePermissionRules', () => {
    it('should allow file read with matching Allow rule', () => {
      const {valid} = parsePermissionRules(['Allow(FileRead(src/**))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: 'src/main.ts',
      });
      expect(decision).toBe('allow');
    });

    it('should deny file read with Deny rule', () => {
      const {valid} = parsePermissionRules(['Deny(FileRead(.env))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: '.env',
      });
      expect(decision).toBe('deny');
    });

    it('should deny take precedence over allow', () => {
      const {valid} = parsePermissionRules([
        'Allow(FileRead(**/))',
        'Deny(FileRead(.env))',
      ]);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: '.env',
      });
      expect(decision).toBe('deny');
    });

    it('should ask when no rule matches', () => {
      const {valid} = parsePermissionRules(['Allow(FileRead(src/**/))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: 'dist/main.js',
      });
      expect(decision).toBe('ask');
    });

    it('should allow bash command with matching rule', () => {
      const {valid} = parsePermissionRules(['Allow(Bash(npm test))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Bash',
        resource: 'npm test',
      });
      expect(decision).toBe('allow');
    });

    it('should deny dangerous bash commands', () => {
      const {valid} = parsePermissionRules(['Deny(Bash(rm -rf *))', 'Allow(Bash(npm *))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Bash',
        resource: 'rm -rf /',
      });
      expect(decision).toBe('deny');
    });

    it('should allow tool with exact match', () => {
      const {valid} = parsePermissionRules(['Allow(Tool(plugin:echo-plugin.echo))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Tool',
        resource: 'plugin:echo-plugin.echo',
      });
      expect(decision).toBe('allow');
    });

    it('should allow tool with wildcard match', () => {
      const {valid} = parsePermissionRules(['Allow(Tool(plugin:echo-plugin.*))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Tool',
        resource: 'plugin:echo-plugin.uppercase',
      });
      expect(decision).toBe('allow');
    });

    it('should deny MCP tool', () => {
      const {valid} = parsePermissionRules(['Deny(Tool(mcp:filesystem.*))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Tool',
        resource: 'mcp:filesystem.delete',
      });
      expect(decision).toBe('deny');
    });

    it('should match network URLs', () => {
      const {valid} = parsePermissionRules(['Deny(Network(*.internal))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Network',
        resource: 'api.internal',
      });
      expect(decision).toBe('deny');
    });

    it('should allow network with Allow rule', () => {
      const {valid} = parsePermissionRules(['Allow(Network(https://api.github.com/**))']);
      const {decision} = evaluatePermissionRules(valid, {
        actionType: 'Network',
        resource: 'https://api.github.com/repos',
      });
      expect(decision).toBe('allow');
    });

    it('should return matched rule', () => {
      const {valid} = parsePermissionRules(['Allow(FileRead(src/**))']);
      const {matchedRule} = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: 'src/main.ts',
      });
      expect(matchedRule).toBeDefined();
      expect(matchedRule?.effect).toBe('Allow');
    });

    it('should handle sensitive paths', () => {
      const {valid} = parsePermissionRules([
        'Deny(FileRead(**/.env))',
        'Deny(FileRead(~/.ssh/**)) ',
      ]);

      const env = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: 'app/.env',
      });
      expect(env.decision).toBe('deny');

      const ssh = evaluatePermissionRules(valid, {
        actionType: 'FileRead',
        resource: '~/.ssh/id_rsa',
      });
      expect(ssh.decision).toBe('deny');
    });
  });
});
