import fs from 'node:fs';
import path from 'node:path';
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git';

export interface PathValidationResult {
  valid: boolean;
  resolvedPath: string;
  isGitRepo: boolean;
  error?: string;
}

export interface GitSyncResult {
  hasChanges: boolean;
  commitSha?: string;
  filesChanged?: number;
  error?: string;
}

export interface GitClonePullResult {
  success: boolean;
  action: 'cloned' | 'pulled';
  commitSha?: string;
  error?: string;
}

export class LocalGit {
  
  public static validatePath(inputPath: string): PathValidationResult {
    try {
      const resolved = path.resolve(inputPath.trim());
      if (!fs.existsSync(resolved)) {
        return {
          valid: false,
          resolvedPath: resolved,
          isGitRepo: false,
          error: `Path does not exist: "${resolved}"`,
        };
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return {
          valid: false,
          resolvedPath: resolved,
          isGitRepo: false,
          error: `Path is not a directory: "${resolved}"`,
        };
      }

      const isGitRepo = fs.existsSync(path.join(resolved, '.git'));
      return {
        valid: true,
        resolvedPath: resolved,
        isGitRepo,
      };
    } catch (err: any) {
      return {
        valid: false,
        resolvedPath: inputPath,
        isGitRepo: false,
        error: err.message || 'Invalid path format',
      };
    }
  }

  private static getGitInstance(directory: string): SimpleGit {
    const options: Partial<SimpleGitOptions> = {
      baseDir: directory,
      binary: 'git',
      maxConcurrentProcesses: 3,
      trimmed: true,
    };
    return simpleGit(options);
  }

  public static async initAndInitialPush(
    localPath: string,
    authenticatedRemoteUrl: string
  ): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    try {
      const git = this.getGitInstance(localPath);

      const isRepo = fs.existsSync(path.join(localPath, '.git'));
      if (!isRepo) {
        await git.init(['-b', 'main']);
      }

      try {
        const userName = await git.getConfig('user.name');
        if (!userName.value) {
          await git.addConfig('user.name', 'GitBot Companion', false, 'local');
        }
        const userEmail = await git.getConfig('user.email');
        if (!userEmail.value) {
          await git.addConfig('user.email', 'gitbot@localhost', false, 'local');
        }
        await git.addConfig('diff.ignoreSubmodules', 'all', false, 'local');
      } catch {
        
      }

      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      if (origin) {
        await git.remote(['set-url', 'origin', authenticatedRemoteUrl]);
      } else {
        await git.addRemote('origin', authenticatedRemoteUrl);
      }

      await git.add(['-A']);

      const status = await git.status();
      let commitSha = '';

      if (status.staged.length > 0 || status.created.length > 0) {
        const commitResult = await git.commit('Initial backup by GitBot Companion');
        commitSha = commitResult.commit;
      } else {
        
        try {
          commitSha = await git.revparse(['HEAD']);
        } catch {
          
          const readmePath = path.join(localPath, '.gitbot-sync');
          fs.writeFileSync(readmePath, `Synchronized with GitBot Companion at ${new Date().toISOString()}\n`, 'utf-8');
          await git.add(['.gitbot-sync']);
          const commitResult = await git.commit('Initial sync setup');
          commitSha = commitResult.commit;
        }
      }

      try {
        await git.branch(['-M', 'main']);
      } catch {
        
      }

      await git.push(['-u', 'origin', 'main', '--force']);

      if (!commitSha) {
        commitSha = await git.revparse(['HEAD']);
      }

      return {
        success: true,
        commitSha: commitSha.substring(0, 7),
      };
    } catch (err: any) {
      console.error('[LocalGit] initAndInitialPush error:', err);
      return {
        success: false,
        error: err.message || 'Failed to initialize and push repository',
      };
    }
  }

  public static async checkAndSync(
    localPath: string,
    authenticatedRemoteUrl?: string
  ): Promise<GitSyncResult> {
    try {
      const git = this.getGitInstance(localPath);

      if (authenticatedRemoteUrl) {
        try {
          await git.remote(['set-url', 'origin', authenticatedRemoteUrl]);
        } catch {
          
        }
      }

      const status = await git.status();
      const totalChanges =
        status.not_added.length +
        status.modified.length +
        status.created.length +
        status.deleted.length +
        status.staged.length;

      if (totalChanges === 0) {
        return {
          hasChanges: false,
        };
      }

      await git.add(['-A']);

      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const commitResult = await git.commit(`Auto sync: ${timestamp}`);
      await git.push(['origin', 'main']);

      return {
        hasChanges: true,
        commitSha: commitResult.commit || (await git.revparse(['HEAD'])).substring(0, 7),
        filesChanged: totalChanges,
      };
    } catch (err: any) {
      console.error('[LocalGit] checkAndSync error:', err);
      return {
        hasChanges: false,
        error: err.message || 'Failed to check and sync changes',
      };
    }
  }

  public static async cloneOrPull(
    authenticatedRemoteUrl: string,
    targetPath: string
  ): Promise<GitClonePullResult> {
    try {
      const resolved = path.resolve(targetPath.trim());

      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }

      const isGitRepo = fs.existsSync(path.join(resolved, '.git'));

      if (!isGitRepo) {
        
        const entries = fs.readdirSync(resolved);
        if (entries.length > 0) {
          
          const git = this.getGitInstance(resolved);
          await git.init(['-b', 'main']);
          await git.addRemote('origin', authenticatedRemoteUrl);
          await git.pull('origin', 'main');
          const sha = await git.revparse(['HEAD']);
          return {
            success: true,
            action: 'cloned',
            commitSha: sha.substring(0, 7),
          };
        } else {
          
          const parentDir = path.dirname(resolved);
          const dirName = path.basename(resolved);
          const gitParent = this.getGitInstance(parentDir);
          await gitParent.clone(authenticatedRemoteUrl, dirName);

          const git = this.getGitInstance(resolved);
          const sha = await git.revparse(['HEAD']);
          return {
            success: true,
            action: 'cloned',
            commitSha: sha.substring(0, 7),
          };
        }
      } else {
        
        const git = this.getGitInstance(resolved);
        await git.remote(['set-url', 'origin', authenticatedRemoteUrl]);
        await git.pull('origin', 'main');
        const sha = await git.revparse(['HEAD']);
        return {
          success: true,
          action: 'pulled',
          commitSha: sha.substring(0, 7),
        };
      }
    } catch (err: any) {
      console.error('[LocalGit] cloneOrPull error:', err);
      return {
        success: false,
        action: 'pulled',
        error: err.message || 'Failed to clone or pull repository',
      };
    }
  }
}
