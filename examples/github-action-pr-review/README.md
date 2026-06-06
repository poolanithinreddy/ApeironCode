# GitHub Action PR Review

This example runs ApeironCode on pull requests in dry-run mode. Dry-run is the
default and performs no GitHub writes.

## Install

Copy `apeironcode-review.yml` to:

```text
.github/workflows/apeironcode-review.yml
```

The workflow checks out the pull request and invokes the action with read-only
repository access. Keep `dry_run: true` until you have reviewed the output and
configured narrow automation permissions.

Use a release tag instead of `main` after the first release is published.
Representative output is shown in `expected-output.json`.
