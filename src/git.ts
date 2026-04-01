import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  type GitCommandResult,
  type ValidateResult,
  type PullResult,
  type PushResult,
  type CommitResult,
  type CommitInfo,
  MAX_GIT_RETRIES,
  NETWORK_ERROR_PATTERNS,
  REMOTE_AHEAD_PATTERNS,
  MERGE_CONFLICT_PATTERNS,
} from './types.ts';

export function runGitCommand(args: string[], cwd?: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
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
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (error) => {
      resolve({ stdout: '', stderr: error.message, exitCode: 1 });
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGitNetworkError(stderr: string): boolean {
  return NETWORK_ERROR_PATTERNS.some((p) => stderr.includes(p));
}

export function isRemoteAheadError(stderr: string): boolean {
  return REMOTE_AHEAD_PATTERNS.some((p) => stderr.toLowerCase().includes(p.toLowerCase()));
}

export function hasMergeConflict(output: string): boolean {
  return MERGE_CONFLICT_PATTERNS.some((p) => output.toLowerCase().includes(p.toLowerCase()));
}

export async function getCurrentBranch(cwd?: string): Promise<string | null> {
  const result = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

export async function getRemoteUrl(cwd?: string): Promise<string | null> {
  const result = await runGitCommand(['remote', 'get-url', 'origin'], cwd);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

export async function validateRepo(localPath: string): Promise<ValidateResult> {
  if (!existsSync(localPath)) {
    return { valid: false, error: `Path does not exist: ${localPath}` };
  }

  if (!existsSync(join(localPath, '.git'))) {
    return { valid: false, error: `Not a git repository: ${localPath}` };
  }

  const remoteUrl = await getRemoteUrl(localPath);
  if (!remoteUrl) {
    return { valid: false, error: `No remote 'origin' configured: ${localPath}` };
  }

  const branch = await getCurrentBranch(localPath);
  if (!branch) {
    return { valid: false, error: `Cannot detect current branch: ${localPath}` };
  }

  return { valid: true, remoteUrl, branch };
}

export async function hasUncommittedChanges(cwd?: string): Promise<boolean> {
  const result = await runGitCommand(['status', '--porcelain'], cwd);
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}

export async function hasUnpushedCommits(branch: string, cwd?: string): Promise<boolean> {
  const remoteResult = await runGitCommand(['rev-parse', '--verify', `origin/${branch}`], cwd);
  if (remoteResult.exitCode !== 0) {
    const logResult = await runGitCommand(['log', '--oneline', '-1'], cwd);
    return logResult.exitCode === 0 && logResult.stdout.trim().length > 0;
  }

  const diffResult = await runGitCommand(['log', `origin/${branch}..HEAD`, '--oneline'], cwd);
  return diffResult.exitCode === 0 && diffResult.stdout.trim().length > 0;
}

export async function getRecentCommits(limit: number = 10, cwd?: string): Promise<CommitInfo[]> {
  const result = await runGitCommand(['log', '--oneline', `-${limit}`, '--format=%H|%s|%an|%ai'], cwd);
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [hash, message, author, date] = line.split('|');
      if (!hash || !message || !author || !date) return null;
      return { hash, message, author, date };
    })
    .filter((c): c is CommitInfo => c !== null);
}

export async function commitChanges(message: string, cwd?: string): Promise<CommitResult> {
  const addResult = await runGitCommand(['add', '.'], cwd);
  if (addResult.exitCode !== 0) {
    return { success: false, error: `git add failed: ${addResult.stderr}` };
  }

  const commitResult = await runGitCommand(['commit', '-m', message], cwd);
  if (commitResult.exitCode !== 0) {
    const combined = commitResult.stderr + commitResult.stdout;
    if (combined.includes('nothing to commit')) {
      return { success: true };
    }
    return { success: false, error: `git commit failed: ${combined}` };
  }

  return { success: true };
}

export async function pullFromRemote(
  branch: string,
  options?: { mergeMode?: string; conflictResolution?: string },
  cwd?: string,
): Promise<PullResult> {
  const mergeMode = options?.mergeMode ?? 'no-rebase';
  const conflictResolution = options?.conflictResolution ?? 'abort';

  const pullArgs = buildPullArgs(branch, mergeMode);
  const pullResult = await runGitCommand(pullArgs, cwd);

  if (pullResult.exitCode === 0) {
    return { success: true, hadConflict: false };
  }

  const combinedOutput = pullResult.stdout + pullResult.stderr;

  if (hasMergeConflict(combinedOutput)) {
    if (mergeMode === 'rebase') {
      return handleRebaseConflict(cwd, conflictResolution);
    }
    return handleMergeConflict(branch, cwd, conflictResolution);
  }

  return { success: false, hadConflict: false, error: `git pull failed: ${pullResult.stderr}` };
}

function buildPullArgs(branch: string, mergeMode: string): string[] {
  switch (mergeMode) {
    case 'rebase':
      return ['pull', '--rebase', 'origin', branch];
    case 'fast-forward':
      return ['pull', '--ff-only', 'origin', branch];
    default:
      return ['pull', '--no-rebase', 'origin', branch];
  }
}

async function handleMergeConflict(
  branch: string,
  cwd: string | undefined,
  conflictResolution: string,
): Promise<PullResult> {
  if (conflictResolution === 'abort') {
    await runGitCommand(['merge', '--abort'], cwd);
    return { success: false, hadConflict: true, error: 'Merge conflict detected and aborted' };
  }

  const checkoutTarget = conflictResolution === 'local' ? '--ours' : '--theirs';
  await runGitCommand(['checkout', checkoutTarget, '.'], cwd);
  await runGitCommand(['add', '.'], cwd);
  await runGitCommand(['commit', '--no-edit'], cwd);
  return { success: true, hadConflict: true };
}

async function handleRebaseConflict(
  cwd: string | undefined,
  conflictResolution: string,
): Promise<PullResult> {
  if (conflictResolution === 'abort') {
    await runGitCommand(['rebase', '--abort'], cwd);
    return { success: false, hadConflict: true, error: 'Rebase conflict detected and aborted' };
  }

  const checkoutTarget = conflictResolution === 'local' ? '--ours' : '--theirs';
  await runGitCommand(['checkout', checkoutTarget, '.'], cwd);
  await runGitCommand(['add', '.'], cwd);

  const continueResult = await runGitCommand(['rebase', '--continue'], cwd);
  if (continueResult.exitCode !== 0) {
    const combined = continueResult.stdout + continueResult.stderr;
    if (combined.includes('no changes')) {
      await runGitCommand(['rebase', '--skip'], cwd);
    }
  }

  return { success: true, hadConflict: true };
}

export async function pushToRemote(
  branch: string,
  force: boolean = false,
  cwd?: string,
): Promise<PushResult> {
  const args = force ? ['push', '--force', 'origin', branch] : ['push', 'origin', branch];

  for (let attempt = 1; attempt <= MAX_GIT_RETRIES; attempt++) {
    const pushResult = await runGitCommand(args, cwd);
    if (pushResult.exitCode === 0) {
      return { success: true };
    }

    const error = pushResult.stderr;
    if (isGitNetworkError(error) && attempt < MAX_GIT_RETRIES) {
      await sleep(2000 * attempt);
      continue;
    }

    if (isRemoteAheadError(error)) {
      return { success: false, error: 'remote_ahead' };
    }

    return { success: false, error };
  }

  return { success: false, error: 'Network retries exhausted' };
}
