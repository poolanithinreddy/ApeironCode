# Demo Checklist

Use mock/local flows unless a maintainer explicitly opts into real providers or GitHub writes.

- Run `npm run build`.
- Use a temporary HOME when proving mock-provider execution.
- Show `apeironcode team run "fix failing tests" --dry-run`.
- Show a real team run only with `provider=mock` and non-destructive fixtures.
- Show `apeironcode skill run explain-repo --input "summarize" --no-run`, then a mock-provider run if desired.
- Show `apeironcode memory suggestions`, then approve/reject a generated suggestion in a disposable demo workspace.
- Show `apeironcode github issue create --title "Demo" --body "Dry run" --dry-run`.
- Show `apeironcode workflow list` or a mock-provider workflow run.
- Do not publish, push, post GitHub writes, or require paid API keys.
