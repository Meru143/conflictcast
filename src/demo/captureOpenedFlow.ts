// Replays the pull_request.opened fixture and captures the emitted GitHub payloads.
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import nock from "nock";
import { createProbot } from "probot";

import {
  formatOpenedFlowTranscript,
  type DemoCheckRun,
  type OpenedFlowCapture,
} from "./formatOpenedFlowTranscript";

type CheckRunRequestBody = {
  head_sha: string;
  conclusion: string;
  output: {
    title: string;
    summary: string;
    text: string;
    annotations: {
      path: string;
      start_line: number;
      end_line: number;
      message: string;
    }[];
  };
};

type CommentRequestBody = {
  body: string;
};

function createDemoPrivateKey(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

function getFixturePath(kind: "payloads" | "diffs", fileName: string): string {
  return path.join(process.cwd(), "test", "fixtures", kind, fileName);
}

async function loadJsonFixture<T>(fileName: string): Promise<T> {
  const fixturePath = getFixturePath("payloads", fileName);
  return JSON.parse(await readFile(fixturePath, "utf-8")) as T;
}

async function loadDiffFixture(fileName: string): Promise<string> {
  return readFile(getFixturePath("diffs", fileName), "utf-8");
}

function parseRequestBody<T>(requestBody: unknown): T {
  if (typeof requestBody === "string") {
    return JSON.parse(requestBody) as T;
  }

  return requestBody as T;
}

async function waitForScopes(scopes: { isDone(): boolean }[], timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (scopes.every((scope) => scope.isDone())) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    [
      `Timed out waiting for demo webhook replay to finish after ${Date.now() - startedAt}ms`,
      `Pending mocks: ${nock.pendingMocks().join(", ") || "(none)"}`,
    ].join("\n"),
  );
}

async function closeLoadedDatabase(): Promise<void> {
  try {
    const { db } = await import("../store/db");

    if (db.open) {
      db.close();
    }
  } catch {
    // Ignore cleanup failures for runs that never loaded the DB module.
  }
}

async function cleanupDatabaseFiles(databasePath: string): Promise<void> {
  await Promise.all([
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true }),
  ]);
}

function createCheckRunCapture(body: CheckRunRequestBody): DemoCheckRun {
  return {
    headSha: body.head_sha,
    conclusion: body.conclusion,
    title: body.output.title,
    summary: body.output.summary,
    text: body.output.text,
    annotations: body.output.annotations.map((annotation) => ({
      path: annotation.path,
      startLine: annotation.start_line,
      endLine: annotation.end_line,
      message: annotation.message,
    })),
  };
}

function resetDemoModules(): void {
  const moduleIds = [
    "../index",
    "../handlers/opened",
    "../handlers/synchronize",
    "../handlers/closed",
    "../analysis/run",
    "../store/comments",
    "../store/prFiles",
    "../store/db",
  ];

  for (const moduleId of moduleIds) {
    try {
      delete require.cache[require.resolve(moduleId)];
    } catch {
      // Ignore modules that have not been loaded yet.
    }
  }
}

export async function captureOpenedFlow(): Promise<OpenedFlowCapture> {
  const databasePath = path.join(tmpdir(), `conflictcast-demo-${randomUUID()}.db`);
  const openPullRequests = [1, 2];
  const [payload, pr1Diff, pr2Diff] = await Promise.all([
    loadJsonFixture<Record<string, unknown>>("pull_request_opened.json"),
    loadDiffFixture("pr1.diff"),
    loadDiffFixture("pr2.diff"),
  ]);
  const capture: OpenedFlowCapture = {
    action: String(payload.action),
    repository: String((payload.repository as { full_name: string }).full_name),
    sourceFixtures: ["pull_request_opened.json", "pr1.diff", "pr2.diff"],
    triggeringPr: Number((payload.pull_request as { number: number }).number),
    triggeringHeadSha: String((payload.pull_request as { head: { sha: string } }).head.sha),
    comparedPullRequests: openPullRequests.filter(
      (pullRequestNumber) =>
        pullRequestNumber !== Number((payload.pull_request as { number: number }).number),
    ),
    checkRuns: [],
    comments: [],
  };

  process.env.DATABASE_PATH = databasePath;
  process.env.LOG_LEVEL = "silent";
  resetDemoModules();

  nock.disableNetConnect();

  try {
    const { default: app } = await import("../index");
    const probot = createProbot({
      env: {
        APP_ID: "1",
        PRIVATE_KEY: createDemoPrivateKey(),
        WEBHOOK_SECRET: "demo-secret",
        DATABASE_PATH: databasePath,
        LOG_LEVEL: "silent",
      },
    });

    await probot.load(app);

    const authScope = nock("https://api.github.com")
      .post("/app/installations/1/access_tokens")
      .reply(201, {
        token: "demo-token",
        expires_at: "2027-01-01T00:00:00Z",
        permissions: {
          checks: "write",
          contents: "read",
          issues: "write",
          pull_requests: "read",
        },
        repository_selection: "selected",
      });
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
    const checksScope = api.post("/repos/owner/repo/check-runs").twice().reply(201, (_uri, body) => {
      capture.checkRuns.push(createCheckRunCapture(parseRequestBody<CheckRunRequestBody>(body)));
      return { id: capture.checkRuns.length };
    });
    const comment1Scope = api
      .post("/repos/owner/repo/issues/1/comments")
      .reply(201, (_uri, body) => {
        const requestBody = parseRequestBody<CommentRequestBody>(body);
        capture.comments.push({
          issueNumber: 1,
          body: requestBody.body,
        });
        return { id: 101 };
      });
    const comment2Scope = api
      .post("/repos/owner/repo/issues/2/comments")
      .reply(201, (_uri, body) => {
        const requestBody = parseRequestBody<CommentRequestBody>(body);
        capture.comments.push({
          issueNumber: 2,
          body: requestBody.body,
        });
        return { id: 102 };
      });

    await probot.receive({
      id: "demo-opened",
      name: "pull_request",
      payload,
    } as Parameters<typeof probot.receive>[0]);

    await waitForScopes(
      [
        authScope,
        configScope,
        pullsScope,
        files1Scope,
        files2Scope,
        diff1Scope,
        diff2Scope,
        checksScope,
        comment1Scope,
        comment2Scope,
      ],
      15_000,
    );

    return capture;
  } finally {
    nock.cleanAll();
    nock.enableNetConnect();
    await closeLoadedDatabase();
    resetDemoModules();
    await cleanupDatabaseFiles(databasePath);
  }
}

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf("--output");
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  const transcript = formatOpenedFlowTranscript(await captureOpenedFlow());

  if (outputPath) {
    const absoluteOutputPath = path.resolve(outputPath);
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, transcript, "utf-8");
  }

  process.stdout.write(`${transcript}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
