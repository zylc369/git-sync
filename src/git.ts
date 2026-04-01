import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  type GitCommandResult,
  type ValidateResult,
  type PullResult,
  type PushResult,
  type PushErrorCode,
  type CommitResult,
  type CommitInfo,
  MAX_GIT_RETRIES,
  NETWORK_ERROR_PATTERNS,
  REMOTE_AHEAD_PATTERNS,
  MERGE_CONFLICT_PATTERNS,
} from './types.ts';

export function runGitCommand(args: string[], cwd?: string): Promise<GitCommandResult> {
  const gitCwd = cwd ?? process.cwd();
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: gitCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_EDITOR: 'true',
        GIT_SEQUENCE_EDITOR: 'true',
        GIT_MERGE_AUTOEDIT: 'no',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export async function getCurrentBranch(cwd?: string): Promise<string> {
  const result = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return result.stdout.trim();
}

export async function getRemoteUrl(cwd?: string): Promise<string> {
  const result = await runGitCommand(['remote', 'get-url', 'origin'], cwd);
  return result.stdout.trim();
}

export async function validateRepo(localPath: string): Promise<ValidateResult> {
  if (!existsSync(localPath)) {
    return { valid: false, error: 'Path does not exist' };
  }
  const branch = await getCurrentBranch(localPath);
  if (!branch) {
    return { valid: false, error: 'Not in git branch' };
  }
  const remoteUrl = await getRemoteUrl(localPath);
  if (!remoteUrl) {
    return { valid: false, error: 'No remote configured' };
  }
  return { valid: true, remoteUrl, branch };
}

export async function hasUncommittedChanges(cwd?: string): Promise<boolean> {
  const result = await runGitCommand(['status', '--porcelain'], cwd);
  if (result.exitCode !== 0) return false;
  return result.stdout.trim().length > 0;
}

export async function hasUnpushedCommits(branch: string, cwd?: string): Promise<boolean> {
  const result = await runGitCommand(['log', `origin/${branch}..HEAD`], cwd);
  if (result.exitCode !== 0) return false;
  return result.stdout.trim().length > 0;
}

export async function getRecentCommits(count: number = 10, cwd?: string): Promise<CommitInfo[]> {
  const result = await runGitCommand(
    ['log', '--pretty=format:%h|%s|%an|%ad', '-n', String(count)],
    cwd,
  );
  if (result.exitCode !== 0) {
    return [];
  }
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');
      return {
        hash: parts[0] ?? '',
        message: parts[1] ?? '',
        author: parts[2] ?? '',
        date: parts[3] ?? '',
      };
    });
}

export async function commitChanges(message: string, cwd?: string): Promise<CommitResult> {
  const addResult = await runGitCommand(['add', '-A'], cwd);
  if (addResult.exitCode !== 0) {
    return { success: false, error: addResult.stderr };
  }
  const commitResult = await runGitCommand(['commit', '-m', message], cwd);
  if (commitResult.exitCode !== 0) {
    const stderr = commitResult.stderr || '';
    if (stderr.includes('nothing to commit')) {
      return { success: true };
    }
    return { success: false, error: stderr };
  }
  return { success: true };
}

export async function pullFromRemote(
  branch: string,
  options: { mergeMode: string; conflictResolution: string },
  cwd?: string,
): Promise<PullResult> {
  if (options.mergeMode === 'rebase') {
    return pullWithRebase(branch, options.conflictResolution, cwd);
  }
  if (options.mergeMode === 'fast-forward') {
    return pullFastForwardOnly(branch, options.conflictResolution, cwd);
  }
  return pullWithMerge(branch, options.conflictResolution, cwd);
}

async function pullWithMerge(
  branch: string,
  conflictResolution: string,
  cwd?: string,
): Promise<PullResult> {
  const result = await runGitCommand(['pull', '--no-rebase', 'origin', branch], cwd);
  if (result.exitCode !== 0) {
    const stderr = result.stderr + ' ' + result.stdout;
    if (hasMergeConflict(stderr)) {
      return resolveMergeConflict(stderr, conflictResolution, cwd);
    }
    return { success: false, hadConflict: false, error: `git pull failed: ${stderr}` };
  }
  return { success: true, hadConflict: false };
}

async function pullWithRebase(
  branch: string,
  conflictResolution: string,
  cwd?: string,
): Promise<PullResult> {
  const result = await runGitCommand(['pull', '--rebase', 'origin', branch], cwd);
  if (result.exitCode !== 0) {
    const stderr = result.stderr + ' ' + result.stdout;
    if (hasMergeConflict(stderr)) {
      return resolveRebaseConflict(conflictResolution, cwd);
    }
    return { success: false, hadConflict: false, error: `git pull --rebase failed: ${stderr}` };
  }
  return { success: true, hadConflict: false };
}

