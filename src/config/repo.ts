// Load .conflictcast.yml from repo root via API.
import yaml from "js-yaml";

import logger from "../utils/logger";
import type { ConflictcastConfig, ConflictcastOctokit } from "../utils/types";

export const DEFAULT_CONFIG: ConflictcastConfig = {
  ignoreFiles: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
  threshold: "line",
  commentOnLow: false,
  failCheck: false,
  maxOpenPRsToAnalyze: 50,
};

type RepoContentResponse = {
  content: string;
};

function isRepoContentResponse(data: unknown): data is RepoContentResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "content" in data &&
    typeof (data as RepoContentResponse).content === "string"
  );
}

function isHttpStatusError(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  );
}

export async function loadRepoConfig(
  octokit: ConflictcastOctokit,
  owner: string,
  repo: string,
): Promise<ConflictcastConfig> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".conflictcast.yml",
    });

    if (!isRepoContentResponse(response.data)) {
      return DEFAULT_CONFIG;
    }

    const rawConfig = Buffer.from(response.data.content, "base64").toString("utf-8");
    const parsed = yaml.load(rawConfig);
    const parsedConfig =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Partial<ConflictcastConfig>)
        : {};

    return {
      ...DEFAULT_CONFIG,
      ...parsedConfig,
    };
  } catch (error) {
    if (isHttpStatusError(error, 404)) {
      return DEFAULT_CONFIG;
    }

    logger.warn(
      { err: error, owner, repo, code: "CF003" },
      "Failed to parse .conflictcast.yml; using defaults",
    );

    return DEFAULT_CONFIG;
  }
}
