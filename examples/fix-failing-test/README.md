# Fix A Failing Test

This example shows the smallest useful ApeironCode loop: inspect a failing
test, preview a patch, approve the edit, rerun tests, and summarize.

## Before

`before/src/math.js` has an off-by-one bug and `before/test/math.test.js`
captures the expected behavior.

```bash
cd before
npm test
apeironcode "fix the failing test"
```

## Expected interaction

1. ApeironCode reads the implementation and failing test.
2. It previews the one-line change.
3. You approve the file edit.
4. It asks before running `npm test`.
5. The test passes and the final summary names the changed file and command.

Compare the result with `after/`. A representative transcript is in
`expected-output.txt`; exact colors and IDs may vary.
