# 2026-03-19-conflictcast-todo.md
# conflictcast — Detailed TODO List

---

## Phase 1: Project Setup

### 1.1 Repository Initialization
- [x] Run `npm init -y` in new `conflictcast/` directory
- [x] Set `name: "conflictcast"`, `version: "0.1.0"` in `package.json`
- [x] Add `"type": "commonjs"` (Probot uses CJS by default)
- [x] Create `README.md` with project name, one-line description, and install shield badges
- [x] Create `LICENSE` (MIT)
- [x] Create `.gitignore` (node_modules, dist, *.db, .env)
- [x] Create `CHANGELOG.md`
- [x] Run `git init && git add -A && git commit -m "chore: initial scaffold"`

### 1.2 Directory Structure
- [x] Create `src/` directory
- [x] Create `src/handlers/` directory
- [x] Create `src/analysis/` directory
- [x] Create `src/github/` directory
- [x] Create `src/store/` directory
- [x] Create `src/config/` directory
- [x] Create `src/utils/` directory
- [x] Create `test/` directory
- [x] Create `test/fixtures/` directory
- [x] Create `test/fixtures/payloads/` directory
- [x] Create `test/fixtures/diffs/` directory
- [x] Create `.github/workflows/` directory

### 1.3 TypeScript and Build Setup
- [x] Run `npm install --save-dev typescript@5 @types/node ts-node`
- [x] Create `tsconfig.json` with `"module": "CommonJS"`, `"target": "ES2022"`, `"strict": true`, `"outDir": "dist"`
- [x] Add `"build": "tsc"` and `"start": "node dist/index.js"` to `package.json` scripts
- [x] Add `"dev": "nodemon --exec ts-node src/index.ts"` for development

### 1.4 Install Core Dependencies
- [x] Run `npm install probot`
- [x] Run `npm install @octokit/rest`
- [x] Run `npm install parse-diff`
- [x] Run `npm install better-sqlite3` and `npm install --save-dev @types/better-sqlite3`
- [x] Run `npm install dotenv`
- [x] Run `npm install pino`
- [x] Run `npm install --save-dev nodemon vitest nock @vitest/coverage-v8`

### 1.5 Probot App Entry Point
- [x] Create `src/index.ts` exporting a Probot `ApplicationFunction`
- [x] Import `{ Probot }` from `"probot"`
- [x] Export `default (app: Probot) => { ... }` function
- [x] Register stub handler: `app.on("pull_request.opened", async () => {})`
- [x] Create `src/server.ts` with `import { run } from "probot"; import app from "./index"; run(app);`

### 1.6 GitHub App Manifest
- [x] Create `app.yml` in project root
- [x] Set `name: conflictcast`, `description`, `url`
- [x] Set `default_events: [pull_request]`
- [x] Set `default_permissions: { checks: write, contents: read, issues: write, pull_requests: read }`

### 1.7 Environment Setup
- [x] Create `.env.example` with `APP_ID=`, `PRIVATE_KEY=`, `WEBHOOK_SECRET=`, `PORT=3000`, `LOG_LEVEL=info`, `DATABASE_PATH=./conflictcast.db`
- [x] Create `.env` (gitignored) for local development
- [x] Load `.env` at startup using `dotenv/config` import at top of `src/server.ts`

### 1.8 Docker Setup
- [x] Create `Dockerfile` with `FROM node:22-alpine`, `WORKDIR /app`, `COPY`, `npm ci --omit=dev`, `CMD ["node", "dist/index.js"]`
- [x] Create `docker-compose.yml` with service `app` (build: .) and `smee` (for local webhook proxy)
- [x] Create `.dockerignore` excluding `node_modules`, `.env`, `*.db`, `test/`

### 1.9 Build and Release Config
- [x] Create `.github/workflows/ci.yml`
- [x] Create `.github/workflows/release.yml`
- [x] Create `Makefile` with targets: `build`, `test`, `lint`, `docker`, `dev`
- [x] Run `npm install --save-dev semantic-release @semantic-release/changelog`
- [x] Create `.releaserc.json` configuring semantic-release

---

## Phase 2: Database Layer

