import { describe, expect, it } from "vitest";

import { computeFileOverlap } from "../../src/analysis/overlap";

describe("computeFileOverlap", () => {
  it("returns LOW with every shared file for identical file sets", () => {
    const result = computeFileOverlap(
      ["src/index.ts", "src/config/repo.ts"],
      ["src/index.ts", "src/config/repo.ts"],
      [],
    );

    expect(result).toEqual({
      sharedFiles: ["src/config/repo.ts", "src/index.ts"],
      riskLevel: "LOW",
    });
  });

  it("returns NONE for disjoint file sets", () => {
    const result = computeFileOverlap(
      ["src/index.ts"],
      ["src/config/repo.ts"],
      [],
    );

    expect(result).toEqual({
      sharedFiles: [],
      riskLevel: "NONE",
    });
  });

  it("excludes ignored files before overlap analysis", () => {
    const result = computeFileOverlap(
      ["package-lock.json", "src/index.ts"],
      ["package-lock.json", "src/index.ts"],
      ["package-lock.json"],
    );

    expect(result).toEqual({
      sharedFiles: ["src/index.ts"],
      riskLevel: "LOW",
    });
  });
});
