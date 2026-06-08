# GitHub Connector

The GitHub connector uses `GITHUB_TOKEN` or `GH_TOKEN` from the environment. It does not store tokens.

Commands:

```bash
apeironcode github status
apeironcode github repo
apeironcode github issues
apeironcode github issue 123
apeironcode github prs
apeironcode github pr 123
apeironcode github pr summary 123
apeironcode github pr review 123
apeironcode github pr review 123 --dry-run
apeironcode github pr review 123 --post
apeironcode github pr comment 123 "Looks good from local review" --dry-run
apeironcode github issue comment 123 "I can reproduce this" --dry-run
apeironcode github issue create --title "Bug" --body "Steps to reproduce" --dry-run
apeironcode github pr create --title "Fix bug" --body "Summary" --base main --head fix-branch --dry-run
apeironcode github actions
apeironcode github actions 123456789
apeironcode github ci explain
apeironcode github ci explain 123456789
apeironcode github parse-command "@apeironcode review"
apeironcode github automate issue 123 --dry-run
apeironcode github automate pr-review 123 --dry-run
apeironcode github automate fix-ci 123 --dry-run
apeironcode github action simulate '{"comment":{"body":"@apeironcode review"},"issue":{"number":1,"pull_request":{}}}'
```

Current status:

- Read commands are wired through the GitHub REST API.
- Tests use mocked `fetch`; no network or paid token is required.
- `pr review` creates a local review report.
- `pr summary` fetches PR metadata and changed files, then reports branch, changed-file, and line-count context.
- `pr review --dry-run` prints the generated review locally. `--post` requests approval-gated posting as a PR comment.
- `github actions` lists recent workflow runs. `github actions <runId>` and `github ci explain <runId>` summarize failed jobs and failing steps when the API returns them.
- PR and issue comments create a redacted preview first and post only when config approval mode is trusted or bypassed. Use `--dry-run` for preview-only automation.
- Issue and PR creation support redacted `--dry-run` previews without a token, and require env-token plus trusted/bypass approval mode before posting.
- Tokens are read from `GITHUB_TOKEN` or `GH_TOKEN` and are never printed.
- Automation workflows are dry-run by default. Non-dry-run writes require `APEIRONCODE_AUTOMATION=1` plus the narrow action flag, such as `APEIRONCODE_AUTOMATION_REVIEW=1`, `APEIRONCODE_AUTOMATION_COMMENT=1`, `APEIRONCODE_AUTOMATION_COMMIT=1`, or `APEIRONCODE_AUTOMATION_PR_CREATE=1`.
- Automation can also be constrained with `APEIRONCODE_AUTOMATION_REPOS`, `APEIRONCODE_AUTOMATION_ACTORS`, and `APEIRONCODE_AUTOMATION_DENY_ACTORS`. Explicit denies win.
- The matching `OPENCODE_AUTOMATION*` variables remain as deprecated legacy aliases; prefer the `APEIRONCODE_*` names.
- Fork PRs are forced into dry-run/comment-only behavior by the GitHub Action runner. Protected base branches are not pushed directly.
- Action comments include an ApeironCode run marker so replayed or duplicate events can be skipped safely.
- Mention commands support `@apeironcode implement`, `@apeironcode review`, `@apeironcode fix-tests`, `@apeironcode explain`, and `@apeironcode apply-suggestion`. Unknown commands are rejected with a safe help response.
- The packaged GitHub Action supports `issue_comment`, `pull_request_review_comment`, `pull_request`, `workflow_run`, and `check_suite` style payloads. Keep `dry_run: true` until repository permissions and provider secrets are deliberately configured.
- PR review automation prepares inline comments with severity labels (`blocking`, `suggestion`, `nit`, `question`), suppresses duplicate bodies, caps inline comments, and falls back to a summary when an exact diff position is unavailable.
- CI-fix automation now includes check-run annotations in the compressed failure context when the API provides them. It preserves failing paths, lines, assertion text, and stack-like details while dropping repetitive log noise.
- Slash GitHub creation currently provides safe previews; posting is CLI-only. Slash PR summary/review and Actions/CI reads use the same env-token model.

Limitations:

- Tests mock GitHub API responses; CI does not require network.
- CI explanation and CI-fix use check-run metadata/output and annotations when available. Full workflow artifacts and complete job-log ingestion are still partial and mocked in default tests.
- Posting remains approval-gated and intentionally unavailable from slash commands.