### 2.1 SQLite Connection
- [x] Create `src/store/db.ts`
- [x] Import `Database` from `"better-sqlite3"`
- [x] Read `DATABASE_PATH` from `process.env` with fallback `"./conflictcast.db"`
- [x] Call `new Database(DATABASE_PATH)` and export the `db` instance
- [x] Enable WAL mode: `db.pragma("journal_mode = WAL")`
- [x] Call `db.pragma("foreign_keys = ON")`
- [x] Create `initDb()` function that runs all migrations
- [x] Call `initDb()` at module load time

### 2.2 PR Files Table
- [x] In `initDb()`, run `CREATE TABLE IF NOT EXISTS pr_files (repo_full_name TEXT NOT NULL, pr_number INTEGER NOT NULL, head_sha TEXT NOT NULL, files TEXT NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (repo_full_name, pr_number))`
- [x] Create `src/store/prFiles.ts`
- [x] Implement `upsertPRFiles(repo: string, prNumber: number, headSha: string, files: string[]): void` using `db.prepare(...).run()`
- [x] Implement `getPRFiles(repo: string, prNumber: number): PRFileSet | null`
- [x] Implement `deletePRFiles(repo: string, prNumber: number): void`
- [x] Implement `getAllOpenPRFiles(repo: string): PRFileSet[]`

### 2.3 Comments Table
- [x] In `initDb()`, run `CREATE TABLE IF NOT EXISTS pr_comments (repo_full_name TEXT NOT NULL, pr_number INTEGER NOT NULL, paired_pr_number INTEGER NOT NULL, comment_id INTEGER NOT NULL, PRIMARY KEY (repo_full_name, pr_number, paired_pr_number))`
- [x] Create `src/store/comments.ts`
- [x] Implement `upsertComment(repo: string, prNumber: number, pairedPr: number, commentId: number): void`
- [x] Implement `getComment(repo: string, prNumber: number, pairedPr: number): number | null` returning `comment_id` or null
- [x] Implement `deleteCommentRecord(repo: string, prNumber: number, pairedPr: number): void`
- [x] Implement `getCommentsForPR(repo: string, prNumber: number): { pairedPr: number; commentId: number }[]`

---

## Phase 3: GitHub API Wrappers

### 3.1 Pull Request API
- [x] Create `src/github/pulls.ts`
- [x] Implement `listOpenPRs(octokit, owner: string, repo: string): Promise<PullRequest[]>` using `octokit.rest.pulls.list({ owner, repo, state: "open", per_page: 100 })`
- [x] Handle pagination: use `octokit.paginate(octokit.rest.pulls.list, ...)` to fetch all pages
- [x] Implement `getPRFiles(octokit, owner: string, repo: string, pullNumber: number): Promise<string[]>` using `octokit.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber })`
- [x] Extract `filename` from each file object in the response
- [x] Handle `listFiles` pagination (max 300 files per response)
- [x] Implement `getPRDiff(octokit, owner: string, repo: string, pullNumber: number): Promise<string>` using `octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber, mediaType: { format: "diff" } })`
- [x] Cast response `data` as `unknown as string` (diff format returns raw text)

### 3.2 Checks API
- [x] Create `src/github/checks.ts`
- [x] Implement `createConflictCheck(octokit, owner: string, repo: string, headSha: string, results: OverlapScore[]): Promise<number>` returning check_run_id
- [x] Call `octokit.rest.checks.create({ owner, repo, name: "conflictcast", head_sha: headSha, status: "completed", conclusion: ..., output: { title, summary, text } })`
- [x] Set `conclusion: "neutral"` when `results` has no HIGH risk entries
- [x] Set `conclusion: "failure"` (when `failCheck: true` in config) or `"neutral"` for HIGH risk
- [x] Build `output.summary` with markdown table of conflicting PR pairs
- [x] Build `output.annotations` array for each conflicting file with `path`, `start_line`, `end_line`, `annotation_level: "warning"`, `message`
- [x] Implement `updateConflictCheck(octokit, owner: string, repo: string, checkRunId: number, results: OverlapScore[]): Promise<void>` using `octokit.rest.checks.update()`

