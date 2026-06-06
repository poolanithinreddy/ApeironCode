# Validation

Use targeted validation first:
- npm run typecheck
- npm run lint
- targeted tests

Full validation only at the end:
- npm run build
- npm test
- npm run test:e2e
- npm run test:acceptance
- npm run check:file-size
- npm pack --dry-run

Do not paste long logs unless failure occurs.