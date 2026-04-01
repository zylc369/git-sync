import { test, expect, describe, afterEach } from 'bun:test';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncRepo, getRepoStatus, getRepoInfo } from '../src/sync.ts';
import { setupRepoWithRemote, cloneRemote, makeCommit, getBranch, cleanup } from './helpers.ts';

describe('syncRepo', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('syncs a clean repo (nothing to commit, nothing to push)', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await syncRepo({ localPath: local });
    expect(result.success).toBe(true);
    expect(result.branch).toBeTruthy();
  });

  test('commits and pushes uncommitted changes', async () => {
    ({ local, remote } = setupRepoWithRemote());
    writeFileSync(join(local, 'new-file.txt'), 'hello world');
    const result = await syncRepo({ localPath: local });
    expect(result.success).toBe(true);
  });

  test('pulls remote changes and pushes local commits', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      makeCommit(other, 'remote change');
      const branch = getBranch(local);
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['push', 'origin', branch], { cwd: other });

      makeCommit(local, 'local change');
      const result = await syncRepo({ localPath: local });
      expect(result.success).toBe(true);
    } finally {
      cleanup(other);
    }
  });

  test('fails for non-existent path', async () => {
    remote = '';
    local = '/non/existent/path/xyz';
    const result = await syncRepo({ localPath: local });
    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  test('handles merge conflict with abort (default)', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'conflict.txt'), 'remote content');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      writeFileSync(join(local, 'conflict.txt'), 'local content');
      makeCommit(local, 'local change on same file');

      const result = await syncRepo({ localPath: local, conflictResolution: 'abort' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('conflict');
    } finally {
      cleanup(other);
    }
  });

  test('handles merge conflict with local resolution', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'conflict.txt'), 'remote content');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      writeFileSync(join(local, 'conflict.txt'), 'local content');
      makeCommit(local, 'local change on same file');

      const result = await syncRepo({ localPath: local, conflictResolution: 'local' });
      expect(result.success).toBe(true);
    } finally {
      cleanup(other);
    }
  });

  test('handles merge conflict with remote resolution', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'conflict.txt'), 'remote content');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      writeFileSync(join(local, 'conflict.txt'), 'local content');
      makeCommit(local, 'local change on same file');

      const result = await syncRepo({ localPath: local, conflictResolution: 'remote' });
      expect(result.success).toBe(true);
    } finally {
      cleanup(other);
    }
  });

  test('uses custom commit message', async () => {
    ({ local, remote } = setupRepoWithRemote());
    writeFileSync(join(local, 'custom.txt'), 'data');
    const result = await syncRepo({
      localPath: local,
      commitMessage: 'custom: my special message',
    });
    expect(result.success).toBe(true);
  });
});

describe('getRepoStatus', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('returns synced for clean repo', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const status = await getRepoStatus(local);
    expect(status.status).toBe('synced');
    expect(status.branch).toBeTruthy();
    expect(status.remoteUrl).toBeTruthy();
  });

  test('returns uncommitted for dirty repo', async () => {
    ({ local, remote } = setupRepoWithRemote());
    writeFileSync(join(local, 'dirty.txt'), 'dirty');
    const status = await getRepoStatus(local);
    expect(status.status).toBe('uncommitted');
  });

  test('returns unpushed for ahead repo', async () => {
    ({ local, remote } = setupRepoWithRemote());
    makeCommit(local, 'new commit');
    const status = await getRepoStatus(local);
    expect(status.status).toBe('unpushed');
  });

  test('returns error for non-existent path', async () => {
    remote = '';
    local = '/non/existent/path/xyz';
    const status = await getRepoStatus(local);
    expect(status.status).toBe('error');
    expect(status.error).toBeTruthy();
  });
});

