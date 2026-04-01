# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-01
**Commit:** 8f76780
**Branch:** main

## OVERVIEW

Git repo sync tool (CLI + library). TypeScript, Bun runtime, tsup bundler, commander for CLI. Automates commit → pull → merge → push with configurable conflict resolution.

## STRUCTURE

```
.
├── src/
│   ├── index.ts    # Public API — re-exports from sync + git + types
│   ├── cli.ts      # CLI entry (commander) — validates opts, calls syncRepo/getRepoStatus
│   ├── sync.ts     # Orchestration layer — syncRepo, getRepoStatus, getRepoInfo
│   ├── git.ts      # Low-level git operations via child_process spawn
│   └── types.ts    # All interfaces, type aliases, error pattern constants
├── test/
│   ├── helpers.ts       # Test fixtures — temp dirs, bare remotes, git config
│   ├── intermediate/    # Temp dir for test repos (gitignored)
│   ├── sync.test.ts     # Sync orchestration tests
│   ├── git.test.ts      # Low-level git command tests
│   └── cli.test.ts      # CLI argument parsing tests
├── tsup.config.ts       # Dual entry: index.ts (lib) + cli.ts (bin), ESM+CJS
└── tsconfig.json        # Strict mode, ES2022, bundler moduleResolution
```

## WHERE TO LOOK

| Task | File | Key |
|------|------|-----|
| Add new sync step | `src/sync.ts` → `syncRepo()` | Edit the retry loop (L55-96) |
| Add git operation | `src/git.ts` | Export from git.ts + re-export in index.ts |
| Change CLI option | `src/cli.ts` | Commander `.option()` + `validXxx` array |
| Add type/interface | `src/types.ts` | Export from types.ts + re-export in index.ts |
| Add error pattern | `src/types.ts` | Append to `NETWORK_ERROR_PATTERNS` / `REMOTE_AHEAD_PATTERNS` / `MERGE_CONFLICT_PATTERNS` |
| Change conflict resolution | `src/git.ts` | `resolveMergeConflict()` (L185) + `resolveRebaseConflict()` (L217) |
| Test setup fixtures | `test/helpers.ts` | `setupRepoWithRemote()`, `createBareRemote()`, `makeCommit()` |

## CODE MAP

| Symbol | Type | File | Role |
|--------|------|------|------|
| `syncRepo` | fn | sync.ts:19 | Main sync orchestration — commit→pull→merge→push with retry |
| `getRepoStatus` | fn | sync.ts:107 | Read-only status check (synced/uncommitted/unpushed/error) |
| `getRepoInfo` | fn | sync.ts:147 | Detailed repo info (branch, remote, commits, dirty state) |
| `runGitCommand` | fn | git.ts:16 | Core git subprocess runner via `spawn` |
| `pullFromRemote` | fn | git.ts:123 | Dispatches to rebase/merge/ff-only based on mergeMode |
| `pushToRemote` | fn | git.ts:243 | Push with network-error retry (3 attempts) |
| `commitChanges` | fn | git.ts:107 | `git add -A` + `git commit -m` |
| `resolveMergeConflict` | fn | git.ts:185 | Handles conflict: abort / checkout --ours / checkout --theirs |
| `resolveRebaseConflict` | fn | git.ts:217 | Handles rebase conflict: abort / add+rebase --continue |
| `SyncOptions` | iface | types.ts:1 | Input: localPath, conflictResolution, mergeMode, commitMessage |
| `SyncResult` | iface | types.ts:12 | Output: success, branch, remoteUrl, error, lastSyncTime |

## CONVENTIONS

- **Import style**: `import { X } from './module.ts'` — always includes `.ts` extension (Bun native)
- **Error patterns**: Defined as `readonly string[]` constants in types.ts, checked via `.some()` + `.includes()`
- **Result types**: Every operation returns a typed result object (`{ success, error?, ... }`) — never throws
- **Retry logic**: `MAX_GIT_RETRIES=3` for push (network errors), `MAX_MERGE_RETRIES=3` for pull→push cycle (remote ahead)
- **Conflict resolution flow**: `conflictResolution='local'` triggers `pushToRemote(branch, true)` (force push) after resolving conflict as ours
- **Build**: tsup dual-entry — `src/index.ts` → library, `src/cli.ts` → CLI bin. Both ESM + CJS.

## COMMANDS

```bash
bun install          # Install deps
bun test             # Run tests (bun:test)
bun run build        # tsup build → dist/
bun run typecheck    # tsc --noEmit
bun run release:dry  # build + npm publish --dry-run
```

## NOTES

- `pushToRemote` uses `'remote_ahead'` as a sentinel error string — `syncRepo` checks this specifically to trigger retry (L85)
- `commitChanges` treats "nothing to commit" stderr as success (L115)
- Tests create real git repos in `test/intermediate/` via `spawnSync` — no mocking
- **Rebase --ours/--theirs inversion**: During rebase, `--ours` = upstream (remote), `--theirs` = local branch — opposite of merge. `resolveRebaseConflict` (L232-237) swaps the checkout direction accordingly
- `cli.ts` imports directly from `sync.ts`, not from `index.ts` barrel — internal consumer bypasses public API
