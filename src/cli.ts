import { Command } from 'commander';
import { syncRepo, getRepoStatus } from './sync.ts';
import { PACKAGE_NAME } from './types.ts';

const program = new Command();

program
  .name(PACKAGE_NAME)
  .description('Git repository sync tool - commit, pull, merge, push with conflict resolution')
  .version('0.1.0');

program
  .argument('<path>', 'Local repository path')
  .option('--conflict-resolution <mode>', 'How to handle conflicts: abort, local, remote', 'abort')
  .option('--merge-mode <mode>', 'Merge strategy: no-rebase, rebase, fast-forward', 'no-rebase')
  .option('--commit-message <message>', 'Custom commit message')
  .option('--status', 'Show repository status only (no sync)', false)
  .action(async (path: string, options: {
    conflictResolution: string;
    mergeMode: string;
    commitMessage?: string;
    status: boolean;
  }) => {
    const validConflictResolutions = ['abort', 'local', 'remote'];
    if (!validConflictResolutions.includes(options.conflictResolution)) {
      console.error(`Error: Invalid conflict-resolution '${options.conflictResolution}'. Must be one of: ${validConflictResolutions.join(', ')}`);
      process.exit(1);
    }

    const validMergeModes = ['no-rebase', 'rebase', 'fast-forward'];
    if (!validMergeModes.includes(options.mergeMode)) {
      console.error(`Error: Invalid merge-mode '${options.mergeMode}'. Must be one of: ${validMergeModes.join(', ')}`);
      process.exit(1);
    }

    if (options.status) {
      const result = await getRepoStatus(path);
      console.log(`Path:   ${result.localPath}`);
      console.log(`Status: ${result.status}`);
      console.log(`Branch: ${result.branch ?? 'unknown'}`);
      console.log(`Remote: ${result.remoteUrl ?? 'none'}`);
      if (result.error) {
        console.error(`Error:  ${result.error}`);
        process.exit(1);
      }
      return;
    }

    const result = await syncRepo({
      localPath: path,
      conflictResolution: options.conflictResolution as 'abort' | 'local' | 'remote',
      mergeMode: options.mergeMode as 'rebase' | 'no-rebase' | 'fast-forward',
      commitMessage: options.commitMessage,
    });

    if (result.success) {
      console.log(`✅ Synced: ${result.localPath} (${result.branch})`);
    } else {
      console.error(`❌ Failed: ${result.localPath} - ${result.error}`);
      process.exit(1);
    }
  });

program.parse();
