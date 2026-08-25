# Open Lovable AI BOX production state

## Gate 1 status

Gate 1 is COMPLETE as of 2026-08-24 MDT / 2026-08-25 UTC.

The production capability has passed application deployment, health, browser/sandbox acceptance, representative website generation, generated-site build/render, cleanup, and reusable cross-project GitHub handoff.

## Authoritative source and licence

- Managed fork: `gnomedev-gvs/open-lovable`
- Authoritative upstream: `firecrawl/open-lovable`
- Pinned upstream baseline: `69bd93bae7a9c97ef989eb70aabe6797fb3dac89`
- Upstream licence: MIT
- Upstream is evaluated before material upgrades. Production does not silently follow a moving upstream branch.

## Production runtime

- Managed checkout: `/home/aibox/Dev/open-lovable`
- Deployed runtime commit: `a7ad6d9dce3e1f41986938077f4301f35e2cf99d`
- Framework: Next.js 15.5.21
- Service: `open-lovable.service`
- LAN URL: `http://192.168.1.108:4320`
- Local health: `http://127.0.0.1:4320/api/health`
- Public Internet exposure: none in Gate 1

The current production deployment for `a7ad6d9dce3e1f41986938077f4301f35e2cf99d` completed through AI BOX Controller. The deployment rebuilt the application, reused the pinned local sandbox image layers, restarted only Open Lovable, and returned:

`aiProviderReady=true`

`firecrawlReady=true`

`sandboxReady=true`

`generationReady=true`

## Production providers

### AI

- Provider: controller-managed Codex CLI
- Expected Codex version: `0.149.0`
- Binary: `/home/aibox/.npm-global/bin/codex`
- Open Lovable requires no AI provider secret in its environment for this production configuration.
- Headless generation explicitly closes Codex stdin and reads the supported final-message artifact, with JSONL retained only as a compatibility/diagnostic fallback.

### Sandbox

- Provider: `local-docker`
- Node base image is pinned by digest.
- Base React/Vite/Tailwind dependencies are pinned and baked into the local image so routine sandbox creation does not depend on live npm registry availability.
- Runtime npm installation remains only a bounded recovery fallback if the baked image is unexpectedly incomplete.
- Sandboxes are ephemeral, non-root, capability-dropped, `no-new-privileges`, resource-limited, mount-free and destroyed through the final cleanup path.

### Scraping

- Direct URL mode: local
- Direct URL scraping does not require a Firecrawl API key.
- Firecrawl cloud remains optional for enhanced search/screenshot workflows and is not required for Gate 1 readiness.

## Representative production acceptance

AI BOX Controller issue `#3241` ran the production Northstar Accounting acceptance after deployment of the Codex stdin fix.

Verified result:

- acceptance: PASS
- AI provider: Codex
- scraper mode: local
- sandbox provider: local-docker
- generated files: 8
- generated code: 15,647 bytes
- generated-site production build: PASS
- browser: Google Chrome
- expected rendered text: `Northstar Accounting`
- screenshot: 137,691 bytes
- sandbox cleanup: final cleanup path

## Reusable cross-project acceptance

The controller action `open-lovable-generate` is the reusable handoff mechanism for approved managed Projects. Its controller implementation passed the full controller test gate before merge.

AI BOX Controller issue `#3247` generated a fictional Aurora Fabrication site and handed it to the managed `omk-web` repository without modifying that repository's default branch.

Verified result:

- generation: PASS
- target repository: `gnomedev-gvs/omkgroup-web`
- isolated branch: `open-lovable/gate1-reusable-proof`
- seed path: `.open-lovable/seeds/gate1-reusable-proof`
- generated commit: `721b862ca349bae8a5541fafd43e37f8d4ba93c5`
- exported files: 16
- generated-site build: PASS
- browser: Google Chrome
- screenshot: 118,486 bytes
- sandbox provider: local-docker
- AI provider: Codex
- cleanup: final cleanup path

The proof branch is a child of the unchanged target `main` commit `f288aac9259d197a093326fbf9beb3577028f27b`, proving the reusable action did not modify target `main`. The generated commit uses the repository author identity `TheOMKGroup`.

## Browser refresh and workspace persistence

The production generation workspace now survives normal browser refresh. A generation URL containing the active sandbox ID resumes that sandbox instead of replacing it or re-running the original generation. The visible chat is rehydrated for the same sandbox, the file inventory is restored, and workspace files are protected by durable snapshots outside the disposable Docker container.

Durable snapshots are streamed directly from the managed Docker sandbox into a private host-side temporary file and atomically promoted to the session archive. This avoids relying on sandbox `/tmp` and supports overlapping periodic and browser-triggered snapshot requests.

AI BOX Controller issue `#3654` verified the deployed implementation on commit `a7ad6d9dce3e1f41986938077f4301f35e2cf99d`:

- acceptance: PASS
- browser loads: 2
- same sandbox after refresh: true
- workspace marker preserved: true
- durable snapshot: 18,902 bytes
- browser: Google Chrome
- sandbox cleanup: final cleanup path

The controller regression action is `open-lovable-refresh-acceptance`. It is the required regression gate for future changes that can affect generation-page refresh, sandbox lifecycle or session snapshot behaviour.

## Durable operations

- `docs/AI_BOX_RUNBOOK.md`: production architecture, controlled workflow, quality gates, logs and secrets.
- `docs/AI_BOX_ROLLBACK.md`: application, sandbox, Codex, scraper and controller recovery.
