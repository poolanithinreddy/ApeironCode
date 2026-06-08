# Demo: Live Cockpit

1. Build the CLI.

   ```bash
   npm run build
   ```

2. Create or reuse a disposable team run.

   ```bash
   node dist/cli/index.js team run "review demo fixture" --workspace temp-copy --dry-run
   ```

3. In the TUI, open the cockpit with a real team run id:

   ```text
   /team cockpit <teamRunId>
   ```

4. Navigate panes with arrow keys. Use `?` for help and `q` to close.

The demo uses local artifacts only. It does not require API keys and does not publish or post connector writes.
