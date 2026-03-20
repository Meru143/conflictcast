import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupDatabaseFiles,
  closeLoadedDatabase,
  createLoadedProbot,
  createTestDatabasePath,
  loadDiffFixture,
  loadJsonFixture,
  mockInstallationToken,
} from "./testUtils";

describe("pull_request.synchronize integration", () => {
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

  it("updates existing comments and creates a check for the new head sha", async () => {
    const [payload, pr1Diff, pr2Diff] = await Promise.all([
      loadJsonFixture<Record<string, unknown>>("pull_request_synchronize.json"),
      loadDiffFixture("pr1.diff"),
      loadDiffFixture("pr2.diff"),
    ]);

    process.env.DATABASE_PATH = databasePath;
    vi.resetModules();
    const dbModule = await import("../../src/store/db");
    const { upsertPRFiles } = await import("../../src/store/prFiles");
    const { upsertComment } = await import("../../src/store/comments");

    upsertPRFiles("owner/repo", 1, "pr-1-head", ["src/auth/middleware.ts"]);
    upsertComment("owner/repo", 1, 2, 9001);
    upsertComment("owner/repo", 2, 1, 9002);
    dbModule.db.close();

    const probot = await createLoadedProbot(databasePath);
    const authScope = mockInstallationToken();
    const api = nock("https://api.github.com");
    const createdCheckBodies: Array<Record<string, unknown>> = [];

    const configScope = api
      .get(/\/repos\/owner\/repo\/contents\/.*conflictcast\.yml/)
      .reply(404, { message: "Not Found" });
    const pullsScope = api.get("/repos/owner/repo/pulls").query(true).reply(200, [
      {
        number: 1,
        draft: false,
        head: { sha: "pr-1-head" },
        base: { ref: "main" },
      },
      {
        number: 2,
        draft: false,
        head: { sha: "pr-2-head-updated" },
        base: { ref: "main" },
      },
    ]);
    const files2Scope = api
      .get("/repos/owner/repo/pulls/2/files")
      .query(true)
      .reply(200, [{ filename: "src/auth/middleware.ts" }]);
    const diff2Scope = api.get("/repos/owner/repo/pulls/2").query(true).reply(200, pr2Diff);
    const diff1Scope = api.get("/repos/owner/repo/pulls/1").query(true).reply(200, pr1Diff);
    const commentUpdate1Scope = api
      .patch("/repos/owner/repo/issues/comments/9001")
      .reply(200, { id: 9001 });
    const commentUpdate2Scope = api
      .patch("/repos/owner/repo/issues/comments/9002")
      .reply(200, { id: 9002 });
    const checksScope = api
      .post("/repos/owner/repo/check-runs", (body) => {
        createdCheckBodies.push(body as Record<string, unknown>);
        return true;
      })
      .twice()
      .reply(201, { id: 1 });

    await probot.receive({
      id: "2",
      name: "pull_request",
      payload,
    });

    await vi.waitFor(
      () => {
        expect(authScope.isDone()).toBe(true);
        expect(pullsScope.isDone()).toBe(true);
        expect(files2Scope.isDone()).toBe(true);
        expect(diff1Scope.isDone()).toBe(true);
        expect(diff2Scope.isDone()).toBe(true);
        expect(commentUpdate1Scope.isDone()).toBe(true);
        expect(commentUpdate2Scope.isDone()).toBe(true);
        expect(checksScope.isDone()).toBe(true);
      },
      { timeout: 10000 },
    );

    expect(
      createdCheckBodies.some((body) => body.head_sha === "pr-2-head-updated"),
    ).toBe(true);
  }, 10000);
});
