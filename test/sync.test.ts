import { test, expect, describe, afterEach } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncRepo, getRepoStatus } from '../src/sync.ts';
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
