import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { IntegrationError } from "../../../utils/src/errors";

const execFileAsync = promisify(execFile);

export type GitClientConfig = {
  provider: "github" | "gitlab" | "bitbucket";
  token: string;
  owner: string;
  repository: string;
  repositoryPath?: string;
};

export class GitClient {
  constructor(private readonly config: GitClientConfig) {}

  private ensureConfigured() {
    if (!this.config.token || !this.config.owner || !this.config.repository) {
      return false;
    }
    return true;
  }

  private getRepoPath() {
    return this.config.repositoryPath ?? process.cwd();
  }

  private getCloneUrl() {
    if (this.config.provider !== "github") {
      throw new IntegrationError(`Git provider ${this.config.provider} is not implemented yet`);
    }

    if (!this.ensureConfigured()) {
      throw new IntegrationError(
        "GitHub is not configured. Set GIT_TOKEN, GIT_OWNER, and GIT_REPOSITORY before using git operations."
      );
    }

    return `https://x-access-token:${encodeURIComponent(this.config.token)}@github.com/${this.config.owner}/${this.config.repository}.git`;
  }

  private async ensureRepository(baseBranch = "master") {
    const repoPath = this.getRepoPath();
    const gitDir = path.join(repoPath, ".git");

    if (fs.existsSync(gitDir)) {
      return repoPath;
    }

    if (fs.existsSync(repoPath)) {
      const entries = fs.readdirSync(repoPath);
      if (entries.length > 0) {
        throw new IntegrationError(
          `Repository path ${repoPath} exists but is not a git checkout. Point REPOSITORY_PATH to an empty folder or an existing clone.`
        );
      }
    } else {
      fs.mkdirSync(repoPath, { recursive: true });
    }

    const cloneUrl = this.getCloneUrl();
    const parentDir = path.dirname(repoPath);
    const targetName = path.basename(repoPath);
    try {
      await execFileAsync("git", ["clone", "--branch", baseBranch, "--single-branch", cloneUrl, targetName], {
        cwd: parentDir
      });
    } catch (error) {
      throw redactCommandError(error);
    }

    await this.ensureOriginMatches(repoPath);

    return repoPath;
  }

  private async ensureOriginMatches(repoPath: string) {
    const expected = `https://github.com/${this.config.owner}/${this.config.repository}.git`;
    let origin = "";

    try {
      const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repoPath });
      origin = String(stdout).trim();
    } catch {
      throw new IntegrationError(`Repository at ${repoPath} does not have an origin remote`);
    }

    const normalizedOrigin = normalizeGitRemote(origin);
    const normalizedExpected = normalizeGitRemote(expected);
    if (normalizedOrigin !== normalizedExpected) {
      const safeOrigin = redactSecrets(origin);
      const safeExpected = redactSecrets(expected);
      throw new IntegrationError(
        `Repository origin mismatch. Expected ${safeExpected} but found ${safeOrigin} in ${repoPath}`
      );
    }
  }

  async ensureBranch(branchName: string, baseBranch: string) {
    const repoPath = await this.ensureRepository(baseBranch);
    await this.ensureOriginMatches(repoPath);

    try {
      await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoPath });
    } catch {
      throw new IntegrationError(`Repository path ${repoPath} is not a valid git checkout`);
    }

    try {
      const { stdout } = await execFileAsync("git", ["branch", "--list", branchName], { cwd: repoPath });
      if (String(stdout).trim().length > 0) {
        return { branchName, baseBranch, created: false, skipped: false };
      }
    } catch {
      // fall through and create the branch below
    }

    await execFileAsync("git", ["checkout", baseBranch], { cwd: repoPath });
    await execFileAsync("git", ["checkout", "-b", branchName], { cwd: repoPath });

    return { branchName, baseBranch, created: true, skipped: false };
  }

  async hasDiff(baseBranch: string) {
    const repoPath = await this.ensureRepository();
    await this.ensureOriginMatches(repoPath);
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoPath });
    const dirty = String(stdout).trim().length > 0;
    if (!dirty) {
      const { stdout: revs } = await execFileAsync("git", ["rev-list", "--count", `${baseBranch}..HEAD`], {
        cwd: repoPath
      });
      return Number(String(revs).trim()) > 0;
    }
    return true;
  }

  async commitAndPush(branchName: string, message: string, baseBranch = "master") {
    const repoPath = await this.ensureRepository();
    await this.ensureOriginMatches(repoPath);
    await execFileAsync("git", ["add", "-A"], { cwd: repoPath });
    const { stdout: statusOut } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoPath });
    if (String(statusOut).trim()) {
      // Working tree still has edits - the coding agent left them uncommitted, so commit them ourselves.
      await execFileAsync("git", ["commit", "-m", message], { cwd: repoPath });
    }

    const { stdout: aheadOut } = await execFileAsync(
      "git",
      ["rev-list", "--count", `${baseBranch}..HEAD`],
      { cwd: repoPath }
    );
    const aheadCount = Number(String(aheadOut).trim());
    if (!aheadCount) {
      // Nothing committed by us and nothing already committed by the coding agent either.
      return { committed: false, pushed: false, sha: "" };
    }

    await execFileAsync("git", ["push", "origin", branchName], { cwd: repoPath });
    const { stdout: shaOut } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    return { committed: true, pushed: true, sha: String(shaOut).trim() };
  }

  async createPullRequest(branchName: string, title: string, body: string, baseBranch: string) {
    const repoPath = await this.ensureRepository();
    await this.ensureOriginMatches(repoPath);
    let headSha = "";
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
      headSha = String(stdout).trim();
    } catch {
      throw new IntegrationError("Unable to read git HEAD for PR publication");
    }

    if (!headSha) {
      throw new IntegrationError("Unable to determine git HEAD for PR publication");
    }

    await this.publishGithubBranch(branchName, headSha);

    const response = await fetch(`https://api.github.com/repos/${this.config.owner}/${this.config.repository}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        body,
        base: baseBranch,
        head: branchName
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new IntegrationError(`Unable to create pull request: ${message}`);
    }

    const payload = (await response.json()) as { html_url?: string };

    return {
      title,
      body,
      baseBranch,
      branchName,
      url:
        payload.html_url ??
        `https://github.com/${this.config.owner}/${this.config.repository}/pull/new/${encodeURIComponent(branchName)}`
    };
  }

  private async publishGithubBranch(branchName: string, sha: string) {
    const response = await fetch(`https://api.github.com/repos/${this.config.owner}/${this.config.repository}/git/refs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha
      })
    });

    if (response.ok) {
      return;
    }

    if (response.status === 422) {
      return;
    }

    const message = await response.text();
    throw new IntegrationError(`Unable to publish git branch to GitHub: ${message}`);
  }
}

function normalizeGitRemote(value: string) {
  return redactSecrets(value)
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^https:\/\/[^@]+@github\.com\//, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function redactSecrets(value: string) {
  return value.replace(/https:\/\/[^@]+@github\.com\//gi, "https://github.com/");
}

function redactCommandError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const redacted = new IntegrationError(redactSecrets(error.message));
  redacted.stack = error.stack ? redactSecrets(error.stack) : error.stack;
  return redacted;
}
