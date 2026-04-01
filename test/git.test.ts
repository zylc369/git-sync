import { test, expect, describe, afterEach } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runGitCommand } from '../src/git.ts';
import { setupRepoWithRemote, cloneRemote, makeCommit, getBranch, cleanup } from './helpers.ts';

describe('runGitCommand', () => {
  test('runs a valid git command', async () => {
    const result = await runGitCommand(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length > 0).toBe(true);
  });

  test('returns non-zero for invalid command', async () => {
    const result = await runGitCommand(['invalid-command-xyz']);
    expect(result.exitCode).not.toBe(0);
  });

  test('uses cwd parameter', async () => {
    const { local, remote } = setupRepoWithRemote();
    try {
      const result = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], local);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().length > 0).toBe(true);
    } finally {
      cleanup(local, remote);
    }
  });
});
