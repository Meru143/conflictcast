import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { detectHunkOverlap, extractHunkRanges } from "../../src/analysis/hunk";

const diffFixture = (fileName: string) =>
  readFile(path.join(process.cwd(), "test", "fixtures", "diffs", fileName), "utf-8");

describe("hunk analysis", () => {
  it("detects overlapping hunks from diff fixtures", async () => {
    const [pr1Diff, pr2Diff] = await Promise.all([
      diffFixture("pr1.diff"),
      diffFixture("pr2.diff"),
    ]);
    const ranges1 = extractHunkRanges(pr1Diff);
    const ranges2 = extractHunkRanges(pr2Diff);

    expect(
      detectHunkOverlap(
        ranges1.get("src/auth/middleware.ts") ?? [],
        ranges2.get("src/auth/middleware.ts") ?? [],
      ),
    ).toEqual([[11, 12]]);
  });

  it("returns null for non-overlapping hunks in the same file", async () => {
    const [pr1Diff, pr3Diff] = await Promise.all([
      diffFixture("pr1.diff"),
      diffFixture("pr3.diff"),
    ]);
    const ranges1 = extractHunkRanges(pr1Diff);
    const ranges3 = extractHunkRanges(pr3Diff);

    expect(
      detectHunkOverlap(
        ranges1.get("src/auth/middleware.ts") ?? [],
        ranges3.get("src/auth/middleware.ts") ?? [],
      ),
    ).toBeNull();
  });

  it("returns an empty range array for binary diffs", async () => {
    const binaryDiff = await diffFixture("binary.diff");
    const ranges = extractHunkRanges(binaryDiff);

    expect(ranges.get("assets/logo.png")).toEqual([]);
  });
});
