// CRUD for PR file list cache.
import { db } from "./db";
import type { PRFileSet } from "../utils/types";

type PRFileRow = {
  repo_full_name: string;
  pr_number: number;
  head_sha: string;
  files: string;
  fetched_at: number;
};

const upsertStatement = db.prepare(`
  INSERT INTO pr_files (repo_full_name, pr_number, head_sha, files, fetched_at)
  VALUES (@repo_full_name, @pr_number, @head_sha, @files, @fetched_at)
  ON CONFLICT(repo_full_name, pr_number) DO UPDATE SET
    head_sha = excluded.head_sha,
    files = excluded.files,
    fetched_at = excluded.fetched_at
`);

const getStatement = db.prepare<[string, number], PRFileRow>(
  `
    SELECT repo_full_name, pr_number, head_sha, files, fetched_at
    FROM pr_files
    WHERE repo_full_name = ? AND pr_number = ?
  `,
);

const deleteStatement = db.prepare(`
  DELETE FROM pr_files
  WHERE repo_full_name = ? AND pr_number = ?
`);

const getAllStatement = db.prepare<[string], PRFileRow>(
  `
    SELECT repo_full_name, pr_number, head_sha, files, fetched_at
    FROM pr_files
    WHERE repo_full_name = ?
    ORDER BY pr_number ASC
  `,
);

function mapRowToPRFileSet(row: PRFileRow): PRFileSet {
  return {
    prNumber: row.pr_number,
    headSha: row.head_sha,
    files: JSON.parse(row.files) as string[],
    fetchedAt: row.fetched_at,
  };
}

export function upsertPRFiles(
  repo: string,
  prNumber: number,
  headSha: string,
  files: string[],
): void {
  upsertStatement.run({
    repo_full_name: repo,
    pr_number: prNumber,
    head_sha: headSha,
    files: JSON.stringify(files),
    fetched_at: Date.now(),
  });
}

export function getPRFiles(repo: string, prNumber: number): PRFileSet | null {
  const row = getStatement.get(repo, prNumber);
  return row ? mapRowToPRFileSet(row) : null;
}

export function deletePRFiles(repo: string, prNumber: number): void {
  deleteStatement.run(repo, prNumber);
}

export function getAllOpenPRFiles(repo: string): PRFileSet[] {
  return getAllStatement.all(repo).map(mapRowToPRFileSet);
}
