# conflictcast

![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)
![Docker Image Size](https://img.shields.io/badge/docker_image_size-target_%3C200MB-2496ED?logo=docker&logoColor=white)
![Node 22](https://img.shields.io/badge/node-22.x-339933?logo=node.js&logoColor=white)
![TypeScript 5.7](https://img.shields.io/badge/typescript-5.7-3178C6?logo=typescript&logoColor=white)
![MIT License](https://img.shields.io/badge/license-MIT-yellow.svg)

Predicts merge conflicts between open pull requests before they land.

![Conflictcast PR comment preview](./docs/conflictcast-preview.svg)

## How It Works

1. `conflictcast` listens to `pull_request` webhook events through Probot.
2. It fetches every open PR, computes shared-file overlap, and escalates to hunk analysis when configured.
3. It publishes the result as GitHub check runs plus PR comments so engineers see conflict risk before merge time.

## Installation

### GitHub App

Install the app into a repository or organization:

[Install conflictcast](https://github.com/apps/conflictcast/installations/new)

### Self-hosted Docker

```bash
docker build -t conflictcast .
docker run -p 3000:3000 \
  -e APP_ID=... \
  -e PRIVATE_KEY="$(cat private-key.pem)" \
  -e WEBHOOK_SECRET=... \
  -e DATABASE_PATH=./conflictcast.db \
  conflictcast
```

### Local development

```bash
npm ci
cp .env.example .env
npm run build
docker compose up --build
```

## Configuration

Place `.conflictcast.yml` in the repository root:

```yaml
ignoreFiles:
  - "package-lock.json"
  - "yarn.lock"
  - "pnpm-lock.yaml"
  - "**/*.md"
  - "**/*.lock"
threshold: "line"
commentOnLow: false
failCheck: false
maxOpenPRsToAnalyze: 50
```

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `ignoreFiles` | `string[]` | `["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]` | Glob patterns ignored before overlap analysis. |
| `threshold` | `"file" \| "line"` | `"line"` | `file` reports any shared file, `line` requires hunk overlap for HIGH risk. |
| `commentOnLow` | `boolean` | `false` | When `true`, LOW-risk pairs receive PR comments in addition to checks. |
| `failCheck` | `boolean` | `false` | When `true`, HIGH-risk check runs conclude with `failure` instead of `neutral`. |
| `maxOpenPRsToAnalyze` | `number` | `50` | Performance guard that skips analysis when the repo has too many open PRs. |

## GitHub App Permissions

| Permission | Access | Why |
| --- | --- | --- |
| `checks` | `write` | Publishes the `conflictcast` check run on PR head commits. |
| `contents` | `read` | Loads `.conflictcast.yml` from the repository root. |
| `issues` | `write` | Creates, updates, and deletes PR comments through the Issues API. |
| `pull_requests` | `read` | Lists open PRs, changed files, and raw diffs. |

## FAQ

### Does conflictcast merge or rebase anything?

No. It only reads PR metadata/diffs and writes check runs or comments.

### What counts as HIGH risk?

HIGH risk means two PRs modify overlapping line ranges in at least one shared file.

### What happens when the repo is too busy?

If open PR count exceeds `maxOpenPRsToAnalyze`, `conflictcast` skips the run and posts an informational `CF005` comment on the triggering PR.
