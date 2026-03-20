// pull_request.synchronize handler.
import type { Context } from "probot";

import { runAnalysis } from "../analysis/run";
import { deletePRFiles } from "../store/prFiles";

export async function synchronizeHandler(
  context: Context<"pull_request">,
): Promise<void> {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;
  const prNumber = context.payload.pull_request.number;
  const headSha = context.payload.pull_request.head.sha;
  const repoFullName = `${owner}/${repo}`;

  context.log.debug(
    { owner, repo, prNumber, headSha },
    "Handling pull_request.synchronize",
  );

  deletePRFiles(repoFullName, prNumber);

  void runAnalysis(context.octokit, owner, repo, prNumber).catch((error) => {
    context.log.error(error, "pull_request.synchronize analysis failed");
  });
}
