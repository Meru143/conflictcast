# Contributing

## Local Setup

1. Install Node.js 22.x and Docker.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and fill in your GitHub App credentials.
4. Start the app and webhook proxy with `docker compose up --build`.

## Smee.io Webhook Flow

1. Create a Smee channel at [smee.io](https://smee.io).
2. Put the channel URL into `SMEE_URL` in your shell or `.env`.
3. Point your GitHub App webhook URL to the Smee channel.
4. Run `docker compose up --build` so the `smee` service forwards payloads to the Probot app.

## Development Commands

- `make lint`
- `make test`
- `make build`
- `make docker`

## Pull Requests

1. Keep changes scoped to the TODO/PRD requirements.
2. Add or update tests when behavior changes.
3. Use conventional commits.
