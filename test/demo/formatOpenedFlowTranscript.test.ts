import { describe, expect, it } from "vitest";

import { formatOpenedFlowTranscript, type OpenedFlowCapture } from "../../src/demo/formatOpenedFlowTranscript";

describe("formatOpenedFlowTranscript", () => {
  it("formats a concise terminal transcript for the opened-flow demo", () => {
    const capture: OpenedFlowCapture = {
      action: "opened",
      repository: "owner/repo",
      sourceFixtures: ["pull_request_opened.json", "pr1.diff", "pr2.diff"],
      triggeringPr: 1,
      triggeringHeadSha: "pr-1-head",
      comparedPullRequests: [2],
      checkRuns: [
        {
          headSha: "pr-2-head",
          conclusion: "neutral",
          title: "Predicted merge conflict risk detected",
          summary: "| PR Pair | Risk | Shared Files |\n| --- | --- | --- |\n| #1 vs #2 | HIGH | src/auth/middleware.ts |",
          text: "PR #1 and PR #2 overlap on 1 hunk(s).",
          annotations: [
            {
              path: "src/auth/middleware.ts",
              startLine: 10,
              endLine: 12,
              message: "Potential overlap between PR #1 and PR #2",
            },
          ],
        },
      ],
      comments: [
        {
          issueNumber: 1,
          body: [
            "⚠️ **Potential Merge Conflict Detected**",
            "",
            "Risk level: **HIGH**",
            "",
            "Competing PR: [#2](https://github.com/owner/repo/pull/2)",
            "",
            "### Line range overlaps",
            "- `src/auth/middleware.ts`: PR #1 lines 10-12 vs PR #2 lines 11-13",
          ].join("\n"),
        },
      ],
    };

    const transcript = formatOpenedFlowTranscript(capture);

    expect(transcript).toContain("conflictcast demo: pull_request.opened high-risk replay");
    expect(transcript).toContain("- triggering pr: #1 (pr-1-head)");
    expect(transcript).toContain("emitted GitHub output");
    expect(transcript).toContain("- check run on pr-2-head -> neutral / Predicted merge conflict risk detected");
    expect(transcript).toContain("- comment on PR #1 -> competing PR #2");
    expect(transcript).toContain("check summary");
    expect(transcript).toContain("comment excerpt");
    expect(transcript).toContain("| #1 vs #2 | HIGH | src/auth/middleware.ts |");
    expect(transcript).toContain("Risk level: **HIGH**");
    expect(transcript).toContain("PR #1 lines 10-12 vs PR #2 lines 11-13");
  });
});
