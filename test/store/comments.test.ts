import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDatabasePath = process.env.DATABASE_PATH;

describe("comments store", () => {
  let db: Database.Database;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    vi.resetModules();
  });

  afterEach(() => {
    db?.close();
    vi.resetModules();

    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
      return;
    }

    process.env.DATABASE_PATH = originalDatabasePath;
  });

  it("supports upsert and get round-trips", async () => {
    const dbModule = await import("../../src/store/db");
    const commentsModule = await import("../../src/store/comments");
    db = dbModule.db;

    commentsModule.upsertComment("owner/repo", 1, 2, 42);

    expect(commentsModule.getComment("owner/repo", 1, 2)).toBe(42);
  });

  it("removes records when deleteCommentRecord is called", async () => {
    const dbModule = await import("../../src/store/db");
    const commentsModule = await import("../../src/store/comments");
    db = dbModule.db;

    commentsModule.upsertComment("owner/repo", 1, 2, 42);
    commentsModule.deleteCommentRecord("owner/repo", 1, 2);

    expect(commentsModule.getComment("owner/repo", 1, 2)).toBeNull();
  });

  it("returns all paired comments for a pull request", async () => {
    const dbModule = await import("../../src/store/db");
    const commentsModule = await import("../../src/store/comments");
    db = dbModule.db;

    commentsModule.upsertComment("owner/repo", 1, 2, 42);
    commentsModule.upsertComment("owner/repo", 1, 3, 43);

    expect(commentsModule.getCommentsForPR("owner/repo", 1)).toEqual([
      { pairedPr: 2, commentId: 42 },
      { pairedPr: 3, commentId: 43 },
    ]);
  });
});
