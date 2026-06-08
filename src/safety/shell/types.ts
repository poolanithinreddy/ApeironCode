export type ShellOperator = '&&' | '||' | ';' | '|';
export type ShellRedirect = '>' | '>>' | '<' | '2>' | '2>&1';

export interface ParsedShellCommand {
  raw: string;
  baseCommand: string;
  args: string[];
  envAssignments: Record<string, string>;
  chains: Array<{operator: ShellOperator; command: ParsedShellCommand}>;
  redirects: Array<{kind: ShellRedirect; target: string}>;
  subshells: string[];
  hasCommandSubstitution: boolean;
  hasNetworkCommand: boolean;
  hasPackageManager: boolean;
  hasDestructive: boolean;
  parseWarnings: string[];
}
