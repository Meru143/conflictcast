# 2026-03-19-conflictcast-prd.md
# conflictcast — PR Merge Conflict Predictor

---

## Section 1 — Project Overview

**Name:** conflictcast  
**Type:** GitHub App (Node.js service)  
**Language/Runtime:** TypeScript / Node.js 22  
**License:** MIT  

`conflictcast` is a GitHub App that watches all open pull requests in a repository and proactively predicts which pairs are likely to conflict if merged in a given order — before they are merged. Built on Probot, it uses GitHub's REST API to fetch the diff for each open PR, builds a file-level overlap graph across all open PRs, and posts structured warnings as PR comments and GitHub check run annotations when it detects high-overlap pairs. Teams no longer discover merge conflicts at 5pm Friday; they see them when the PR is opened.

---

## Section 2 — Problem Statement

- Merge conflicts are discovered only at merge time — by CI failure, by the merge queue serializing and failing, or by the engineer finding out manually.
- GitHub's Merge Queue serializes merges but does not predict which PRs will conflict before they enter the queue.
- In repos with 5+ active contributors, it is impossible to manually scan all open PRs for file overlap before each merge.
- Rebase-heavy workflows move the conflict discovery forward but still do not surface *cross-PR* conflicts until one lands on `main`.
- No open-source tool performs per-PR-pair conflict prediction across an entire repo's open PR set.

---

## Section 3 — Solution

1. Listen to `pull_request.opened`, `pull_request.synchronize`, `pull_request.closed`, and `pull_request.reopened` webhook events via Probot.
2. On each event, fetch all currently open PRs in the repository using `octokit.rest.pulls.list()`.
3. For each open PR, fetch the file-level diff using `octokit.rest.pulls.listFiles()` to get the set of files modified by that PR.
4. Build an in-memory overlap matrix: for every PR-pair, compute the Jaccard overlap of their modified file sets.
5. For pairs above the overlap threshold, simulate a merge by fetching the raw diff patches and checking for hunk-level line range overlap.
6. Post a structured PR comment on both PRs in a high-risk pair: `"⚠️ PR #47 and PR #52 both modify auth/middleware.ts — potential conflict if either merges first."`
7. Create a GitHub Check Run annotation on the head commit of each high-risk PR summarizing conflict exposure.

---

## Section 4 — Target Users

**Primary:** Backend and full-stack teams of 4–20 engineers working on a single repository with many concurrent feature branches. They experience merge conflict friction at least weekly.

**Secondary:** Maintainers of popular open-source repositories that receive many simultaneous PRs touching overlapping files (e.g., configuration files, package.json, schema files).

**Tertiary:** Engineering managers and tech leads who want visibility into cross-PR coupling risk without requiring each engineer to manually check.

---

## Section 5 — Tech Stack

| Component | Library | Version | Purpose |
|---|---|---|---|
| Language | TypeScript | 5.7.x | Type-safe source |
| Runtime | Node.js | 22.x LTS | Execution environment |
| GitHub App Framework | probot | 13.x | Webhook handling + Octokit wiring |
| GitHub REST API | @octokit/rest | 22.0.1 | Direct API calls for PRs, files, diffs |
| Diff Parsing | parse-diff | 0.11.x | Parse unified diff format to hunks |
| Persistence | better-sqlite3 | 9.x | Local store for PR state and overlap cache |
| Config | dotenv | 16.x | App credentials from `.env` |
| Testing | vitest | 2.x | Unit and integration tests |
| HTTP Mock | nock | 14.x | Mock GitHub API in tests |
| Logging | pino | 9.x | Structured JSON logging |
| Process Manager | nodemon | 3.x | Dev auto-restart |
| Release | semantic-release | 24.x | Versioning and changelog |
| Containerization | Docker | — | Deployment artifact |

**Why Probot over raw `@octokit/webhooks`?** Probot handles GitHub App installation authentication, JWT rotation, installation token caching, and webhook signature verification automatically. Building this manually would add ~400 lines of auth/security plumbing that Probot provides out of the box.

**Why `better-sqlite3` over Redis?** For a self-hosted tool, SQLite eliminates a Redis dependency. The dataset (PR file lists, overlap scores) is small, access is single-process, and SQLite's synchronous API simplifies the async flow.

**Why `parse-diff` over writing a diff parser?** The unified diff format has many edge cases (binary files, mode changes, renames). `parse-diff` is battle-tested and correctly handles all of them.

