# Expected Review

## High: Authentication token is written to logs

`session.js:2` interpolates the raw token into an error message. Logs are often
retained or exported, so this exposes a credential outside the process.

Remove the token from the message or replace it with a non-reversible,
short-lived identifier. Add a test that asserts the token is absent from
captured log output.
