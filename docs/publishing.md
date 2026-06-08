# Publishing

## Local release checklist

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run test`.
4. Run `npm run build`.
5. Verify the binary locally with `node dist/cli/index.js --help`.
6. Verify one-shot mode with `node dist/cli/index.js "explain this repo"`.

## npm publishing notes

The package is configured for global install with:

```json
{
  "name": "apeironcode-agent",
  "bin": {
    "apeironcode": "./dist/cli/index.js"
  }
}
```

Publish flow:

1. Bump the version in `package.json`.
2. Build the package.
3. Confirm `dist/` contains the CLI bundle.
4. Run `npm publish` from a trusted environment.

The CI workflow already validates install, typecheck, test, and build on Node 18, 20, and 22.