### 3.3 Comments API
- [x] Create `src/github/comments.ts`
- [x] Implement `postConflictComment(octokit, owner: string, repo: string, prNumber: number, pairedPrNumber: number, score: OverlapScore): Promise<number>` returning comment_id
- [x] Build comment body with markdown: `⚠️ **Potential Merge Conflict Detected**`, table of shared files, list of line range overlaps, link to competing PR
- [x] Call `octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body })`
- [x] Return `response.data.id`
- [x] Implement `updateConflictComment(octokit, owner: string, repo: string, commentId: number, score: OverlapScore): Promise<void>` using `octokit.rest.issues.updateComment({ owner, repo, comment_id: commentId, body })`
- [x] Implement `deleteConflictComment(octokit, owner: string, repo: string, commentId: number): Promise<void>` using `octokit.rest.issues.deleteComment()`, catch and ignore 404 errors

---

## Phase 4: Analysis Engine

### 4.1 File Overlap
- [ ] Create `src/analysis/overlap.ts`
- [ ] Implement `computeFileOverlap(files1: string[], files2: string[], ignorePatterns: string[]): { sharedFiles: string[]; riskLevel: "NONE" | "LOW" }` 
- [ ] Filter both file lists using `minimatch` against `ignorePatterns` before comparison
- [ ] Compute intersection of file sets using `Set` intersection
- [ ] Return `riskLevel: "NONE"` when intersection is empty, `"LOW"` otherwise
- [ ] Install `npm install minimatch` for glob pattern matching

### 4.2 Hunk-Level Analysis
- [ ] Create `src/analysis/hunk.ts`
- [ ] Install and import `parseDiff` from `"parse-diff"`
- [ ] Implement `extractHunkRanges(diffText: string): Map<string, [number, number][]>` mapping file path to array of `[startLine, endLine]` tuples for each hunk
- [ ] Use `parseDiff(diffText)` → iterate `file.chunks` → each chunk has `newStart` and `newLines`
- [ ] Handle binary files: `parseDiff` marks them with `isBinary: true`, skip and return empty range array
- [ ] Handle renamed files: use `to` field (new filename) as map key
- [ ] Implement `detectHunkOverlap(ranges1: [number, number][], ranges2: [number, number][]): [number,number][] | null` returning overlapping ranges or null
- [ ] Two ranges `[a,b]` and `[c,d]` overlap when `a <= d && c <= b`

### 4.3 Risk Scorer
- [ ] Create `src/analysis/scorer.ts`
- [ ] Implement `scoreOverlap(pr1Files: PRFileSet, pr2Files: PRFileSet, diff1: string, diff2: string, config: ConflictcastConfig): OverlapScore`
- [ ] Step 1: Call `computeFileOverlap()` on the two file sets
- [ ] Step 2: If riskLevel is NONE, return early with `riskLevel: "NONE"` and no hunks
- [ ] Step 3: If `config.threshold === "file"`, return `riskLevel: "LOW"` with shared files
- [ ] Step 4: If `config.threshold === "line"`, call `extractHunkRanges()` for each shared file from both diffs
- [ ] Step 5: Call `detectHunkOverlap()` for each shared file — if any overlap found, set `riskLevel: "HIGH"`
- [ ] Populate `conflictingHunks` array with `HunkConflict` objects for HIGH risk pairs

---

## Phase 5: Repository Config

### 5.1 Config Loader
- [ ] Create `src/config/repo.ts`
- [ ] Install `npm install js-yaml` and `npm install --save-dev @types/js-yaml`
- [ ] Implement `loadRepoConfig(octokit, owner: string, repo: string): Promise<ConflictcastConfig>`
- [ ] Fetch `.conflictcast.yml` using `octokit.rest.repos.getContent({ owner, repo, path: ".conflictcast.yml" })`
- [ ] Decode base64 content: `Buffer.from(response.data.content, "base64").toString("utf-8")`
- [ ] Parse with `yaml.load()` from `js-yaml`
- [ ] Merge parsed values with defaults using spread: `{ ...DEFAULT_CONFIG, ...parsed }`
- [ ] Catch HTTP 404 (file not found) and return `DEFAULT_CONFIG`
- [ ] Catch YAML parse errors, log warning, return `DEFAULT_CONFIG`
- [ ] Define `DEFAULT_CONFIG: ConflictcastConfig` = `{ ignoreFiles: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"], threshold: "line", commentOnLow: false, failCheck: false, maxOpenPRsToAnalyze: 50 }`

