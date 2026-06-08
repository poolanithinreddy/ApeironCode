import {describe, expect, it} from 'vitest';

import {parsePermissionRule, parsePermissionRules, PermissionParseError} from '../../src/safety/permissionParser.js';

describe('Permission Parser', () => {
  describe('parsePermissionRule', () => {
    it('should parse Allow FileRead rule', () => {
      const rule = parsePermissionRule('Allow(FileRead(src/**))');
      expect(rule.effect).toBe('Allow');
      expect(rule.actionType).toBe('FileRead');
      expect(rule.pattern).toBe('src/**');
    });

    it('should parse Deny Bash rule', () => {
      const rule = parsePermissionRule('Deny(Bash(rm -rf *))');
      expect(rule.effect).toBe('Deny');
      expect(rule.actionType).toBe('Bash');
      expect(rule.pattern).toBe('rm -rf *');
    });

    it('should parse Tool rule with plugin tool', () => {
      const rule = parsePermissionRule('Allow(Tool(plugin:echo-plugin.echo))');
      expect(rule.effect).toBe('Allow');
      expect(rule.actionType).toBe('Tool');
      expect(rule.pattern).toBe('plugin:echo-plugin.echo');
    });

    it('should parse Tool rule with MCP tool', () => {
      const rule = parsePermissionRule('Deny(Tool(mcp:filesystem.delete))');
      expect(rule.effect).toBe('Deny');
      expect(rule.actionType).toBe('Tool');
      expect(rule.pattern).toBe('mcp:filesystem.delete');
    });

    it('should parse Network rule', () => {
      const rule = parsePermissionRule('Allow(Network(https://api.github.com/**))');
      expect(rule.effect).toBe('Allow');
      expect(rule.actionType).toBe('Network');
      expect(rule.pattern).toBe('https://api.github.com/**');
    });

    it('should throw on invalid format', () => {
      expect(() => {
        parsePermissionRule('InvalidFormat');
      }).toThrow(PermissionParseError);
    });

    it('should throw on unknown action type', () => {
      expect(() => {
        parsePermissionRule('Allow(UnknownAction(pattern))');
      }).toThrow(PermissionParseError);
    });

    it('should throw on empty pattern', () => {
      const fn = (): void => {
        parsePermissionRule('Allow(FileRead())');
      };
      expect(fn).toThrow(PermissionParseError);
    });

    it('should preserve original rule string', () => {
      const raw = 'Allow(FileRead(src/**))';
      const rule = parsePermissionRule(raw);
      expect(rule.raw).toBe(raw);
    });
  });

  describe('parsePermissionRules', () => {
    it('should parse multiple valid rules', () => {
      const {valid, errors} = parsePermissionRules([
        'Allow(FileRead(src/**/)) ',
        'Deny(Bash(rm -rf *))',
        'Allow(Tool(plugin:safe.**))',
      ]);

      expect(valid).toHaveLength(3);
      expect(errors).toHaveLength(0);
    });

    it('should collect parse errors', () => {
      const {valid, errors} = parsePermissionRules([
        'Allow(FileRead(src/**/)) ',
        'InvalidRule',
        'Deny(UnknownAction(*))',
        'Allow(Tool(plugin:echo))',
      ]);

      expect(valid).toHaveLength(2);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toBeDefined();
      if (errors[0]) {
        expect(errors[0].raw).toBe('InvalidRule');
      }
    });

    it('should handle empty input', () => {
      const {valid, errors} = parsePermissionRules([]);
      expect(valid).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });
  });
});