async function pullFastForwardOnly(
  branch: string,
  conflictResolution: string,
  cwd?: string,
): Promise<PullResult> {
  const result = await runGitCommand(['pull', '--ff-only', 'origin', branch], cwd);
  if (result.exitCode !== 0) {
    const stderr = result.stderr + ' ' + result.stdout;
    if (hasMergeConflict(stderr)) {
      return resolveMergeConflict(stderr, conflictResolution, cwd);
    }
    return { success: false, hadConflict: false, error: `git pull --ff-only failed: ${stderr}` };
  }
  return { success: true, hadConflict: false };
}

async function resolveMergeConflict(
  _stderr: string,
  conflictResolution: string,
  cwd?: string,
): Promise<PullResult> {
  if (conflictResolution === 'abort') {
    await runGitCommand(['merge', '--abort'], cwd);
    return {
      success: false,
      hadConflict: true,
      error: `conflict detected, merge aborted: ${_stderr}`,
    };
  }
  if (conflictResolution === 'local') {
    await runGitCommand(['checkout', '--ours', '.'], cwd);
    await runGitCommand(['add', '.'], cwd);
    await runGitCommand(['commit', '--no-edit'], cwd);
    return { success: true, hadConflict: true };
  }
  if (conflictResolution === 'remote') {
    await runGitCommand(['checkout', '--theirs', '.'], cwd);
    await runGitCommand(['add', '.'], cwd);
    await runGitCommand(['commit', '--no-edit'], cwd);
    return { success: true, hadConflict: true };
  }
  return {
    success: false,
    hadConflict: true,
    error: `unknown conflict resolution: ${conflictResolution}`,
  };
}

async function resolveRebaseConflict(
  conflictResolution: string,
  cwd?: string,
): Promise<PullResult> {
  if (conflictResolution === 'abort') {
    await runGitCommand(['rebase', '--abort'], cwd);
    return {
      success: false,
      hadConflict: true,
      error: 'conflict detected, rebase aborted',
    };
  }
  // During rebase, --ours refers to the upstream (remote) and --theirs refers to
  // the local branch being rebased — the opposite of git merge semantics.
  // See: https://git-scm.com/docs/git-rebase#_conflicts
  if (conflictResolution === 'local') {
    await runGitCommand(['checkout', '--theirs', '.'], cwd);
    await runGitCommand(['add', '.'], cwd);
  } else if (conflictResolution === 'remote') {
    await runGitCommand(['checkout', '--ours', '.'], cwd);
    await runGitCommand(['add', '.'], cwd);
  }

  const continueResult = await runGitCommand(['rebase', '--continue'], cwd);
  if (continueResult.exitCode !== 0) {
    const output = continueResult.stderr + ' ' + continueResult.stdout;
    if (hasMergeConflict(output)) {
      return resolveRebaseConflict(conflictResolution, cwd);
    }
    return {
      success: false,
      hadConflict: true,
      error: `rebase --continue failed: ${continueResult.stderr}`,
    };
  }
  return { success: true, hadConflict: true };
}

export async function pushToRemote(
  branch: string,
  forcePush: boolean,
  cwd?: string,
): Promise<PushResult> {
  for (let attempt = 0; attempt < MAX_GIT_RETRIES; attempt++) {
    const args = ['push', 'origin', branch];
    if (forcePush) {
      args.push('--force');
    }
    const result = await runGitCommand(args, cwd);
    if (result.exitCode === 0) {
      return { success: true };
    }
    const error = result.stderr || result.stdout || '';
    if (isRemoteAheadError(error)) {
      return { success: false, error: 'remote_ahead', errorCode: 'remote_ahead' };
    }
    if (isGitNetworkError(error)) {
      if (attempt < MAX_GIT_RETRIES - 1) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return { success: false, error: `push failed after ${MAX_GIT_RETRIES} retries: ${error}`, errorCode: 'network_error' };
    }
    return { success: false, error };
  }
  return { success: false, error: 'push failed: max retries exceeded' };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGitNetworkError(stderr: string): boolean {
  return NETWORK_ERROR_PATTERNS.some((pattern) =>
    stderr.toLowerCase().includes(pattern.toLowerCase()),
  );
}

export function isRemoteAheadError(stderr: string): boolean {
  return REMOTE_AHEAD_PATTERNS.some((pattern) => stderr.includes(pattern));
}

export function hasMergeConflict(output: string): boolean {
  return MERGE_CONFLICT_PATTERNS.some((pattern) => output.includes(pattern));
}
