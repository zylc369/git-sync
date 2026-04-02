# @zylc369/bw-git-sync

Git 仓库同步工具 — 提交、拉取、合并、推送，支持冲突解决。可同时作为 CLI 工具和库使用。

## 同步流程

1. 提交未提交的本地更改
2. 拉取远程更改
3. 合并 — 如有冲突，按 `conflictResolution` 选项处理
4. 推送本地提交 — 如远程领先，则从第 2 步重试（最多 3 次）
5. 记录成功

## 安装

```bash
bun add @zylc369/bw-git-sync
npm install @zylc369/bw-git-sync
```

## CLI 用法

```bash
# 基本同步
npx bw-git-sync /path/to/repo

# 带选项
npx bw-git-sync /path/to/repo --conflict-resolution local --merge-mode rebase

# 自定义提交消息
npx bw-git-sync /path/to/repo --commit-message "deploy: production release"

# 仅查看状态（不同步）
npx bw-git-sync /path/to/repo --status
```

### CLI 选项

| 选项 | 可选值 | 默认值 | 说明 |
|--------|--------|---------|-------------|
| `--conflict-resolution` | `abort`, `local`, `remote` | `abort` | 如何处理合并冲突 |
| `--merge-mode` | `no-rebase`, `rebase`, `fast-forward` | `no-rebase` | Git 合并策略 |
| `--commit-message` | string | 自动生成 | 自定义提交消息 |
| `--status` | flag | 关闭 | 仅显示仓库状态 |

## 库用法

```typescript
import { syncRepo, getRepoStatus } from '@zylc369/bw-git-sync';

// 同步仓库
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

// 查看状态
const status = await getRepoStatus('/path/to/my/repo');
console.log(status.status); // 'synced' | 'uncommitted' | 'unpushed' | 'error'
```

## API

### `syncRepo(options: SyncOptions): Promise<SyncResult>`

主同步函数。提交、拉取、合并并推送仓库。

### `getRepoStatus(localPath: string): Promise<RepoStatusResult>`

返回当前仓库状态，不做任何修改。

### `getRepoInfo(localPath: string): Promise<RepoInfo | null>`

返回详细的仓库信息（分支、远程地址、提交、脏状态）。

### 底层函数

同样导出供高级使用：`runGitCommand`、`getCurrentBranch`、`getRemoteUrl`、`validateRepo`、`hasUncommittedChanges`、`hasUnpushedCommits`、`getRecentCommits`、`commitChanges`、`pullFromRemote`、`pushToRemote`、`sleep`、`isGitNetworkError`、`isRemoteAheadError`、`hasGitMergeConflict`。

## 开发

```bash
bun install
bun test
bun run build
bun run release:dry
```

## 发布

本项目使用 scoped 包名 `@zylc369/bw-git-sync`，已配置 `publishConfig.access: "public"` 以支持公开发布。

### 前置条件

```bash
# 登录 npm（首次）
npm login
```

### 发布步骤

```bash
# 1. 试发布（验证打包内容，不实际上传）
bun run release:dry

# 2. 正式发布
bun run release
```

`prepublishOnly` 钩子会自动执行 build + test，确保发布内容通过所有检查。

### 版本更新

```bash
# 更新补丁版本（0.1.0 → 0.1.1）
npm version patch

# 更新次版本（0.1.0 → 0.2.0）
npm version minor

# 更新主版本（0.1.0 → 1.0.0）
npm version major
```

版本号更新后执行 `bun run release` 即可。

## 许可证

Apache-2.0
