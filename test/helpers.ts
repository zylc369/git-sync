import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const INTERMEDIATE_DIR = join(import.meta.dir, 'intermediate');

function ensureDir(): void {
  mkdirSync(INTERMEDIATE_DIR, { recursive: true });
}

export function createTempDir(): string {
  ensureDir();
  return mkdtempSync(join(INTERMEDIATE_DIR, 'gs-'));
}

export function createBareRemote(): string {
  const dir = createTempDir();
  spawnSync('git', ['init', '--bare'], { cwd: dir });
  return dir;
}

export function setupRepoWithRemote(): { remote: string; local: string } {
  const remote = createBareRemote();
  const local = createTempDir();
  spawnSync('git', ['clone', remote, local], { cwd: tmpdir() });
  gitConfig(local);
  writeFileSync(join(local, 'README.md'), '# Test');
  spawnSync('git', ['add', '.'], { cwd: local });
  spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: local });
  spawnSync('git', ['push', '-u', 'origin', getBranch(local)], { cwd: local });
  return { remote, local };
}

export function cloneRemote(remotePath: string): string {
  const dir = createTempDir();
  spawnSync('git', ['clone', remotePath, dir], { cwd: tmpdir() });
  gitConfig(dir);
  return dir;
}

export function makeCommit(repoPath: string, message: string, content?: string): void {
  const fileName = `file-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  writeFileSync(join(repoPath, fileName), content ?? `content ${Date.now()}`);
  spawnSync('git', ['add', '.'], { cwd: repoPath });
  spawnSync('git', ['commit', '-m', message], { cwd: repoPath });
}

export function getBranch(repoPath: string): string {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
  return r.stdout?.trim() ?? 'master';
}

export function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

function gitConfig(repoPath: string): void {
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repoPath });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoPath });
}
