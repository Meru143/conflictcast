import { describe, expect, it } from "vitest";

import { captureOpenedFlow } from "../../src/demo/captureOpenedFlow";

describe("captureOpenedFlow", () => {
  it("replays the opened webhook flow and captures published GitHub payloads", async () => {
    const capture = await captureOpenedFlow();

    expect(capture.repository).toBe("owner/repo");
    expect(capture.triggeringPr).toBe(1);
    expect(capture.comparedPullRequests).toEqual([2]);
    expect(capture.checkRuns).toHaveLength(2);
    expect(capture.comments).toHaveLength(2);
    expect(capture.checkRuns[0]?.summary).toContain("| #1 vs #2 | HIGH | src/auth/middleware.ts |");
    expect(capture.comments[0]?.body).toContain("Potential Merge Conflict Detected");
    expect(capture.comments[0]?.body).toContain("PR #1 lines 10-12 vs PR #2 lines 11-13");
  }, 15000);
});
