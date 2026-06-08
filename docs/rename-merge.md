# Rename-Aware Merge

ApeironCode Agent records a base snapshot for each isolated subagent workspace. Phase 15 extends merge planning with conservative rename detection.

Rename detection uses:

- exact hash matching between a deleted source and added target
- fallback text similarity for moved text files

Merge plans now report:

- clean renames
- renames with content changes
- rename-source conflicts when the original path changed in main
- rename-target conflicts when the target path already exists or changed in main

Apply remains approval-gated:

```bash
apeironcode team merge-plan <teamRunId>
apeironcode team conflicts <teamRunId>
apeironcode team apply <teamRunId>
```

Limitations:

- Detection is heuristic unless a future git-backed rename parser is added.
- It is not a semantic refactor engine.
- It does not implement parallel editing or automatic conflict resolution.
