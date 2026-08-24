# Open Lovable on AI BOX

## Purpose

This repository is the OMK-managed fork of Open Lovable used as a reusable website-generation capability on AI BOX. AI BOX development, diagnostics, testing, deployment and maintenance are controlled through:

`ChatGPT -> GitHub -> AI BOX Controller -> AI BOX`

Do not operate the AI BOX checkout manually for routine work.

## Authoritative sources

- Managed fork: `gnomedev-gvs/open-lovable`
- Upstream: `firecrawl/open-lovable`
- Pinned upstream baseline: `69bd93bae7a9c97ef989eb70aabe6797fb3dac89`
- Upstream licence: MIT
- Controller: `gnomedev-gvs/aibox-control`
- Managed checkout: `/home/aibox/Dev/open-lovable`
- User service: `open-lovable.service`
- Local health: `http://127.0.0.1:4320/api/health`
- LAN application: `http://192.168.1.108:4320`

No public Internet exposure is part of Gate 1.

## Production architecture

### Application runtime

Open Lovable runs as a Next.js production service under the AI BOX user systemd manager. The deployment path is defined by `.aibox-control.json` and `scripts/aibox-deploy.sh`.

### AI generation

The default AI provider on AI BOX is the controller-managed Codex CLI:

- `AI_PROVIDER=codex`
- `CODEX_BIN=/home/aibox/.npm-global/bin/codex`
- expected controller-managed Codex version: `0.149.0`

Open Lovable launches Codex with `exec`, JSONL output, a read-only Codex sandbox, and an ephemeral working directory. The normal generation path and automatic truncation-recovery path both use Codex when `AI_PROVIDER=codex`.

Direct provider keys and Vercel AI Gateway remain optional compatibility paths. They are not required for the AI BOX production configuration.

### Generated-site sandbox

The production sandbox provider is `local-docker`.

Each generated site runs in an ephemeral Docker container with:

- a commit-specific local image tag
- a Node base image pinned by digest
- non-root UID/GID `1000:1000`
- all Linux capabilities dropped
- `no-new-privileges`
- PID, memory and CPU limits
- isolated temporary storage
- no host filesystem mounts
- a dynamically published Vite preview port on the AI BOX LAN address
- automatic container destruction after controller acceptance tests

The primary generation UI uses `/api/create-ai-sandbox-v2`, which routes through the sandbox-provider abstraction. The older `/api/create-ai-sandbox` route remains an upstream compatibility path and is not the AI BOX production path.

### Web scraping

The AI BOX production scraper mode is local:

- `FIRECRAWL_MODE=local`
- no Firecrawl API key is required for direct URL scraping
- requests are limited to HTTP/HTTPS standard ports
- URL credentials are rejected
- localhost, local/internal names, private/reserved IPs and DNS results resolving to private/reserved IPs are rejected
- redirects are revalidated
- response size is capped at 5 MB
- scripts, styles and noscript blocks are excluded from extracted text

Firecrawl cloud remains optional for enhanced search/screenshot workflows. Firecrawl keyless cloud access is not relied on because the provider rejects unauthenticated requests from the AI BOX egress IP.

Local mode deliberately does not pretend to implement Firecrawl web search or Firecrawl screenshot capture. Those enhanced functions require an optional Firecrawl API key or a future governed local browser implementation.

## Controller operations

Routine Open Lovable work must be expressed as AI BOX Controller requests. Current relevant actions include:

- `repo-bootstrap`
- `git-status`
- `test`
- `build`
- `deploy`
- `project-health`
- `browser-smoke`
- `open-lovable-ai-status`
- `open-lovable-codex-status`
- `open-lovable-firecrawl-smoke`
- `open-lovable-generation-acceptance`

The generation acceptance action is restricted to the managed `open-lovable` project. It creates a temporary Northstar Accounting site, applies it, runs the generated Vite build, validates source content, renders the private preview in Chrome, checks screenshot output, and destroys the sandbox.

## Standard change workflow

1. Verify the current upstream head, licence and installation changes before a material upgrade.
2. Record the chosen upstream commit. Do not silently track a moving branch.
3. Create an isolated fork branch or controller-managed worktree.
4. Run controller `test` against the exact candidate ref.
5. Run controller `build` against the exact candidate ref.
6. Review the exact diff and merge only the validated head.
7. Deploy `main` through the controller to environment `local`.
8. Require `/api/health` to report the expected provider modes and `generationReady=true`.
9. Run direct URL scrape acceptance.
10. Run browser/sandbox acceptance.
11. Run `open-lovable-generation-acceptance` for a real generation/build/render/cleanup cycle.
12. Record the production commit and acceptance evidence in `AI_BOX_STATE.md`.

## Quality gate

A release is not complete because the landing page loads. At minimum verify:

- TypeScript
- Next.js production build
- service health
- LAN rendering
- local Docker sandbox create/use/cleanup
- real generated files
- generated Vite build
- generated-site browser render
- expected visible content
- no obvious placeholder copy in the representative acceptance site
- no fake scrape fallback
- no credentials in GitHub issues, logs or screenshots

For a client website, its own Project remains responsible for the content, creative direction, client-specific acceptance and long-term website development.

## Logs and diagnostics

Use controller actions and their GitHub issue evidence. The service itself is a user systemd service and the controller-managed deployment path can surface service status and failure diagnostics. Do not ask an operator to retrieve terminal logs for routine diagnostics.

## Secrets

No AI provider secret is required by the production Codex configuration. Optional provider credentials must never be committed to Git, GitHub issues, controller output, screenshots or logs. If a future secret is required, use only a narrow controller-managed secret path and preserve file mode `0600` for `/home/aibox/.config/open-lovable/env`.
