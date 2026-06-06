# Demo Recording

The README demo is based on a real no-key run in a disposable copy of
`examples/fix-failing-test/before`.

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

Save a sanitized terminal transcript to:

```text
docs/assets/apeironcode-demo.txt
```

Render the README asset with Pillow available on `PYTHONPATH`:

```bash
PYTHONPATH=/path/to/pillow python3 scripts/render-terminal-gif.py \
  docs/assets/apeironcode-demo.txt \
  docs/assets/apeironcode-demo.gif
```

The renderer produces a 26-second looping GIF and does not require a project
runtime dependency.
