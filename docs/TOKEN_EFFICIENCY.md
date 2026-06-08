# Token Efficiency 2.0

ApeironCode optimizes for outcome per token, not just smaller prompts.

## Pipeline

1. Context is ranked, compressed, and optionally sent as a delta on later turns.
2. Relevant memory is selected by task type and capped by a hard budget.
3. Prompt segments are deduped and trimmed with required safety/task sections preserved.
4. Tool exposure is narrowed to the minimum useful set for the task.
5. Tool schemas are minified before provider requests when safe.
6. Tool outputs are compressed before being fed back into the model.
7. A token ledger records where estimated tokens were spent and where savings came from.

## Token Ledger

The ledger tracks estimated tokens for:
- system prompt
- user prompt
- conversation history
- selected context
- selected memory
- tool schemas
- tool results
- model output

It also records estimated savings from:
- prompt/history/context compression
- memory compaction
- schema minification

## Provider Budgets

Budgets are model-aware and conservative by default.

Each profile reserves space for:
- model output
- context
- history
- memory
- tool schemas

Unknown models fall back to a safe local profile instead of assuming a large context window.

## Prompt Optimization

Prompt optimization never drops:
- safety constraints
- current task instructions
- the current user prompt
- required workflow guidance

Optional context and repeated memory are trimmed first.

## Context Delta

On the first turn ApeironCode sends full selected context.
On later turns it may send a delta when:
- the task is materially the same
- the context fingerprint is mostly unchanged
- there is no mode switch that makes a full resend safer

## Memory Budget

Memory stays compact:
- simple explain prompts get minimal high-confidence facts
- debug and test-fix prompts get bug, fix, and command memory
- superseded and deprecated facts are excluded by default

## Tool Compression

Compression preserves:
- failing test names
- assertion messages
- top stack frames
- file paths and line references
- command tails and exit details

Compression drops:
- repeated progress output
- install noise
- huge JSON blobs
- repetitive success lines

## Debugging

Token-related runtime events include:
- `token.prompt_optimized`
- `token.history_compacted`
- `token.context_delta_used`
- `token.memory_budget_applied`
- `token.schema_minified`
- `token.tool_output_compressed`
- `token.ledger_updated`

## Known Limitations

- Estimates are heuristic and do not call provider tokenizers.
- Context delta currently works at selected-context granularity, not AST granularity.
- CLI token inspection is still lighter than the internal event stream.

## Compaction Explanation (Phase 16B.1)

Use `apeironcode debug compression` to render the compaction explanation
formatter (`src/context/compactionExplain.ts`). It reports which items
were preserved, summarized, or omitted, the tokens saved, and any warning
when items were dropped. With no active compaction the command prints a
safe zero-state placeholder. The formatter never includes raw item
content, only item identifiers.
