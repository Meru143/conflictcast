// Shared TypeScript interfaces.
import type { Context } from "probot";

export type ConflictcastOctokit = Context["octokit"];

export interface PRFileSet {
  prNumber: number;
  headSha: string;
  files: string[];
  fetchedAt: number;
}

export interface HunkConflict {
  file: string;
  pr1Lines: [number, number];
  pr2Lines: [number, number];
}

export interface OverlapScore {
  pr1: number;
  pr2: number;
  sharedFiles: string[];
  riskLevel: "LOW" | "HIGH" | "NONE";
  conflictingHunks: HunkConflict[];
}

export interface ConflictcastConfig {
  ignoreFiles: string[];
  threshold: "file" | "line";
  commentOnLow: boolean;
  failCheck: boolean;
  maxOpenPRsToAnalyze: number;
}
