// CRUD for stored comment IDs.
import { db } from "./db";

type CommentRow = {
  paired_pr_number: number;
  comment_id: number;
};

const upsertStatement = db.prepare(`
  INSERT INTO pr_comments (repo_full_name, pr_number, paired_pr_number, comment_id)
  VALUES (@repo_full_name, @pr_number, @paired_pr_number, @comment_id)
  ON CONFLICT(repo_full_name, pr_number, paired_pr_number) DO UPDATE SET
    comment_id = excluded.comment_id
`);

const getStatement = db.prepare<[string, number, number], { comment_id: number }>(
  `
    SELECT comment_id
    FROM pr_comments
    WHERE repo_full_name = ? AND pr_number = ? AND paired_pr_number = ?
  `,
);

const deleteStatement = db.prepare(`
  DELETE FROM pr_comments
  WHERE repo_full_name = ? AND pr_number = ? AND paired_pr_number = ?
`);

const getForPRStatement = db.prepare<[string, number], CommentRow>(
  `
    SELECT paired_pr_number, comment_id
    FROM pr_comments
    WHERE repo_full_name = ? AND pr_number = ?
    ORDER BY paired_pr_number ASC
  `,
);

export function upsertComment(
  repo: string,
  prNumber: number,
  pairedPr: number,
  commentId: number,
): void {
  upsertStatement.run({
    repo_full_name: repo,
    pr_number: prNumber,
    paired_pr_number: pairedPr,
    comment_id: commentId,
  });
}

export function getComment(
  repo: string,
  prNumber: number,
  pairedPr: number,
): number | null {
  const row = getStatement.get(repo, prNumber, pairedPr);
  return row?.comment_id ?? null;
}

export function deleteCommentRecord(
  repo: string,
  prNumber: number,
  pairedPr: number,
): void {
  deleteStatement.run(repo, prNumber, pairedPr);
}

export function getCommentsForPR(
  repo: string,
  prNumber: number,
): { pairedPr: number; commentId: number }[] {
  return getForPRStatement.all(repo, prNumber).map((row) => ({
    pairedPr: row.paired_pr_number,
    commentId: row.comment_id,
  }));
}
