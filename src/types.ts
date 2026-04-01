export interface SyncOptions {
  /** Local repository path (required) */
  localPath: string;
  /** How to handle merge conflicts (default: 'abort') */
  conflictResolution?: 'abort' | 'local' | 'remote';
  /** Merge strategy (default: 'no-rebase') */
  mergeMode?: 'rebase' | 'no-rebase' | 'fast-forward';
  /** Custom commit message (default: auto-generated with timestamp) */
  commitMessage?: string;
}

export interface SyncResult {
  success: boolean;
  localPath: string;
  remoteUrl: string;
  branch: string;
  error?: string;
  lastSyncTime?: string;
}

export type RepoStatus = 'uncommitted' | 'unpushed' | 'synced' | 'error';

export interface RepoStatusResult {
  localPath: string;
  status: RepoStatus;
  branch: string | null;
  remoteUrl: string | null;
  error?: string;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface RepoInfo {
  localPath: string;
  remoteUrl: string;
  branch: string;
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
  recentCommits: CommitInfo[];
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ValidateResult =
  | { valid: true; remoteUrl: string; branch: string }
  | { valid: false; error: string };

export interface PullResult {
  success: boolean;
  hadConflict: boolean;
  error?: string;
}

export interface PushResult {
  success: boolean;
  error?: string;
  errorCode?: PushErrorCode;
}

export type PushErrorCode = 'remote_ahead' | 'network_error';

export interface CommitResult {
  success: boolean;
  error?: string;
}

export const MAX_GIT_RETRIES = 3;
export const MAX_MERGE_RETRIES = 3;

export const NETWORK_ERROR_PATTERNS: readonly string[] = [
  'GnuTLS',
  'TLS',
  'SSL',
  'certificate',
  'RPC failed',
  'early EOF',
  'Connection timed out',
  'Could not resolve host',
  'Network is unreachable',
  'fetch-pack: unexpected disconnect',
];

export const REMOTE_AHEAD_PATTERNS: readonly string[] = [
  'Updates were rejected because the remote contains work that you do',
  'Updates were rejected because the tip of your current branch is behind',
  'failed to push some refs',
  'non-fast-forward',
];

export const MERGE_CONFLICT_PATTERNS: readonly string[] = [
  'CONFLICT',
  'Merge conflict',
  'Automatic merge failed',
  'conflict in',
];
