# Demo Recording

The README demo should be a real recording, not a mocked marketing animation.
Record this flow in a disposable copy of `examples/fix-failing-test/before`.

## Setup

```bash
npm ci
npm run build
npm link
cp -R examples/fix-failing-test/before /tmp/apeironcode-demo
cd /tmp/apeironcode-demo
npm install
apeironcode setup --provider mock
```

## Recording flow

1. Run `npm test` and show the failing assertion.
2. Run `apeironcode "fix the failing test"`.
3. Show the files ApeironCode reads.
4. Approve the proposed patch.
5. Approve `npm test`.
6. Show the passing test and compact summary.

Keep the recording under 30 seconds, crop it to the terminal, and do not show
tokens, home-directory paths, private repositories, or unrelated notifications.

Export the final GIF to:

```text
docs/assets/apeironcode-demo.gif
```

Then replace the text preview in the README with:

```markdown
![ApeironCode fixes a failing test with approval-gated edits](./docs/assets/apeironcode-demo.gif)
```
