import {
  type SyncOptions,
  type SyncResult,
  type RepoStatus,
  type RepoStatusResult,
  type RepoInfo,
  MAX_MERGE_RETRIES,
  PACKAGE_NAME,
} from './types.ts';
import {
  validateRepo,
  hasUncommittedChanges,
  commitChanges,
  pullFromRemote,
  pushToRemote,
  hasUnpushedCommits,
  getRecentCommits,
} from './git.ts';

export async function syncRepo(options: SyncOptions): Promise<SyncResult> {
  const {
    localPath,
    conflictResolution = 'abort',
    mergeMode = 'no-rebase',
    commitMessage,
  } = options;

  const validation = await validateRepo(localPath);
  if (!validation.valid) {
    return {
      success: false,
      localPath,
      remoteUrl: '',
      branch: '',
      error: validation.error,
      hadUncommitted: false,
      hadUnpushed: false,
    };
  }

  const { remoteUrl, branch } = validation;

  const uncommitted = await hasUncommittedChanges(localPath);
  if (uncommitted) {
    const msg = commitMessage ?? `chore: ${PACKAGE_NAME} auto commit [${new Date().toISOString()}]`;
    const commitResult = await commitChanges(msg, localPath);
    if (!commitResult.success) {
      return {
        success: false,
        localPath,
        remoteUrl,
        branch,
        error: commitResult.error,
        hadUncommitted: true,
        hadUnpushed: false,
      };
    }
  }

  const hasUnpushed = await hasUnpushedCommits(branch, localPath);
  if (!hasUnpushed) {
    return {
      success: true,
      localPath,
      remoteUrl,
      branch,
      lastSyncTime: new Date().toISOString(),
      hadUncommitted: uncommitted,
      hadUnpushed: false,
    };
  }

  for (let retryCount = 0; retryCount < MAX_MERGE_RETRIES; retryCount++) {
    const pullResult = await pullFromRemote(
      branch,
      { mergeMode, conflictResolution },
      localPath,
    );

    if (!pullResult.success) {
      return {
        success: false,
        localPath,
        remoteUrl,
        branch,
        error: pullResult.error,
        hadUncommitted: uncommitted,
        hadUnpushed: true,
      };
    }

    const needForce = pullResult.hadConflict && conflictResolution === 'local';
    const pushResult = await pushToRemote(branch, needForce, localPath);

    if (pushResult.success) {
      return {
        success: true,
        localPath,
        remoteUrl,
        branch,
        lastSyncTime: new Date().toISOString(),
        hadUncommitted: uncommitted,
        hadUnpushed: true,
      };
    }

    if (pushResult.errorCode === 'remote_ahead') {
      continue;
    }

    return {
      success: false,
      localPath,
      remoteUrl,
      branch,
      error: pushResult.error,
      hadUncommitted: uncommitted,
      hadUnpushed: true,
    };
  }

  return {
    success: false,
    localPath,
    remoteUrl,
    branch,
    error: `Max merge retries (${MAX_MERGE_RETRIES}) exceeded`,
    hadUncommitted: uncommitted,
    hadUnpushed: true,
  };
}

export async function getRepoStatus(localPath: string): Promise<RepoStatusResult> {
  const validation = await validateRepo(localPath);
  if (!validation.valid) {
    return {
      localPath,
      status: 'error' as RepoStatus,
      branch: null,
      remoteUrl: null,
      error: validation.error,
    };
  }

  const uncommitted = await hasUncommittedChanges(localPath);
  if (uncommitted) {
    return {
      localPath,
      status: 'uncommitted',
      branch: validation.branch,
      remoteUrl: validation.remoteUrl,
    };
  }

  const unpushed = await hasUnpushedCommits(validation.branch, localPath);
  if (unpushed) {
    return {
      localPath,
      status: 'unpushed',
      branch: validation.branch,
      remoteUrl: validation.remoteUrl,
    };
  }

  return {
    localPath,
    status: 'synced',
    branch: validation.branch,
    remoteUrl: validation.remoteUrl,
  };
}

export async function getRepoInfo(localPath: string): Promise<RepoInfo | null> {
  const validation = await validateRepo(localPath);
  if (!validation.valid) {
    return null;
  }

  const { branch, remoteUrl } = validation;

  return {
    localPath,
    remoteUrl,
    branch,
    hasUncommittedChanges: await hasUncommittedChanges(localPath),
    hasUnpushedCommits: await hasUnpushedCommits(branch, localPath),
    recentCommits: await getRecentCommits(10, localPath),
  };
}
