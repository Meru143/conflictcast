// Wrappers around Octokit pulls API calls.
import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

export type PullRequest =
  RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];

export async function listOpenPRs(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<PullRequest[]> {
  return octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
}

export async function getPRFiles(
  octokit: Octokit,
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
  octokit: Octokit,
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