---

## Section 6 — Core Features (v1)

**1. PR File Overlap Detection**
- On every PR event, re-fetch file lists for all open PRs via `octokit.rest.pulls.listFiles()`
- Compute file set overlap for all PR pairs
- Configurable overlap threshold (default: any shared file triggers analysis)
- Exclude configurable file patterns from overlap detection (e.g., `package-lock.json`, `yarn.lock`, `*.md`)

**2. Hunk-Level Conflict Simulation**
- For file-overlapping PR pairs, fetch raw unified diffs using `octokit.rest.pulls.get()` with `mediaType: { format: "diff" }`
- Parse hunks using `parse-diff` to extract modified line ranges per file
- Check if modified line ranges in the same file overlap between PR-pair
- Score conflict probability: file overlap only → LOW, line range overlap → HIGH

**3. GitHub Check Runs**
- Create a check run (`octokit.rest.checks.create()`) on the head commit of every open PR
- Check name: `conflictcast`
- Status `completed`, conclusion `neutral` when no conflicts predicted
- Conclusion `failure` (configurable) when HIGH-risk pair detected
- Annotations include conflicting files, line ranges, and link to the competing PR

**4. PR Comments**
- Post a comment on both PRs in a high-risk pair using `octokit.rest.issues.createComment()`
- Update the same comment (don't create new ones) on subsequent synchronize events using `octokit.rest.issues.updateComment()`
- Track comment IDs in SQLite to enable updates
- Delete comment when conflict risk is resolved (PR closed or files no longer overlap)

**5. Configuration via `.conflictcast.yml`**
- Per-repo configuration file in the repository root
- `ignoreFiles`: glob patterns of files to exclude from analysis
- `threshold`: `"file"` (any shared file) or `"line"` (only line-range overlap)
- `commentOnLow`: bool — whether to post comments for LOW risk pairs (default: false)
- `failCheck`: bool — whether to set check to `failure` (vs `neutral`) for HIGH risk (default: false)

**6. State Persistence**
- Store current file lists per PR in SQLite
- Cache overlap scores between PR pairs (invalidated on `synchronize` event)
- Store comment IDs to enable update-in-place
- Purge records for closed/merged PRs

---

## Section 7 — Interface Spec

### Webhook Events Handled

| Event | Action | Handler |
|---|---|---|
| `pull_request` | `opened` | Run full overlap analysis for new PR |
| `pull_request` | `synchronize` | Re-run analysis for updated PR, invalidate its cache |
| `pull_request` | `closed` | Remove PR from state, clean up comments on affected pairs |
| `pull_request` | `reopened` | Re-add PR to state, run analysis |

### GitHub API Calls Used

| Method | Purpose |
|---|---|
| `octokit.rest.pulls.list({ owner, repo, state: "open" })` | Get all open PRs |
| `octokit.rest.pulls.listFiles({ owner, repo, pull_number })` | Get files changed in a PR |
| `octokit.rest.pulls.get({ owner, repo, pull_number, mediaType: { format: "diff" } })` | Get raw unified diff |
| `octokit.rest.checks.create({ owner, repo, name, head_sha, status, conclusion, output })` | Create check run |
| `octokit.rest.checks.update({ owner, repo, check_run_id, ... })` | Update check run |
| `octokit.rest.issues.createComment({ owner, repo, issue_number, body })` | Post PR comment |
| `octokit.rest.issues.updateComment({ owner, repo, comment_id, body })` | Update existing comment |
| `octokit.rest.issues.deleteComment({ owner, repo, comment_id })` | Remove resolved comment |

### Required GitHub App Permissions

```yaml
# app.yml
name: conflictcast
description: Predicts merge conflicts between open pull requests
default_events:
  - pull_request
default_permissions:
  checks: write
  contents: read
  issues: write        # PR comments live under issues API
  pull_requests: read
```

### `.conflictcast.yml` Config File

```yaml
# .conflictcast.yml (placed in repo root)
ignoreFiles:
  - "package-lock.json"
  - "yarn.lock"
  - "pnpm-lock.yaml"
  - "**/*.md"
  - "**/*.lock"
threshold: "line"     # "file" | "line"
commentOnLow: false
failCheck: false
maxOpenPRsToAnalyze: 50   # Skip analysis if repo has >N open PRs (performance guard)
```

---

## Section 8 — Data Flow Diagram

```
  ┌────────────────────────────────────────────────────┐
  │   GitHub Webhook: pull_request.opened/synchronize  │
  └────────────────────┬───────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   Probot receives event   │
         │   context.payload.pull_   │
         │   request.number          │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │  pulls.list({state:open}) │
         │  Get all open PR numbers  │
         └─────────────┬─────────────┘
                       │ open PR list
         ┌─────────────▼─────────────┐
         │  pulls.listFiles() for    │ ◄── SQLite cache (skip if fresh)
         │  each open PR             │
         └─────────────┬─────────────┘
                       │ file sets per PR
         ┌─────────────▼─────────────┐
         │  Build File Overlap Matrix│
         │  All-pairs comparison     │
         └──────┬──────────┬─────────┘
                │          │
         no overlap       file overlap
                │          │
         ┌──────▼──┐  ┌────▼────────────────────┐
         │ No-op   │  │  Fetch raw diffs         │
         └─────────┘  │  parse-diff hunk parsing │
                      └────────┬────────────────-┘
                               │
                     ┌─────────▼──────────────┐
                     │  Hunk Range Overlap?    │
                     └──────┬─────────┬────────┘
                            │         │
                      LOW risk      HIGH risk
                            │         │
                     ┌──────▼─────────▼────────────────┐
                     │  Create/Update Check Run         │
                     │  Create/Update PR Comment        │
                     │  Write overlap score to SQLite   │
                     └─────────────────────────────────-┘
```

---

## Section 9 — Architecture / Package Structure

```
conflictcast/
├── src/
│   ├── index.ts               # Probot app entry point — registers all handlers
│   ├── handlers/
│   │   ├── opened.ts          # pull_request.opened handler
│   │   ├── synchronize.ts     # pull_request.synchronize handler
│   │   └── closed.ts          # pull_request.closed/merged handler
│   ├── analysis/
│   │   ├── overlap.ts         # File set overlap computation
│   │   ├── hunk.ts            # Line range overlap from parsed diffs
│   │   └── scorer.ts          # Combines file + line overlap into risk score
│   ├── github/
│   │   ├── pulls.ts           # Wrappers around Octokit pulls API calls
│   │   ├── checks.ts          # Wrappers around Octokit checks API calls
│   │   └── comments.ts        # Wrappers around Octokit issues comments API
│   ├── store/
│   │   ├── db.ts              # better-sqlite3 connection + migrations
│   │   ├── prFiles.ts         # CRUD for PR file list cache
│   │   └── comments.ts        # CRUD for stored comment IDs
│   ├── config/
│   │   └── repo.ts            # Load .conflictcast.yml from repo root via API
│   └── utils/
│       ├── logger.ts          # pino logger
│       └── types.ts           # Shared TypeScript interfaces
├── test/
│   ├── fixtures/
│   │   ├── diffs/             # Raw unified diff text fixtures
│   │   └── payloads/          # GitHub webhook payload JSON fixtures
│   ├── analysis/
│   ├── handlers/
│   └── store/
├── Dockerfile
├── docker-compose.yml
├── app.yml                    # GitHub App manifest
└── package.json
```

**Key TypeScript Interfaces:**

```typescript
interface PRFileSet {
  prNumber: number;
  headSha: string;
  files: string[];     // List of modified file paths
  fetchedAt: number;   // Unix timestamp
}

interface OverlapScore {
  pr1: number;
  pr2: number;
  sharedFiles: string[];
  riskLevel: "LOW" | "HIGH" | "NONE";
  conflictingHunks: HunkConflict[];  // Empty for LOW risk
}

interface HunkConflict {
  file: string;
  pr1Lines: [number, number];   // [startLine, endLine]
  pr2Lines: [number, number];
}

interface ConflictcastConfig {
  ignoreFiles: string[];
  threshold: "file" | "line";
  commentOnLow: boolean;
  failCheck: boolean;
  maxOpenPRsToAnalyze: number;
}
```

---

## Section 10 — Error Handling

- **GitHub API rate limit (HTTP 403/429):** Use Probot's built-in throttling plugin (`octokit-plugin-throttling`) which automatically retries with backoff.
- **PR diff too large (>300 files, GitHub returns truncated response):** Log warning, fall back to file-overlap-only analysis for that PR pair.
- **`.conflictcast.yml` parse error:** Log error to PR comment on the triggering PR, use defaults.
- **SQLite write failure:** Log error and continue — analysis proceeds without caching.
- **Webhook delivery timeout:** Probot handlers must respond within GitHub's 10s webhook timeout. All heavy analysis must be async (respond 200 immediately, process in background).

| Code | Meaning | Action |
|---|---|---|
| `CF001` | GitHub API rate limited | Retry via Probot throttling, log warning |
| `CF002` | PR diff response truncated | Fall back to file-overlap only, note in comment |
| `CF003` | `.conflictcast.yml` invalid YAML | Use defaults, post warning comment |
| `CF004` | SQLite write failure | Log error, skip persistence, continue |
| `CF005` | Too many open PRs (> maxOpenPRsToAnalyze) | Skip analysis, post info comment once |

---

## Section 11 — Edge Cases

1. **PR against non-default base branch** — `pulls.list()` by default returns PRs to the default branch. PRs to feature branches must be handled by listening to the event payload's `base.ref`.
2. **Force push (synchronize with new SHA)** — old check run may still be visible. Always create a new check run on the new `head_sha`.
3. **Draft PRs** — skip analysis for draft PRs by default (configurable with `includeDrafts: true`).
4. **Binary file conflicts** — unified diff for binary files has no hunk data. Fall back to file-overlap classification (LOW risk).
5. **Renamed files** — a file rename produces both a deletion and an addition in the diff. Must treat both old and new paths as "touched" files.
6. **Very large repos (>50 open PRs)** — the N² overlap check becomes expensive. Implement `maxOpenPRsToAnalyze` guard and skip analysis with an info comment.
7. **Repo has no `checks:write` permission** — app installed without checks permission. Gracefully degrade to comments-only mode.
8. **Comment update after PR close** — attempting to update a comment on a closed PR returns 404. Catch and ignore.
9. **Multiple installations** — the same app may be installed on both a user's personal repos and org repos. Each installation gets its own SQLite file keyed by `installationId`.
10. **Concurrent webhook deliveries** — two `synchronize` events arrive simultaneously for different PRs. Use SQLite transactions to prevent race conditions on the overlap cache.

---

## Section 12 — Testing Strategy

**Unit Tests:**
- Test `overlap.ts` — two sets with 3 shared files returns correct `sharedFiles` and `riskLevel: "LOW"`
- Test `hunk.ts` — two diffs touching the same line range returns `riskLevel: "HIGH"` with correct `HunkConflict`
- Test `hunk.ts` — two diffs touching non-overlapping lines in same file returns `riskLevel: "LOW"`
- Test `scorer.ts` correctly combines file and hunk signals
- Test `config/repo.ts` — parses valid `.conflictcast.yml` and returns `ConflictcastConfig`
- Test `config/repo.ts` — returns defaults when file is missing (404 response from API)

**Integration Tests:**
- Use Probot's test utilities with `nock` to simulate full webhook delivery
- Simulate `pull_request.opened` event — assert check run created on correct `head_sha`
- Simulate two PRs with overlapping files — assert comment posted on both PRs
- Simulate PR #2 synchronize event (new commits) — assert comment on PR #2 is updated, not duplicated
- Simulate PR close — assert comment on the other PR in the pair is deleted

**Test Infrastructure:**
- `test/fixtures/payloads/` — real GitHub webhook payload JSON snapshots for each event type
- `test/fixtures/diffs/` — real unified diff text for overlap tests
- `nock` intercepts configured per-test with realistic API response fixtures

---

## Section 13 — Distribution

**Self-hosted deployment:**
```bash
docker build -t conflictcast .
docker run -p 3000:3000 \
  -e APP_ID=... \
  -e PRIVATE_KEY=... \
  -e WEBHOOK_SECRET=... \
  conflictcast
```

**GitHub Marketplace:** Published as a free GitHub App. Users click "Install" and select repositories.

**CI/CD:** GitHub Actions releases Docker image to GitHub Container Registry (`ghcr.io`) on tag push.

---

## Section 14 — Differentiators

1. **vs GitHub Merge Queue:** Merge Queue serializes merges and finds conflicts at queue time. `conflictcast` predicts conflicts *before* any PR is queued — while the PR is still open.
2. **vs manual PR review:** Engineers cannot reasonably scan all open PRs for file overlap. `conflictcast` automates this at O(N²) scale with real line-range analysis.
3. **vs Mergify:** Mergify automates merge strategies but does not predict cross-PR conflicts proactively. Its conflict detection is reactive.
4. **vs Renovate Bot:** Renovate handles dependency updates specifically. It does not analyze application code diffs for conflict prediction.

---

## Section 15 — Future Scope (v2+)

- [ ] Dashboard web UI showing repo-wide conflict heat map
- [ ] Slack/Discord notifications for high-risk PR pairs
- [ ] Semantic conflict detection (same function modified differently by two PRs)
- [ ] GitHub App Marketplace listing
- [ ] Per-directory ownership weighting (conflicts in core modules weighted higher)
- [ ] GitLab support

---

## Section 16 — Success Metrics

- [ ] Processes a `pull_request` webhook event and posts check run within 5 seconds
- [ ] Zero false-negative rate for HIGH-risk pairs (PRs that conflict at merge always predicted as HIGH)
- [ ] Works on repos with up to 50 open PRs simultaneously without timeout
- [ ] Zero duplicate comments on any single PR
- [ ] Docker image under 200MB
- [ ] Unit test coverage ≥ 80%
- [ ] Successfully installable via GitHub App Marketplace flow

---

## Section 17 — Additional Deliverables

**Documentation:**
- [ ] README.md with installation GIF, configuration reference, and FAQ
- [ ] CONTRIBUTING.md
- [ ] SECURITY.md (responsible disclosure process)
- [ ] CODE_OF_CONDUCT.md

**Dev Environment:**
- [ ] `docker-compose.yml` for local development with Smee.io webhook proxy
- [ ] `.env.example` with all required variables
- [ ] `.devcontainer/devcontainer.json`

**Environment Variables:**
- [ ] `APP_ID` — GitHub App ID (required)
- [ ] `PRIVATE_KEY` — GitHub App PEM private key (required)
- [ ] `WEBHOOK_SECRET` — Webhook HMAC secret (required)
- [ ] `PORT` — HTTP port (default: 3000)
- [ ] `LOG_LEVEL` — Pino log level (default: `info`)
- [ ] `DATABASE_PATH` — Path to SQLite file (default: `./conflictcast.db`)

---

## Section 18 — Expanded Testing Strategy

**Unit Tests:**
- [ ] `analysis/overlap.ts` — file sets with 0 shared files → `NONE`
- [ ] `analysis/overlap.ts` — file sets with 1+ shared files → `LOW`
- [ ] `analysis/hunk.ts` — non-overlapping hunks in same file → `LOW`
- [ ] `analysis/hunk.ts` — overlapping hunks → `HIGH` with correct line ranges
- [ ] `analysis/hunk.ts` — binary file in diff → falls back to `LOW`
- [ ] `store/prFiles.ts` — insert + fetch cycle in test SQLite DB
- [ ] `store/comments.ts` — stores comment ID and retrieves by PR number
- [ ] `config/repo.ts` — returns default config when YAML file not found
- [ ] `config/repo.ts` — throws `ConfigError` on invalid YAML
- [ ] `github/checks.ts` — passes correct `head_sha` to `checks.create()`

**Integration Tests:**
- [ ] `pull_request.opened` → check run created with conclusion `neutral`
- [ ] Two PRs with shared files → comment posted on both
- [ ] PR synchronize event → existing comment updated (not new comment created)
- [ ] PR closed → comment on paired PR deleted
- [ ] Repo with >50 open PRs → no analysis, info comment posted

**E2E Tests:**
- [ ] Full webhook delivery to running Probot server with test GitHub App credentials
- [ ] Assert check run appears on PR head commit in test repo

**Test Infrastructure:**
- [ ] Vitest project config
- [ ] `nock` fixture library for all GitHub API routes
- [ ] Test SQLite DB created in `os.tmpdir()` and cleaned up after each test

---

## Section 19 — CI/CD Pipeline

**CI:**
- [ ] `.github/workflows/ci.yml` — push and PR triggers
- [ ] Job: lint (`eslint src/`)
- [ ] Job: typecheck (`tsc --noEmit`)
- [ ] Job: test (`vitest run --coverage`)
- [ ] Job: docker build (`docker build .`)

**Release:**
- [ ] `.github/workflows/release.yml` — tag trigger `v*`
- [ ] Push Docker image to `ghcr.io/<owner>/conflictcast:<tag>`
- [ ] Run `semantic-release` to publish npm package and update CHANGELOG

**Makefile:**
- [ ] `make lint`
- [ ] `make test`
- [ ] `make build`
- [ ] `make docker`
- [ ] `make dev` (starts nodemon + smee webhook proxy)
