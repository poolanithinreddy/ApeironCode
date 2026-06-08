# Demo: Git Worktree Teams

Dry-run mode is safe in any workspace:

```bash
npm run build
npm run demo:worktree
```

To prove real worktree execution, use a disposable git repository:

```bash
mkdir -p /tmp/apeironcode-worktree-demo
cd /tmp/apeironcode-worktree-demo
git init
git config user.email apeironcode@example.test
git config user.name "ApeironCode Demo"
printf '{"type":"module","scripts":{"test":"node test.js"}}\n' > package.json
printf 'export const value = 1;\n' > index.js
printf 'import {value} from "./index.js"; if (value !== 1) throw new Error("bad");\n' > test.js
git add .
git commit -m initial
/path/to/apeironcode/dist/cli/index.js team run "explain repo" --workspace git-worktree
/path/to/apeironcode/dist/cli/index.js team workspaces
```

Do not use worktree mode on a dirty repository unless you have reviewed the state and are comfortable cleaning it first.
