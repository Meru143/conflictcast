// pull_request.opened handler.
import type { Context } from "probot";

import { runAnalysis } from "../analysis/run";

export async function openedHandler(context: Context<"pull_request">): Promise<void> {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;
  const prNumber = context.payload.pull_request.number;
  const headSha = context.payload.pull_request.head.sha;

  context.log.debug({ owner, repo, prNumber, headSha }, "Handling pull_request.opened");

  void runAnalysis(context.octokit, owner, repo, prNumber).catch((error) => {
    context.log.error(error, "pull_request.opened analysis failed");
  });
}
