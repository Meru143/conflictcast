import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG, loadRepoConfig } from "../../src/config/repo";
import logger from "../../src/utils/logger";
import type { ConflictcastOctokit } from "../../src/utils/types";

function createOctokitMock(getContent: () => Promise<unknown>): ConflictcastOctokit {
  return {
    rest: {
      repos: {
        getContent,
      },
    },
  } as unknown as ConflictcastOctokit;
}

describe("loadRepoConfig", () => {
  it("parses a valid repository config and overrides defaults", async () => {
    const octokit = createOctokitMock(async () => ({
      data: {
        content: Buffer.from(
          ["threshold: file", "commentOnLow: true", "maxOpenPRsToAnalyze: 25"].join("\n"),
        ).toString("base64"),
      },
    }));

    const config = await loadRepoConfig(octokit, "owner", "repo");

    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      threshold: "file",
      commentOnLow: true,
      maxOpenPRsToAnalyze: 25,
    });
  });

  it("returns defaults when the config file is missing", async () => {
    const octokit = createOctokitMock(async () => {
      throw { status: 404 };
    });

    await expect(loadRepoConfig(octokit, "owner", "repo")).resolves.toEqual(
      DEFAULT_CONFIG,
    );
  });

  it("returns defaults and logs a warning for invalid yaml", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const octokit = createOctokitMock(async () => ({
      data: {
        content: Buffer.from("threshold: [", "utf-8").toString("base64"),
      },
    }));

    const config = await loadRepoConfig(octokit, "owner", "repo");

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnSpy).toHaveBeenCalled();
  });
});
