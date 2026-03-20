// Wrappers around Octokit pulls API calls.
import type { ConflictcastOctokit } from "../utils/types";

export interface PullRequest {
  number: number;
  draft?: boolean;
  head: {
    sha: string;
  };
  base: {
    ref: string;
  };
}

export async function listOpenPRs(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
): Promise<PullRequest[]> {
  const pullRequests = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });

  return pullRequests.map((pullRequest) => ({
    number: pullRequest.number,
    draft: pullRequest.draft,
    head: {
      sha: pullRequest.head.sha,
    },
    base: {
      ref: pullRequest.base.ref,
    },
  }));
}

export async function getPRFiles(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  return files.map((file) => file.filename);
}

export async function getPRDiff(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: {
      format: "diff",
    },
  });

  return response.data as unknown as string;
}
