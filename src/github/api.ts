import { config } from '../config.js';

export interface GithubRepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  description: string | null;
}

export interface GithubCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

export interface GithubReleaseInfo {
  id: number;
  tagName: string;
  name: string;
  body: string | null;
  publishedAt: string;
  htmlUrl: string;
}

export class GithubApi {
  private static baseUrl = 'https://api.github.com';

  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GitBot-Companion/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (config.githubToken) {
      headers.Authorization = `Bearer ${config.githubToken}`;
    }

    return headers;
  }

  public static parseUrl(urlOrShorthand: string): { owner: string; repo: string } | null {
    if (!urlOrShorthand || typeof urlOrShorthand !== 'string') return null;

    const trimmed = urlOrShorthand.trim();

    const shorthandMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (shorthandMatch) {
      return {
        owner: shorthandMatch[1],
        repo: shorthandMatch[2].replace(/\.git$/, ''),
      };
    }

    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      if (url.hostname.includes('github.com')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
          return {
            owner: parts[0],
            repo: parts[1].replace(/\.git$/, ''),
          };
        }
      }
    } catch {
      
    }

    return null;
  }

  public static async getAuthenticatedUser(): Promise<{ login: string; name: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/user`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      return { login: data.login, name: data.name || data.login };
    } catch (err) {
      console.error('[GitHub API] getAuthenticatedUser error:', err);
      return null;
    }
  }

  public static async getRepo(owner: string, repo: string): Promise<GithubRepoInfo | null> {
    try {
      const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        console.warn(`[GitHub API] getRepo returned status ${res.status} for ${owner}/${repo}`);
        return null;
      }

      const data = (await res.json()) as any;
      return {
        owner: data.owner?.login || owner,
        repo: data.name || repo,
        fullName: data.full_name,
        isPrivate: !!data.private,
        defaultBranch: data.default_branch || 'main',
        cloneUrl: data.clone_url,
        htmlUrl: data.html_url,
        description: data.description || null,
      };
    } catch (err) {
      console.error(`[GitHub API] Failed to fetch repo ${owner}/${repo}:`, err);
      return null;
    }
  }

  public static async createPrivateRepo(name: string, description?: string): Promise<{
    success: boolean;
    repo?: GithubRepoInfo;
    error?: string;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/user/repos`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          private: true,
          auto_init: false,
          description: description || 'Automated backup repository created by GitBot Companion',
        }),
      });

      const data = (await res.json()) as any;

      if (!res.ok) {
        const errorMsg = data.message || `Failed with status ${res.status}`;
        const errorDetail = data.errors ? JSON.stringify(data.errors) : '';
        return {
          success: false,
          error: `${errorMsg} ${errorDetail}`.trim(),
        };
      }

      return {
        success: true,
        repo: {
          owner: data.owner?.login,
          repo: data.name,
          fullName: data.full_name,
          isPrivate: true,
          defaultBranch: data.default_branch || 'main',
          cloneUrl: data.clone_url,
          htmlUrl: data.html_url,
          description: data.description,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown network error while creating repo',
      };
    }
  }

  public static async getLatestCommit(
    owner: string,
    repo: string,
    branch?: string
  ): Promise<GithubCommitInfo | null> {
    try {
      const url = new URL(`${this.baseUrl}/repos/${owner}/${repo}/commits`);
      url.searchParams.set('per_page', '1');
      if (branch) {
        url.searchParams.set('sha', branch);
      }

      const res = await fetch(url.toString(), {
        headers: this.getHeaders(),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as any[];
      if (!Array.isArray(data) || data.length === 0) return null;

      const item = data[0];
      return {
        sha: item.sha,
        shortSha: item.sha.substring(0, 7),
        message: item.commit?.message?.split('\n')[0] || 'No commit message',
        author: item.commit?.author?.name || item.author?.login || 'Unknown',
        date: item.commit?.author?.date || item.commit?.committer?.date || '',
        htmlUrl: item.html_url,
      };
    } catch (err) {
      console.error(`[GitHub API] Failed to fetch latest commit for ${owner}/${repo}:`, err);
      return null;
    }
  }

  public static async getLatestRelease(
    owner: string,
    repo: string
  ): Promise<GithubReleaseInfo | null> {
    try {
      const res = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/releases/latest`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        
        return null;
      }

      const data = (await res.json()) as any;
      return {
        id: data.id,
        tagName: data.tag_name,
        name: data.name || data.tag_name,
        body: data.body || null,
        publishedAt: data.published_at || '',
        htmlUrl: data.html_url,
      };
    } catch (err) {
      console.error(`[GitHub API] Failed to fetch latest release for ${owner}/${repo}:`, err);
      return null;
    }
  }

  public static getAuthenticatedGitUrl(owner: string, repo: string): string {
    if (config.githubToken) {
      return `https://x-access-token:${config.githubToken}@github.com/${owner}/${repo}.git`;
    }
    return `https://github.com/${owner}/${repo}.git`;
  }
}
