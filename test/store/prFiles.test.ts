import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDatabasePath = process.env.DATABASE_PATH;

describe("prFiles store", () => {
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
    const prFilesModule = await import("../../src/store/prFiles");
    db = dbModule.db;

    prFilesModule.upsertPRFiles("owner/repo", 1, "sha-1", ["src/index.ts"]);

    expect(prFilesModule.getPRFiles("owner/repo", 1)).toMatchObject({
      prNumber: 1,
      headSha: "sha-1",
      files: ["src/index.ts"],
    });
  });

  it("removes rows when deletePRFiles is called", async () => {
    const dbModule = await import("../../src/store/db");
    const prFilesModule = await import("../../src/store/prFiles");
    db = dbModule.db;

    prFilesModule.upsertPRFiles("owner/repo", 1, "sha-1", ["src/index.ts"]);
    prFilesModule.deletePRFiles("owner/repo", 1);

    expect(prFilesModule.getPRFiles("owner/repo", 1)).toBeNull();
  });

  it("returns all rows for a repository", async () => {
    const dbModule = await import("../../src/store/db");
    const prFilesModule = await import("../../src/store/prFiles");
    db = dbModule.db;

    prFilesModule.upsertPRFiles("owner/repo", 1, "sha-1", ["src/index.ts"]);
    prFilesModule.upsertPRFiles("owner/repo", 2, "sha-2", ["src/config/repo.ts"]);

    expect(prFilesModule.getAllOpenPRFiles("owner/repo")).toHaveLength(2);
  });
});
