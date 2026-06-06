import {describe, expect, it} from 'vitest';
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  extractSymbolsFromText,
  extractSymbolsFromFiles,
  findSymbolsByName,
} from '../../src/context/symbols.js';

describe('extractSymbolsFromText (TS)', () => {
  it('captures exported function/class/type/interface and arrow components', () => {
    const code = `
export function add(a: number, b: number): number { return a + b; }
export class UserService {
  fetchUser(id: string) { return id; }
}
export interface User { id: string }
export type Id = string;
export const Button = (props: {label: string}) => <button>{props.label}</button>;
const helper = () => 1;
describe('group', () => {
  it('does a thing', () => {});
});
`;
    const syms = extractSymbolsFromText('src/x.tsx', code);
    expect(syms.find((s) => s.name === 'add' && s.kind === 'function' && s.exported)).toBeTruthy();
    expect(syms.find((s) => s.name === 'UserService' && s.kind === 'class')).toBeTruthy();
    expect(syms.find((s) => s.name === 'fetchUser' && s.kind === 'method')).toBeTruthy();
    expect(syms.find((s) => s.name === 'User' && s.kind === 'interface')).toBeTruthy();
    expect(syms.find((s) => s.name === 'Id' && s.kind === 'type')).toBeTruthy();
    expect(syms.find((s) => s.name === 'Button' && s.kind === 'component')).toBeTruthy();
    expect(syms.find((s) => s.name === 'helper' && !s.exported)).toBeTruthy();
    expect(syms.find((s) => s.kind === 'test')).toBeTruthy();
  });

  it('returns [] for binary-like extensions', () => {
    expect(extractSymbolsFromText('logo.png', 'binary content')).toEqual([]);
  });

  it('does not crash on malformed input', () => {
    expect(() => extractSymbolsFromText('bad.ts', 'export function (')).not.toThrow();
  });

  it('skips huge files', () => {
    const huge = 'export function f() {}\n'.repeat(200_000);
    expect(extractSymbolsFromText('big.ts', huge)).toEqual([]);
  });
});

describe('extractSymbolsFromText (Python)', () => {
  it('captures def, async def, class', () => {
    const code = `
class Greeter:
    def hello(self):
        return 'hi'

async def fetch():
    pass

def _private():
    pass
`;
    const syms = extractSymbolsFromText('app.py', code);
    expect(syms.find((s) => s.name === 'Greeter' && s.kind === 'class' && s.exported)).toBeTruthy();
    expect(syms.find((s) => s.name === 'hello' && s.kind === 'method')).toBeTruthy();
    expect(syms.find((s) => s.name === 'fetch' && s.kind === 'function')).toBeTruthy();
    expect(syms.find((s) => s.name === '_private' && !s.exported)).toBeTruthy();
  });
});

describe('extractSymbolsFromText (Go)', () => {
  it('captures func and type struct/interface', () => {
    const code = `
package main

func Hello() string { return "" }

func (u *User) Save() error { return nil }

type User struct { Name string }

type Reader interface { Read() string }
`;
    const syms = extractSymbolsFromText('main.go', code);
    expect(syms.find((s) => s.name === 'Hello' && s.kind === 'function' && s.exported)).toBeTruthy();
    expect(syms.find((s) => s.name === 'User' && s.kind === 'type')).toBeTruthy();
    expect(syms.find((s) => s.name === 'Reader' && s.kind === 'interface')).toBeTruthy();
  });
});

describe('extractSymbolsFromText (Java)', () => {
  it('captures class/interface and methods', () => {
    const code = `
public class Greeter {
    public String hello() { return ""; }
    private int counter() { return 1; }
}

public interface Repo {}
`;
    const syms = extractSymbolsFromText('Greeter.java', code);
    expect(syms.find((s) => s.name === 'Greeter' && s.kind === 'class' && s.exported)).toBeTruthy();
    expect(syms.find((s) => s.name === 'Repo' && s.kind === 'interface')).toBeTruthy();
    expect(syms.find((s) => s.name === 'hello' && s.kind === 'method' && s.exported)).toBeTruthy();
    expect(syms.find((s) => s.name === 'counter' && !s.exported)).toBeTruthy();
  });
});

describe('extractSymbolsFromFiles + findSymbolsByName', () => {
  it('reads files and supports name search', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oc-syms-'));
    mkdirSync(path.join(dir, 'src'), {recursive: true});
    writeFileSync(path.join(dir, 'src', 'a.ts'), 'export function alpha() { return 1; }\n');
    writeFileSync(path.join(dir, 'src', 'b.ts'), 'export const Beta = () => 2;\n');
    const syms = await extractSymbolsFromFiles(['src/a.ts', 'src/b.ts'], dir);
    expect(syms).toHaveLength(2);
    const found = findSymbolsByName(syms, 'alpha');
    expect(found[0]?.name).toBe('alpha');
    expect(findSymbolsByName(syms, 'BET')[0]?.name).toBe('Beta');
    expect(findSymbolsByName(syms, '')).toEqual([]);
  });

  it('ignores files that do not exist', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oc-syms-'));
    const syms = await extractSymbolsFromFiles(['missing.ts'], dir);
    expect(syms).toEqual([]);
  });
});
