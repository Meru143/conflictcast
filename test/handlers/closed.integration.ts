import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupDatabaseFiles,
  closeLoadedDatabase,
  createLoadedProbot,
  createTestDatabasePath,
  loadJsonFixture,
  mockInstallationToken,
} from "./testUtils";

describe("pull_request.closed integration", () => {
  let databasePath: string;

  beforeEach(() => {
    nock.disableNetConnect();
    databasePath = createTestDatabasePath();
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await closeLoadedDatabase();
    await cleanupDatabaseFiles(databasePath);
  });

  it("deletes stored paired comments when a pull request closes", async () => {
    const payload = await loadJsonFixture<Record<string, unknown>>("pull_request_closed.json");

    process.env.DATABASE_PATH = databasePath;
    vi.resetModules();
    const dbModule = await import("../../src/store/db");
    const { upsertComment } = await import("../../src/store/comments");

    upsertComment("owner/repo", 1, 2, 77);
    upsertComment("owner/repo", 2, 1, 88);
    dbModule.db.close();

    const probot = await createLoadedProbot(databasePath);
    const authScope = mockInstallationToken();
    const deleteScope = nock("https://api.github.com")
      .delete("/repos/owner/repo/issues/comments/77")
      .reply(204);

    await probot.receive({
      id: "3",
      name: "pull_request",
      payload,
    });

    await vi.waitFor(() => {
      expect(authScope.isDone()).toBe(true);
      expect(deleteScope.isDone()).toBe(true);
    });
  });
});
