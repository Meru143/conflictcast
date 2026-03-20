import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import nock from "nock";
import { createProbot } from "probot";
import { vi } from "vitest";

let cachedTestPrivateKey: string | undefined;

export function createTestPrivateKey(): string {
  if (cachedTestPrivateKey) {
    return cachedTestPrivateKey;
  }

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  cachedTestPrivateKey = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();

  return cachedTestPrivateKey;
}

export function createTestDatabasePath(): string {
  return path.join(tmpdir(), `conflictcast-${randomUUID()}.db`);
}

export async function cleanupDatabaseFiles(databasePath: string): Promise<void> {
  await Promise.all([
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true }),
  ]);
}

export async function closeLoadedDatabase(): Promise<void> {
  try {
    const { db } = await import("../../src/store/db");

    if (db.open) {
      db.close();
    }
  } catch {
    // Ignore cleanup failures for tests that never loaded the DB module.
  }
}

export async function loadJsonFixture<T>(fileName: string): Promise<T> {
  const filePath = path.join(process.cwd(), "test", "fixtures", "payloads", fileName);
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

export async function loadDiffFixture(fileName: string): Promise<string> {
  const filePath = path.join(process.cwd(), "test", "fixtures", "diffs", fileName);
  return readFile(filePath, "utf-8");
}

export async function createLoadedProbot(databasePath: string) {
  process.env.DATABASE_PATH = databasePath;
  process.env.LOG_LEVEL = "silent";
  vi.resetModules();

  const { default: app } = await import("../../src/index");
  const probot = createProbot({
    env: {
      APP_ID: "1",
      PRIVATE_KEY: createTestPrivateKey(),
      WEBHOOK_SECRET: "test-secret",
      DATABASE_PATH: databasePath,
      LOG_LEVEL: "silent",
    },
  });

  await probot.load(app);
  return probot;
}

export function mockInstallationToken() {
  return nock("https://api.github.com")
    .post("/app/installations/1/access_tokens")
    .reply(201, {
      token: "test-token",
      expires_at: "2027-01-01T00:00:00Z",
      permissions: {
        checks: "write",
        contents: "read",
        issues: "write",
        pull_requests: "read",
      },
      repository_selection: "selected",
    });
}
