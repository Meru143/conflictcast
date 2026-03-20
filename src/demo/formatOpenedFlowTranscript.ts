// Formats captured pull_request.opened demo output into a terminal transcript.
export type DemoCheckRun = {
  headSha: string;
  conclusion: string;
  title: string;
  summary: string;
  text: string;
  annotations: {
    path: string;
    startLine: number;
    endLine: number;
    message: string;
  }[];
};

export type DemoComment = {
  issueNumber: number;
  body: string;
};

export type OpenedFlowCapture = {
  action: string;
  repository: string;
  sourceFixtures: string[];
  triggeringPr: number;
  triggeringHeadSha: string;
  comparedPullRequests: number[];
  checkRuns: DemoCheckRun[];
  comments: DemoComment[];
};

function indentBlock(text: string, indent = "    "): string {
  return text
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function formatCommentPreview(comment: DemoComment): string {
  const lines = comment.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const preview = [
    lines[0],
    lines.find((line) => line.startsWith("Risk level:")),
    lines.find((line) => line.startsWith("Competing PR:")),
    lines.find((line) => line.startsWith("- `")) ??
      lines.find((line) => line.startsWith("- No overlapping")),
  ].filter((line): line is string => Boolean(line));

  return indentBlock(preview.join("\n"), "  ");
}

function formatEmittedOutput(capture: OpenedFlowCapture): string[] {
  const checkLines = capture.checkRuns.map(
    (checkRun) =>
      `- check run on ${checkRun.headSha} -> ${checkRun.conclusion} / ${checkRun.title}`,
  );
  const commentLines = capture.comments.map((comment) => {
    const competingPr = comment.body.match(/Competing PR: \[#(\d+)/)?.[1] ?? "?";
    return `- comment on PR #${comment.issueNumber} -> competing PR #${competingPr}`;
  });

  return [...checkLines, ...commentLines];
}

export function formatOpenedFlowTranscript(capture: OpenedFlowCapture): string {
  const primaryCheckRun = capture.checkRuns[0];
  const primaryComment = capture.comments[0];

  if (!primaryCheckRun || !primaryComment) {
    return [
      "conflictcast demo: pull_request.opened replay",
      "result: no GitHub output was captured.",
    ].join("\n");
  }

  return [
    "conflictcast demo: pull_request.opened high-risk replay",
    `captured fixtures: ${capture.sourceFixtures.join(", ")}`,
    "",
    "event",
    `- repository: ${capture.repository}`,
    `- triggering pr: #${capture.triggeringPr} (${capture.triggeringHeadSha})`,
    `- compared pull requests: ${capture.comparedPullRequests.map((pr) => `#${pr}`).join(", ")}`,
    "",
    "emitted GitHub output",
    ...formatEmittedOutput(capture),
    "",
    "check summary",
    indentBlock(primaryCheckRun.summary, "  "),
    "",
    "comment excerpt",
    formatCommentPreview(primaryComment),
    "",
    `result: conflictcast would publish ${capture.checkRuns.length} check run(s) and ${capture.comments.length} comment(s) for this webhook event.`,
  ].join("\n");
}
