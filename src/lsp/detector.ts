import {execa} from 'execa';
import type {LspDetectionResult, LspLanguageSupport} from './types.js';

const SUPPORTED_LANGUAGES: LspLanguageSupport[] = [
  {
    language: 'TypeScript',
    fileExtensions: ['.ts', '.tsx'],
    launchArgs: ['--stdio'],
    serverName: 'typescript-language-server',
    serverCommands: ['typescript-language-server', 'node_modules/.bin/typescript-language-server'],
    version: undefined,
  },
  {
    language: 'JavaScript',
    fileExtensions: ['.js', '.jsx', '.mjs', '.cjs'],
    launchArgs: ['--stdio'],
    serverName: 'typescript-language-server',
    serverCommands: ['typescript-language-server', 'node_modules/.bin/typescript-language-server'],
    version: undefined,
  },
  {
    language: 'Python',
    fileExtensions: ['.py'],
    launchArgs: ['--stdio'],
    serverName: 'pyright-langserver',
    serverCommands: ['pyright-langserver', 'python -m pyright'],
    version: undefined,
  },
  {
    language: 'Go',
    fileExtensions: ['.go'],
    launchArgs: ['serve'],
    serverName: 'gopls',
    serverCommands: ['gopls'],
    version: undefined,
  },
  {
    language: 'Rust',
    fileExtensions: ['.rs'],
    serverName: 'rust-analyzer',
    serverCommands: ['rust-analyzer'],
    version: undefined,
  },
  {
    language: 'Java',
    fileExtensions: ['.java'],
    serverName: 'jdtls',
    serverCommands: ['jdtls'],
    version: undefined,
  },
];

const getCommandVersion = async (command: string, args: string[] = ['--version']): Promise<string | null> => {
  try {
    const {stdout, stderr} = await execa(command, args, {reject: false, timeout: 5000});
    const output = stdout || stderr;
    if (output) {
      const match = output.match(/(\d+\.\d+\.\d+|\d+\.\d+)/);
      return match?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
};

const checkCommandAvailable = async (command: string): Promise<boolean> => {
  try {
    const {exitCode} = await execa(command, ['--version'], {reject: false, timeout: 5000});
    return exitCode === 0;
  } catch {
    return false;
  }
};

const findAvailableCommand = async (
  commands: string[],
): Promise<{command: string; version: string | null} | null> => {
  for (const cmd of commands) {
    if (await checkCommandAvailable(cmd)) {
      const version = await getCommandVersion(cmd);
      return {command: cmd, version};
    }
  }
  return null;
};

const getInstallHint = (serverName: string, language: string): string => {
  const hints: Record<string, string> = {
    'typescript-language-server': `npm install -g typescript-language-server typescript`,
    'pyright-langserver': `pip install pyright`,
    'gopls': `go install github.com/golang/tools/gopls@latest`,
    'rust-analyzer': `curl -L https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz | gunzip -c - > ~/.cargo/bin/rust-analyzer && chmod +x ~/.cargo/bin/rust-analyzer`,
    'jdtls': `Requires manual Eclipse JDTLS installation`,
  };

  return hints[serverName] ?? `Install ${serverName} for ${language} support`;
};

export class LspDetector {
  private cache: Map<string, LspDetectionResult> = new Map();

  async detectLanguage(language: string): Promise<LspDetectionResult> {
    if (this.cache.has(language)) {
      return this.cache.get(language)!;
    }

    const support = SUPPORTED_LANGUAGES.find((s) => s.language === language);

    if (!support) {
      const result: LspDetectionResult = {
        language,
        status: 'unsupported',
        installed: false,
        workspaceApplicable: false,
        reason: `${language} is not in the list of supported languages for LSP`,
      };
      this.cache.set(language, result);
      return result;
    }

    const available = await findAvailableCommand(support.serverCommands);

    if (available) {
      const result: LspDetectionResult = {
        language,
        status: 'available',
        serverArgs: support.launchArgs,
        serverName: support.serverName,
        serverCommand: available.command,
        version: available.version ?? undefined,
        installed: true,
        workspaceApplicable: true,
      };
      this.cache.set(language, result);
      return result;
    }

    const result: LspDetectionResult = {
      language,
      status: 'missing',
      serverArgs: support.launchArgs,
      serverName: support.serverName,
      installed: false,
      workspaceApplicable: false,
      installHint: getInstallHint(support.serverName, language),
      reason: `${support.serverName} is not installed`,
    };
    this.cache.set(language, result);
    return result;
  }

  async detectAll(): Promise<LspDetectionResult[]> {
    return Promise.all(
      SUPPORTED_LANGUAGES.map((lang) => this.detectLanguage(lang.language)),
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}
