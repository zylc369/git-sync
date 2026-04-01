# git-sync

Git repository sync tool — commit, pull, merge, push with conflict resolution. Works as both CLI and library.

## Sync Flow

1. Commit uncommitted local changes
2. Pull remote changes
3. Merge — if conflict, handle per `conflictResolution` option
4. Push local commits — if remote is ahead, retry from step 2 (max 3 retries)
5. Record success

## Install

```bash
bun add git-sync
npm install git-sync
```

## CLI Usage

```bash
# Basic sync
bunx git-sync /path/to/repo

# With options
bunx git-sync /path/to/repo --conflict-resolution local --merge-mode rebase

# Custom commit message
bunx git-sync /path/to/repo --commit-message "deploy: production release"

# Check status only (no sync)
bunx git-sync /path/to/repo --status
```

### CLI Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--conflict-resolution` | `abort`, `local`, `remote` | `abort` | How to handle merge conflicts |
| `--merge-mode` | `no-rebase`, `rebase`, `fast-forward` | `no-rebase` | Git merge strategy |
| `--commit-message` | string | auto-generated | Custom commit message |
| `--status` | flag | off | Show repo status only |

## Library Usage

```typescript
import { syncRepo, getRepoStatus } from 'git-sync';

// Sync a repository
const result = await syncRepo({
  localPath: '/path/to/my/repo',
  conflictResolution: 'local',
  mergeMode: 'rebase',
  commitMessage: 'chore: auto sync',
});

if (result.success) {
  console.log(`Synced ${result.branch} at ${result.lastSyncTime}`);
} else {
  console.error(`Failed: ${result.error}`);
}

// Check status
const status = await getRepoStatus('/path/to/my/repo');
console.log(status.status); // 'synced' | 'uncommitted' | 'unpushed' | 'error'
```

## API

### `syncRepo(options: SyncOptions): Promise<SyncResult>`

Main sync function. Commits, pulls, merges, and pushes a repository.

### `getRepoStatus(localPath: string): Promise<RepoStatusResult>`

Returns current repo status without modifying anything.

### `getRepoInfo(localPath: string): Promise<RepoInfo | null>`

Returns detailed repo information (branch, remote, commits, dirty state).

### Low-level functions

Also exported for advanced usage: `runGitCommand`, `getCurrentBranch`, `getRemoteUrl`, `validateRepo`, `hasUncommittedChanges`, `hasUnpushedCommits`, `getRecentCommits`, `commitChanges`, `pullFromRemote`, `pushToRemote`, `sleep`, `isGitNetworkError`, `isRemoteAheadError`, `hasGitMergeConflict`.

## Development

```bash
bun install
bun test
bun run build
bun run release:dry
```

## License

Apache-2.0
