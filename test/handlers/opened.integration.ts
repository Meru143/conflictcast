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

describe("pull_request.opened integration", () => {
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

  it("creates checks and comments for overlapping pull requests", async () => {
    const [payload, pr1Diff, pr2Diff] = await Promise.all([
      loadJsonFixture<Record<string, unknown>>("pull_request_opened.json"),
      loadDiffFixture("pr1.diff"),
      loadDiffFixture("pr2.diff"),
    ]);
    const probot = await createLoadedProbot(databasePath);
    const authScope = mockInstallationToken();
    const api = nock("https://api.github.com");

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
        head: { sha: "pr-2-head" },
        base: { ref: "main" },
      },
    ]);
    const files1Scope = api
      .get("/repos/owner/repo/pulls/1/files")
      .query(true)
      .reply(200, [{ filename: "src/auth/middleware.ts" }]);
    const files2Scope = api
      .get("/repos/owner/repo/pulls/2/files")
      .query(true)
      .reply(200, [{ filename: "src/auth/middleware.ts" }]);
    const diff1Scope = api.get("/repos/owner/repo/pulls/1").query(true).reply(200, pr1Diff);
    const diff2Scope = api.get("/repos/owner/repo/pulls/2").query(true).reply(200, pr2Diff);
    const checksScope = api.post("/repos/owner/repo/check-runs").twice().reply(201, { id: 1 });
    const comment1Scope = api
      .post("/repos/owner/repo/issues/1/comments")
      .reply(201, { id: 101 });
    const comment2Scope = api
      .post("/repos/owner/repo/issues/2/comments")
      .reply(201, { id: 102 });

    await probot.receive({
      id: "1",
      name: "pull_request",
      payload,
    });

    await vi.waitFor(
      () => {
        expect(authScope.isDone()).toBe(true);
        expect(pullsScope.isDone()).toBe(true);
        expect(files1Scope.isDone()).toBe(true);
        expect(files2Scope.isDone()).toBe(true);
        expect(diff1Scope.isDone()).toBe(true);
        expect(diff2Scope.isDone()).toBe(true);
        expect(checksScope.isDone()).toBe(true);
        expect(comment1Scope.isDone()).toBe(true);
        expect(comment2Scope.isDone()).toBe(true);
      },
      { timeout: 10000 },
    );

  }, 10000);
});
