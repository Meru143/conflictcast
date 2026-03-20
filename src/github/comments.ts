// Wrappers around Octokit issues comments API.
import { RequestError } from "@octokit/request-error";

import type { ConflictcastOctokit, OverlapScore } from "../utils/types";

function buildSharedFilesTable(sharedFiles: string[]): string {
  const lines = ["| Shared File |", "| --- |", ...sharedFiles.map((file) => `| ${file} |`)];
  return lines.join("\n");
}

function buildConflictingHunks(score: OverlapScore): string {
  if (score.conflictingHunks.length === 0) {
    return "- No overlapping line ranges detected in the current diff.";
  }

  return score.conflictingHunks
    .map(
      (conflict) =>
        `- \`${conflict.file}\`: PR #${score.pr1} lines ${conflict.pr1Lines[0]}-${conflict.pr1Lines[1]} vs PR #${score.pr2} lines ${conflict.pr2Lines[0]}-${conflict.pr2Lines[1]}`,
    )
    .join("\n");
}

function buildCommentBody(
  owner: string,
  repo: string,
  pairedPrNumber: number | null,
  score: OverlapScore,
): string {
  const pairLinks =
    pairedPrNumber === null
      ? `Related PRs: [#${score.pr1}](https://github.com/${owner}/${repo}/pull/${score.pr1}) and [#${score.pr2}](https://github.com/${owner}/${repo}/pull/${score.pr2})`
      : `Competing PR: [#${pairedPrNumber}](https://github.com/${owner}/${repo}/pull/${pairedPrNumber})`;

  return [
    "⚠️ **Potential Merge Conflict Detected**",
    "",
    `Risk level: **${score.riskLevel}**`,
    "",
    pairLinks,
    "",
    "### Shared files",
    buildSharedFilesTable(score.sharedFiles),
    "",
    "### Line range overlaps",
    buildConflictingHunks(score),
  ].join("\n");
}

export async function postConflictComment(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  prNumber: number,
  pairedPrNumber: number,
  score: OverlapScore,
): Promise<number> {
  const response = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: buildCommentBody(owner, repo, pairedPrNumber, score),
  });

  return response.data.id;
}

export async function updateConflictComment(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  commentId: number,
  score: OverlapScore,
): Promise<void> {
  await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body: buildCommentBody(owner, repo, null, score),
  });
}

export async function deleteConflictComment(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  try {
    await octokit.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: commentId,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      return;
    }

    throw error;
  }
}
