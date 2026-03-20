// Wrappers around Octokit checks API calls.
import type { ConflictcastOctokit, OverlapScore } from "../utils/types";

type CheckConclusion = "neutral" | "failure";

type CheckOutput = {
  title: string;
  summary: string;
  text: string;
  annotations: {
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: "warning";
    message: string;
  }[];
};

function getCheckConclusion(
  results: OverlapScore[],
  failCheck: boolean,
): CheckConclusion {
  const hasHighRisk = results.some((result) => result.riskLevel === "HIGH");

  if (!hasHighRisk) {
    return "neutral";
  }

  return failCheck ? "failure" : "neutral";
}

function buildSummaryTable(results: OverlapScore[]): string {
  const relevantResults = results.filter((result) => result.riskLevel !== "NONE");

  if (relevantResults.length === 0) {
    return "No conflicting PR pairs were detected.";
  }

  const lines = [
    "| PR Pair | Risk | Shared Files |",
    "| --- | --- | --- |",
    ...relevantResults.map(
      (result) =>
        `| #${result.pr1} vs #${result.pr2} | ${result.riskLevel} | ${result.sharedFiles.join(", ")} |`,
    ),
  ];

  return lines.join("\n");
}

function buildCheckOutput(results: OverlapScore[]): CheckOutput {
  const highRiskResults = results.filter((result) => result.riskLevel === "HIGH");

  if (highRiskResults.length === 0) {
    return {
      title: "No predicted merge conflicts",
      summary: buildSummaryTable(results),
      text: "conflictcast did not detect any HIGH-risk pull request pairs for this head commit.",
      annotations: [],
    };
  }

  return {
    title: "Predicted merge conflict risk detected",
    summary: buildSummaryTable(results),
    text: highRiskResults
      .map(
        (result) =>
          `PR #${result.pr1} and PR #${result.pr2} overlap on ${result.conflictingHunks.length} hunk(s).`,
      )
      .join("\n"),
    annotations: highRiskResults.flatMap((result) =>
      result.conflictingHunks.map((conflict) => ({
        path: conflict.file,
        start_line: conflict.pr1Lines[0],
        end_line: conflict.pr1Lines[1],
        annotation_level: "warning" as const,
        message: `Potential overlap between PR #${result.pr1} and PR #${result.pr2}`,
      })),
    ),
  };
}

export async function createConflictCheck(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  headSha: string,
  results: OverlapScore[],
  failCheck = false,
): Promise<number> {
  const response = await octokit.rest.checks.create({
    owner,
    repo,
    name: "conflictcast",
    head_sha: headSha,
    status: "completed",
    conclusion: getCheckConclusion(results, failCheck),
    output: buildCheckOutput(results),
  });

  return response.data.id;
}

export async function updateConflictCheck(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  checkRunId: number,
  results: OverlapScore[],
  failCheck = false,
): Promise<void> {
  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "completed",
    conclusion: getCheckConclusion(results, failCheck),
    output: buildCheckOutput(results),
  });
}
