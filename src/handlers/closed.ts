// pull_request.closed/merged handler.
import type { Context } from "probot";

import { deleteConflictComment } from "../github/comments";
import {
  deleteCommentRecord,
  getCommentsForPR,
} from "../store/comments";
import { deletePRFiles } from "../store/prFiles";

export async function closedHandler(context: Context<"pull_request">): Promise<void> {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;
  const prNumber = context.payload.pull_request.number;
  const repoFullName = `${owner}/${repo}`;
  const commentRecords = getCommentsForPR(repoFullName, prNumber);

  deletePRFiles(repoFullName, prNumber);

  for (const commentRecord of commentRecords) {
    await deleteConflictComment(
      context.octokit,
      owner,
      repo,
      commentRecord.commentId,
    );
    deleteCommentRecord(repoFullName, prNumber, commentRecord.pairedPr);
    deleteCommentRecord(repoFullName, commentRecord.pairedPr, prNumber);
  }
}
