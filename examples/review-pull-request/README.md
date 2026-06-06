# Review A Pull Request

This example demonstrates a review-only workflow. The proposed change in
`before/session.js` logs a raw token when authentication fails. The safer
version is shown in `after/session.js`.

```bash
apeironcode --mode review "review examples/review-pull-request/change.diff"
```

The expected review leads with the secret-leak risk, cites the affected line,
and recommends redaction without modifying the file. See
`expected-output.md`.