---

## Phase 6: Webhook Handlers

### 6.1 Core Analysis Orchestrator
- [ ] Create `src/analysis/run.ts`
- [ ] Implement `runAnalysis(octokit, owner: string, repo: string, triggeringPR: number): Promise<void>`
- [ ] Load repo config using `loadRepoConfig()`
- [ ] Check `openPRs.length > config.maxOpenPRsToAnalyze` — if true, post info comment and return
- [ ] Fetch all open PRs using `listOpenPRs()`
- [ ] Skip draft PRs (check `pr.draft === true`)
- [ ] For the triggering PR: always fetch fresh files and update SQLite via `upsertPRFiles()`
- [ ] For each other open PR: load from SQLite cache, fetch fresh if `fetched_at` is older than 60 seconds
- [ ] Compute `scoreOverlap()` for all pairs involving the triggering PR
- [ ] For HIGH/LOW risk pairs where `config.commentOnLow` or risk is HIGH: call comment and check run logic
- [ ] For pairs that were HIGH but are now resolved (after synchronize): call `deleteConflictComment()`

### 6.2 `pull_request.opened` Handler
- [ ] Create `src/handlers/opened.ts`
- [ ] Extract `owner`, `repo`, `prNumber`, `headSha` from `context.payload`
- [ ] Call `runAnalysis(context.octokit, owner, repo, prNumber)`
- [ ] Wrap in try-catch, log errors via `context.log.error()`
- [ ] Return immediately (Probot responds 200, processing is async)

### 6.3 `pull_request.synchronize` Handler
- [ ] Create `src/handlers/synchronize.ts`
- [ ] Invalidate SQLite cache for triggering PR: call `deletePRFiles(repo, prNumber)` before re-fetch
- [ ] Delete existing conflict comments for PR pairs that are now resolved
- [ ] Call `runAnalysis(context.octokit, owner, repo, prNumber)`

### 6.4 `pull_request.closed` Handler
- [ ] Create `src/handlers/closed.ts`
- [ ] Delete SQLite file record: call `deletePRFiles(repo, prNumber)`
- [ ] Fetch all comment records for this PR: call `getCommentsForPR(repo, prNumber)`
- [ ] For each: call `deleteConflictComment()` to remove the comment on the paired PR
- [ ] Delete all comment records for this PR from SQLite

### 6.5 Register All Handlers
- [ ] In `src/index.ts`, import all handlers
- [ ] Call `app.on("pull_request.opened", openedHandler)`
- [ ] Call `app.on("pull_request.synchronize", synchronizeHandler)`
- [ ] Call `app.on("pull_request.closed", closedHandler)`
- [ ] Call `app.on("pull_request.reopened", openedHandler)` (reuse opened handler)

---

## Phase 7: Unit Tests

### 7.1 Analysis Tests
- [ ] Create `test/analysis/overlap.test.ts`
- [ ] Test two identical file sets → all files in `sharedFiles`, `riskLevel: "LOW"`
- [ ] Test two disjoint file sets → empty `sharedFiles`, `riskLevel: "NONE"`
- [ ] Test `package-lock.json` in both sets → excluded by default ignore pattern
- [ ] Create `test/analysis/hunk.test.ts`
- [ ] Load `test/fixtures/diffs/pr1.diff` and `test/fixtures/diffs/pr2.diff` (overlapping hunks)
- [ ] Assert `detectHunkOverlap()` returns overlapping ranges
- [ ] Load `test/fixtures/diffs/pr3.diff` (non-overlapping hunks in same file)
- [ ] Assert `detectHunkOverlap()` returns null
- [ ] Test binary file in diff → `extractHunkRanges` returns empty array for that file
- [ ] Create `test/analysis/scorer.test.ts`
- [ ] Test `threshold: "file"` mode — returns `LOW` for any shared file without fetching diffs
- [ ] Test `threshold: "line"` mode — returns `HIGH` only when hunk overlap confirmed

