// Line range overlap from parsed diffs.
import parseDiff from "parse-diff";

type ParsedDiffFile = parseDiff.File & { isBinary?: boolean };

function normalizeDiffPath(filePath: string): string {
  if (filePath === "/dev/null") {
    return filePath;
  }

  return filePath.replace(/^[ab]\//, "");
}

export function extractHunkRanges(diffText: string): Map<string, [number, number][]> {
  const files = parseDiff(diffText);
  const ranges = new Map<string, [number, number][]>();

  for (const parsedFile of files as ParsedDiffFile[]) {
    const filePath = normalizeDiffPath(parsedFile.to ?? parsedFile.from ?? "");

    if (!filePath) {
      continue;
    }

    if (parsedFile.isBinary) {
      ranges.set(filePath, []);
      continue;
    }

    const fileRanges = parsedFile.chunks.map(
      (chunk): [number, number] => [
        chunk.newStart,
        chunk.newStart + Math.max(chunk.newLines - 1, 0),
      ],
    );

    ranges.set(filePath, fileRanges);
  }

  return ranges;
}

export function detectHunkOverlap(
  ranges1: [number, number][],
  ranges2: [number, number][],
): [number, number][] | null {
  const overlaps: [number, number][] = [];

  for (const [start1, end1] of ranges1) {
    for (const [start2, end2] of ranges2) {
      if (start1 <= end2 && start2 <= end1) {
        overlaps.push([Math.max(start1, start2), Math.min(end1, end2)]);
      }
    }
  }

  return overlaps.length > 0 ? overlaps : null;
}
