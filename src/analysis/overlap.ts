// File set overlap computation.
import { minimatch } from "minimatch";

export function computeFileOverlap(
  files1: string[],
  files2: string[],
  ignorePatterns: string[],
): { sharedFiles: string[]; riskLevel: "NONE" | "LOW" } {
  const shouldIgnore = (file: string) =>
    ignorePatterns.some((pattern) => minimatch(file, pattern));

  const filteredFiles1 = files1.filter((file) => !shouldIgnore(file));
  const filteredFiles2 = files2.filter((file) => !shouldIgnore(file));

  const fileSet2 = new Set(filteredFiles2);
  const sharedFiles = [...new Set(filteredFiles1)]
    .filter((file) => fileSet2.has(file))
    .sort();

  return {
    sharedFiles,
    riskLevel: sharedFiles.length === 0 ? "NONE" : "LOW",
  };
}
