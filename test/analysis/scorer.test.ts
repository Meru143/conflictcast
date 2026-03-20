import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scoreOverlap } from "../../src/analysis/scorer";
import type { ConflictcastConfig, PRFileSet } from "../../src/utils/types";

const diffFixture = (fileName: string) =>
  readFile(path.join(process.cwd(), "test", "fixtures", "diffs", fileName), "utf-8");

const baseConfig: ConflictcastConfig = {
  ignoreFiles: [],
  threshold: "line",
  commentOnLow: false,
  failCheck: false,
  maxOpenPRsToAnalyze: 50,
};

const pr1Files: PRFileSet = {
  prNumber: 1,
  headSha: "sha-1",
  files: ["src/auth/middleware.ts"],
  fetchedAt: Date.now(),
};

const pr2Files: PRFileSet = {
  prNumber: 2,
  headSha: "sha-2",
  files: ["src/auth/middleware.ts"],
  fetchedAt: Date.now(),
};

describe("scoreOverlap", () => {
  it("returns LOW in file threshold mode for any shared file", () => {
    const result = scoreOverlap(pr1Files, pr2Files, "", "", {
      ...baseConfig,
      threshold: "file",
    });

    expect(result.riskLevel).toBe("LOW");
    expect(result.conflictingHunks).toEqual([]);
  });

  it("returns HIGH in line threshold mode when hunk overlap is confirmed", async () => {
    const [pr1Diff, pr2Diff] = await Promise.all([
      diffFixture("pr1.diff"),
      diffFixture("pr2.diff"),
    ]);

    const result = scoreOverlap(pr1Files, pr2Files, pr1Diff, pr2Diff, baseConfig);

    expect(result.riskLevel).toBe("HIGH");
    expect(result.conflictingHunks).toHaveLength(1);
    expect(result.conflictingHunks[0]).toMatchObject({
      file: "src/auth/middleware.ts",
      pr1Lines: [10, 12],
      pr2Lines: [11, 13],
    });
  });
});
