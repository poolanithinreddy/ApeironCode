import {runCli} from './bootstrap.js';

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error
    ? reason.stack ?? reason.message
    : String(reason);
  process.stderr.write(`\nFatal error: ${message}\n`);
  process.exitCode = 1;
});

// NOTE: do not use a top-level `await runCli()` here. A top-level await that
// stays pending while the event loop drains makes Node print
// "Warning: Detected unsettled top-level await". Direct commands (setup,
// doctor, --help, --version, provider list, ...) resolve and let the process
// exit naturally; interactive mode keeps the loop alive via Ink's
// waitUntilExit until the user quits.
runCli().then(
  () => {
    // Direct command finished: let the process exit naturally once the
    // event loop is empty. Interactive Ink sessions keep the loop alive.
  },
  (reason) => {
    const message = reason instanceof Error
      ? reason.stack ?? reason.message
      : String(reason);
    process.stderr.write(`\nFatal error: ${message}\n`);
    process.exitCode = 1;
  },
);