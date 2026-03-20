// Runs full conflict analysis for a triggering pull request.
import { createConflictCheck } from "../github/checks";
import {
  deleteConflictComment,
  postConflictComment,
  updateConflictComment,
} from "../github/comments";
import {
  getPRDiff,
  getPRFiles as getGitHubPRFiles,
  listOpenPRs,
  type PullRequest,
} from "../github/pulls";
import {
  deleteCommentRecord,
  getComment,
  getCommentsForPR,
  upsertComment,
} from "../store/comments";
import { getPRFiles as getCachedPRFiles, upsertPRFiles } from "../store/prFiles";
import { loadRepoConfig } from "../config/repo";
import { scoreOverlap } from "./scorer";
import type { ConflictcastOctokit, OverlapScore, PRFileSet } from "../utils/types";
import logger from "../utils/logger";

const PR_FILE_CACHE_TTL_MS = 60_000;

function getRepoFullName(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function isHttpStatusError(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  );
}

async function safeCreateCheck(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  headSha: string,
  results: OverlapScore[],
  failCheck: boolean,
): Promise<void> {
  try {
    await createConflictCheck(octokit, owner, repo, headSha, results, failCheck);
  } catch (error) {
    if (isHttpStatusError(error, 403)) {
      logger.warn(
        { err: error, owner, repo, code: "CF001" },
        "Skipping conflict check creation because checks:write is unavailable",
      );
      return;
    }

    throw error;
  }
}

function isCacheFresh(cached: PRFileSet, headSha: string): boolean {
  return cached.headSha === headSha && Date.now() - cached.fetchedAt <= PR_FILE_CACHE_TTL_MS;
}

async function loadPRFileSet(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  pullRequest: PullRequest,
  alwaysRefresh: boolean,
): Promise<PRFileSet> {
  const repoFullName = getRepoFullName(owner, repo);
  const cached = getCachedPRFiles(repoFullName, pullRequest.number);

  if (!alwaysRefresh && cached && isCacheFresh(cached, pullRequest.head.sha)) {
    return cached;
  }

  const files = await getGitHubPRFiles(octokit, owner, repo, pullRequest.number);

  try {
    upsertPRFiles(repoFullName, pullRequest.number, pullRequest.head.sha, files);
  } catch (error) {
    logger.error(
      { err: error, repoFullName, prNumber: pullRequest.number, code: "CF004" },
      "Failed to persist PR file cache entry",
    );
  }

  return {
    prNumber: pullRequest.number,
    headSha: pullRequest.head.sha,
    files,
    fetchedAt: Date.now(),
  };
}

async function ensureConflictComment(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  targetPrNumber: number,
  pairedPrNumber: number,
  score: OverlapScore,
): Promise<void> {
  const repoFullName = getRepoFullName(owner, repo);
  const existingCommentId = getComment(repoFullName, pairedPrNumber, targetPrNumber);

  if (existingCommentId !== null) {
    await updateConflictComment(octokit, owner, repo, existingCommentId, score);
    return;
  }

  const commentId = await postConflictComment(
    octokit,
    owner,
    repo,
    targetPrNumber,
    pairedPrNumber,
    score,
  );

  upsertComment(repoFullName, pairedPrNumber, targetPrNumber, commentId);
}

async function deletePairComments(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  prNumber: number,
  pairedPrNumber: number,
): Promise<void> {
  const repoFullName = getRepoFullName(owner, repo);
  const pairedCommentId = getComment(repoFullName, prNumber, pairedPrNumber);
  const currentCommentId = getComment(repoFullName, pairedPrNumber, prNumber);

  if (pairedCommentId !== null) {
    await deleteConflictComment(octokit, owner, repo, pairedCommentId);
    deleteCommentRecord(repoFullName, prNumber, pairedPrNumber);
  }

  if (currentCommentId !== null) {
    await deleteConflictComment(octokit, owner, repo, currentCommentId);
    deleteCommentRecord(repoFullName, pairedPrNumber, prNumber);
  }
}

async function postTooManyOpenPrsComment(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  prNumber: number,
  maxOpenPRsToAnalyze: number,
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: [
      "ℹ️ **conflictcast analysis skipped**",
      "",
      `Code: \`CF005\``,
      `Open PR count exceeds the configured cap of ${maxOpenPRsToAnalyze}, so conflict analysis was skipped for this run.`,
    ].join("\n"),
  });
}

export async function runAnalysis(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
  triggeringPR: number,
): Promise<void> {
  const config = await loadRepoConfig(octokit, owner, repo);
  const openPRs = (await listOpenPRs(octokit, owner, repo)).filter((pullRequest) => !pullRequest.draft);
  const triggeringPullRequest = openPRs.find((pullRequest) => pullRequest.number === triggeringPR);

  if (!triggeringPullRequest) {
    return;
  }

  if (openPRs.length > config.maxOpenPRsToAnalyze) {
    await postTooManyOpenPrsComment(
      octokit,
      owner,
      repo,
      triggeringPR,
      config.maxOpenPRsToAnalyze,
    );
    return;
  }

  const triggeringFileSet = await loadPRFileSet(
    octokit,
    owner,
    repo,
    triggeringPullRequest,
    true,
  );

  const scores: OverlapScore[] = [];
  const activeCommentPairs = new Set<number>();

  const triggeringDiff =
    config.threshold === "line"
      ? await getPRDiff(octokit, owner, repo, triggeringPullRequest.number)
      : "";

  for (const otherPullRequest of openPRs) {
    if (otherPullRequest.number === triggeringPR) {
      continue;
    }

    const otherFileSet = await loadPRFileSet(
      octokit,
      owner,
      repo,
      otherPullRequest,
      false,
    );

    const otherDiff =
      config.threshold === "line"
        ? await getPRDiff(octokit, owner, repo, otherPullRequest.number)
        : "";

    const score = scoreOverlap(
      triggeringFileSet,
      otherFileSet,
      triggeringDiff,
      otherDiff,
      config,
    );

    scores.push(score);

    const shouldComment = score.riskLevel === "HIGH" || config.commentOnLow;

    if (shouldComment && score.riskLevel !== "NONE") {
      activeCommentPairs.add(otherPullRequest.number);

      await ensureConflictComment(
        octokit,
        owner,
        repo,
        triggeringPR,
        otherPullRequest.number,
        score,
      );
      await ensureConflictComment(
        octokit,
        owner,
        repo,
        otherPullRequest.number,
        triggeringPR,
        score,
      );

      await safeCreateCheck(
        octokit,
        owner,
        repo,
        otherPullRequest.head.sha,
        [score],
        config.failCheck,
      );
    }
  }

  const existingCommentRecords = getCommentsForPR(getRepoFullName(owner, repo), triggeringPR);

  for (const existingCommentRecord of existingCommentRecords) {
    if (!activeCommentPairs.has(existingCommentRecord.pairedPr)) {
      await deletePairComments(
        octokit,
        owner,
        repo,
        triggeringPR,
        existingCommentRecord.pairedPr,
      );
    }
  }

  await safeCreateCheck(
    octokit,
    owner,
    repo,
    triggeringPullRequest.head.sha,
    scores,
    config.failCheck,
  );
}
