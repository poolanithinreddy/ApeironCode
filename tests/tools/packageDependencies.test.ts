import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const pkg = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
) as PackageJson;

const allDeps = {...pkg.dependencies, ...pkg.devDependencies};

describe('declared package dependencies for provider schema + signing', () => {
  it('declares zod-to-json-schema used by the production converter', () => {
    expect(pkg.dependencies).toHaveProperty('zod-to-json-schema');
  });

  it('declares the json-schema types imported by tool schema code', () => {
    // `import type {JSONSchema7} from 'json-schema'` resolves to @types/json-schema.
    expect(allDeps).toHaveProperty('@types/json-schema');
  });

  it('declares the maintained AWS SigV4 signer used by the Bedrock provider', () => {
    expect(pkg.dependencies).toHaveProperty('aws4');
    expect(allDeps).toHaveProperty('@types/aws4');
  });
});