### 7.2 Store Tests
- [ ] Create `test/store/prFiles.test.ts`
- [ ] Create in-memory test DB: `new Database(":memory:")`
- [ ] Test `upsertPRFiles` then `getPRFiles` round-trip
- [ ] Test `deletePRFiles` removes record
- [ ] Test `getAllOpenPRFiles` returns all rows for the repo
- [ ] Create `test/store/comments.test.ts`
- [ ] Test `upsertComment` + `getComment` round-trip
- [ ] Test `deleteCommentRecord` removes record
- [ ] Test `getCommentsForPR` returns all paired comments for a PR

### 7.3 Config Tests
- [ ] Create `test/config/repo.test.ts`
- [ ] Mock `octokit.rest.repos.getContent` returning base64-encoded YAML fixture
- [ ] Assert parsed config overrides defaults correctly
- [ ] Mock 404 response — assert default config returned
- [ ] Mock response with invalid YAML — assert default config returned

---

## Phase 8: Integration Tests

### 8.1 Probot Integration Tests
- [ ] Create `test/handlers/opened.integration.ts`
- [ ] Import `{ Probot, createProbot } from "probot"` and `nock`
- [ ] Load `test/fixtures/payloads/pull_request_opened.json` fixture
- [ ] Mock `GET /repos/{owner}/{repo}/pulls` returning 2 open PRs
- [ ] Mock `GET /repos/{owner}/{repo}/pulls/1/files` and `/pulls/2/files` with overlapping files
- [ ] Mock `GET /repos/{owner}/{repo}/pulls/1` and `/2` with diff format
- [ ] Mock `POST /repos/{owner}/{repo}/check-runs`
- [ ] Mock `POST /repos/{owner}/{repo}/issues/1/comments`
- [ ] Deliver webhook payload using `probot.receive({ id: "1", name: "pull_request", payload })`
- [ ] Assert all expected API mocks were called (nock pending: 0)

### 8.2 Synchronize Event Integration
- [ ] Create `test/handlers/synchronize.integration.ts`
- [ ] Pre-populate SQLite with existing PR file cache and comment record
- [ ] Deliver `pull_request.synchronize` payload
- [ ] Assert `PATCH /repos/{owner}/{repo}/issues/comments/{id}` called (comment updated)
- [ ] Assert `POST /repos/{owner}/{repo}/check-runs` called with new `head_sha`

### 8.3 Closed Event Integration
- [ ] Create `test/handlers/closed.integration.ts`
- [ ] Pre-populate SQLite with comment records for the closing PR
- [ ] Deliver `pull_request.closed` payload
- [ ] Assert `DELETE /repos/{owner}/{repo}/issues/comments/{id}` called for each stored comment

---

## Phase 9: CI/CD Pipeline

### 9.1 GitHub Actions CI
- [ ] Create `.github/workflows/ci.yml` with `on: [push, pull_request]`
- [ ] Add job `lint` running `npx eslint src/`
- [ ] Add job `typecheck` running `npx tsc --noEmit`
- [ ] Add job `test` running `npx vitest run --coverage`
- [ ] Add job `docker-build` running `docker build .`
- [ ] Upload coverage to Codecov

### 9.2 Release Workflow
- [ ] Create `.github/workflows/release.yml` triggered on tag `v*`
- [ ] Build Docker image: `docker build -t ghcr.io/${{ github.repository }}:${{ github.ref_name }} .`
- [ ] Push image: `docker push ghcr.io/${{ github.repository }}:${{ github.ref_name }}`
- [ ] Also tag as `:latest`
- [ ] Run `semantic-release` to update CHANGELOG and GitHub release

---

## Phase 10: Documentation

### 10.1 README.md
- [ ] Add CI badge and Docker image size badge
- [ ] Add animated GIF showing a PR comment being posted (can be a static screenshot for v1)
- [ ] Add "How it works" section with the 3-step summary
- [ ] Add "Installation" section: GitHub App install button + self-hosted Docker instructions
- [ ] Add "Configuration" section with `.conflictcast.yml` full reference
- [ ] Add "GitHub App Permissions" table

### 10.2 Community Files
- [ ] Create `CONTRIBUTING.md` with Smee.io local dev setup instructions
- [ ] Create `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- [ ] Create `SECURITY.md`
- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] Create `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] Create `.editorconfig`
