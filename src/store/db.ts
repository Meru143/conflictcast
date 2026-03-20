// better-sqlite3 connection + migrations.
import Database from "better-sqlite3";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./conflictcast.db";

const migrations = [
  `
    CREATE TABLE IF NOT EXISTS pr_files (
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      head_sha TEXT NOT NULL,
      files TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (repo_full_name, pr_number)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pr_comments (
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      paired_pr_number INTEGER NOT NULL,
      comment_id INTEGER NOT NULL,
      PRIMARY KEY (repo_full_name, pr_number, paired_pr_number)
    )
  `,
];

export const db = new Database(DATABASE_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDb(): void {
  for (const migration of migrations) {
    db.prepare(migration).run();
  }
}

initDb();
