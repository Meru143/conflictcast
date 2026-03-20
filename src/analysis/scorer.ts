// Combines file + line overlap into risk score.
import { computeFileOverlap } from "./overlap";
import { detectHunkOverlap, extractHunkRanges } from "./hunk";
import type { ConflictcastConfig, HunkConflict, OverlapScore, PRFileSet } from "../utils/types";

export function scoreOverlap(
  pr1Files: PRFileSet,
  pr2Files: PRFileSet,
  diff1: string,
  diff2: string,
  config: ConflictcastConfig,
): OverlapScore {
  const fileOverlap = computeFileOverlap(
    pr1Files.files,
    pr2Files.files,
    config.ignoreFiles,
  );

  if (fileOverlap.riskLevel === "NONE") {
    return {
      pr1: pr1Files.prNumber,
      pr2: pr2Files.prNumber,
      sharedFiles: [],
      riskLevel: "NONE",
      conflictingHunks: [],
    };
  }

  if (config.threshold === "file") {
    return {
      pr1: pr1Files.prNumber,
      pr2: pr2Files.prNumber,
      sharedFiles: fileOverlap.sharedFiles,
      riskLevel: "LOW",
      conflictingHunks: [],
    };
  }

  const diffRanges1 = extractHunkRanges(diff1);
  const diffRanges2 = extractHunkRanges(diff2);
  const conflictingHunks: HunkConflict[] = [];

  for (const sharedFile of fileOverlap.sharedFiles) {
    const ranges1 = diffRanges1.get(sharedFile) ?? [];
    const ranges2 = diffRanges2.get(sharedFile) ?? [];

    if (!detectHunkOverlap(ranges1, ranges2)) {
      continue;
    }

    for (const pr1Range of ranges1) {
      for (const pr2Range of ranges2) {
        if (pr1Range[0] <= pr2Range[1] && pr2Range[0] <= pr1Range[1]) {
          conflictingHunks.push({
            file: sharedFile,
            pr1Lines: pr1Range,
            pr2Lines: pr2Range,
          });
        }
      }
    }
  }

  return {
    pr1: pr1Files.prNumber,
    pr2: pr2Files.prNumber,
    sharedFiles: fileOverlap.sharedFiles,
    riskLevel: conflictingHunks.length > 0 ? "HIGH" : "LOW",
    conflictingHunks,
  };
}