describe('syncRepo with rebase mode', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('syncs clean repo with rebase mode', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await syncRepo({ localPath: local, mergeMode: 'rebase' });
    expect(result.success).toBe(true);
  });

  test('handles rebase conflict with abort', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'conflict.txt'), 'remote content');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      writeFileSync(join(local, 'conflict.txt'), 'local content');
      makeCommit(local, 'local change on same file');

      const result = await syncRepo({
        localPath: local,
        mergeMode: 'rebase',
        conflictResolution: 'abort',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('conflict');
    } finally {
      cleanup(other);
    }
  });

  test('handles rebase conflict with local resolution — keeps local content', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'conflict.txt'), 'remote content');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      writeFileSync(join(local, 'conflict.txt'), 'local content');
      makeCommit(local, 'local change on same file');

      const result = await syncRepo({
        localPath: local,
        mergeMode: 'rebase',
        conflictResolution: 'local',
      });
      expect(result.success).toBe(true);
      const content = readFileSync(join(local, 'conflict.txt'), 'utf-8');
      expect(content).toBe('local content');
    } finally {
      cleanup(other);
    }
  });

  test('handles rebase conflict with remote resolution — keeps remote content', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'conflict.txt'), 'remote content');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      writeFileSync(join(local, 'conflict.txt'), 'local content');
      makeCommit(local, 'local change on same file');

      const result = await syncRepo({
        localPath: local,
        mergeMode: 'rebase',
        conflictResolution: 'remote',
      });
      expect(result.success).toBe(true);
      const content = readFileSync(join(local, 'conflict.txt'), 'utf-8');
      expect(content).toBe('remote content');
    } finally {
      cleanup(other);
    }
  });
});

describe('syncRepo with fast-forward mode', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('syncs clean repo with fast-forward mode', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await syncRepo({ localPath: local, mergeMode: 'fast-forward' });
    expect(result.success).toBe(true);
  });

  test('pulls remote-only changes with fast-forward', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      makeCommit(other, 'remote change');
      const branch = getBranch(local);
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['push', 'origin', branch], { cwd: other });

      const result = await syncRepo({ localPath: local, mergeMode: 'fast-forward' });
      expect(result.success).toBe(true);
    } finally {
      cleanup(other);
    }
  });

  test('fast-forward fails when histories diverge', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);
      writeFileSync(join(other, 'other.txt'), 'remote');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['add', '.'], { cwd: other });
      sp('git', ['commit', '-m', 'remote change'], { cwd: other });
      sp('git', ['push', 'origin', branch], { cwd: other });

      makeCommit(local, 'local change');

      const result = await syncRepo({ localPath: local, mergeMode: 'fast-forward' });
      expect(result.success).toBe(false);
    } finally {
      cleanup(other);
    }
  });
});

describe('syncRepo retry logic', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('retries push when remote has new commits (remote-ahead)', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const other = cloneRemote(remote);
    try {
      const branch = getBranch(local);

      // Make a local commit (not pushed)
      makeCommit(local, 'local change');

      // While sync is running, another push happens to remote.
      // We simulate this by having a competing clone push first.
      makeCommit(other, 'competing change');
      const { spawnSync: sp } = await import('node:child_process');
      sp('git', ['push', 'origin', branch], { cwd: other });

      // Now syncRepo should:
      // 1. Commit local (already committed)
      // 2. Pull remote (merge the competing change)
      // 3. Push (should succeed after pull)
      const result = await syncRepo({ localPath: local });
      expect(result.success).toBe(true);
    } finally {
      cleanup(other);
    }
  });
});

describe('getRepoInfo', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('returns full repo info for valid repo', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const info = await getRepoInfo(local);
    expect(info).not.toBeNull();
    expect(info!.branch).toBeTruthy();
    expect(info!.remoteUrl).toBeTruthy();
    expect(info!.hasUncommittedChanges).toBe(false);
    expect(info!.hasUnpushedCommits).toBe(false);
    expect(info!.recentCommits.length).toBeGreaterThan(0);
  });

  test('returns null for non-existent path', async () => {
    remote = '';
    local = '/non/existent/path/xyz';
    const info = await getRepoInfo(local);
    expect(info).toBeNull();
  });

  test('detects uncommitted changes', async () => {
    ({ local, remote } = setupRepoWithRemote());
    writeFileSync(join(local, 'dirty.txt'), 'dirty');
    const info = await getRepoInfo(local);
    expect(info!.hasUncommittedChanges).toBe(true);
  });

  test('detects unpushed commits', async () => {
    ({ local, remote } = setupRepoWithRemote());
    makeCommit(local, 'new commit');
    const info = await getRepoInfo(local);
    expect(info!.hasUnpushedCommits).toBe(true);
  });
});
