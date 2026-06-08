# Mock Workflow

```bash
apeironcode config set provider mock
apeironcode config set model mock-coder
apeironcode doctor --provider
apeironcode --dangerously-skip-approvals "Read src/example.ts, replace \"value = 1\" with \"value = 2\", run tests, and summarize."
```