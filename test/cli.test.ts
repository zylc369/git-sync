import { test, expect, describe, afterEach } from 'bun:test';
import { spawn } from 'node:child_process';
import { setupRepoWithRemote, cleanup } from './helpers.ts';

async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', 'src/cli.ts', ...args], {
      cwd: import.meta.dir.replace('/test', ''),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

describe('CLI', () => {
  let remote: string;
  let local: string;

  afterEach(() => {
    cleanup(local, remote);
  });

  test('syncs a repo via CLI', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await runCLI([local]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Synced');
  });

  test('shows status via --status flag', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await runCLI([local, '--status']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('synced');
    expect(result.stdout).toContain('Branch');
  });

  test('fails with invalid conflict-resolution', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await runCLI([local, '--conflict-resolution', 'invalid']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid conflict-resolution');
  });

  test('fails with invalid merge-mode', async () => {
    ({ local, remote } = setupRepoWithRemote());
    const result = await runCLI([local, '--merge-mode', 'invalid']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid merge-mode');
  });

  test('fails for non-existent path', async () => {
    remote = '';
    local = '/non/existent/path/xyz';
    const result = await runCLI([local]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Failed');
  });
});
