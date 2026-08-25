# AI BOX rollback and recovery

## Scope

This runbook covers the AI BOX Open Lovable service, local Docker sandbox image and controller-managed integration. It does not cover individual client website repositories.

## Normal application rollback

1. Identify the last known-good `gnomedev-gvs/open-lovable` commit from `AI_BOX_STATE.md` and GitHub history.
2. Use an isolated GitHub branch/revert or a previously verified commit. Do not edit the live checkout manually.
3. Run controller `test` and `build` against the rollback ref.
4. Use the AI BOX Controller deploy workflow to deploy the verified rollback ref to the `local` environment.
5. The deployment script rebuilds the local sandbox image using a tag derived from the deployed commit and restarts only `open-lovable.service`.
6. Verify `/api/health`, browser smoke, direct scrape smoke and representative generation acceptance before closing recovery.

The fleet definition records the application rollback strategy as `git-revert-and-redeploy-prior-main`.

## Sandbox recovery

Generated-site containers are ephemeral and labelled `com.omk.open-lovable.sandbox=true`. The local provider cleans its previously labelled ephemeral containers before creating a new sandbox and terminates the active sandbox during normal cleanup.

Do not restart Docker or unrelated AI BOX services as a routine recovery step. A sandbox failure should first be diagnosed through the controller and corrected in the Open Lovable provider or image.

## Codex recovery

The AI backend depends on the controller-managed Codex CLI. The expected pinned version for this Gate 1 release is `0.149.0`.

Use the controller `open-lovable-codex-status` action to verify binary presence, version match and live authenticated execution. If repair is required, use the controller-managed Codex runtime installation/repair capability. Do not copy authentication files or tokens into Open Lovable.

If Codex authentication genuinely expires and cannot be refreshed through an existing authorized mechanism, stop at that authentication boundary and request only the unavoidable human authentication action.

## Scraper recovery

Direct URL scraping is local and does not depend on Firecrawl cloud. Validate it using the controller `open-lovable-firecrawl-smoke` compatibility action, which performs a real direct scrape of `https://example.com` and verifies expected content.

If a future workflow requires Firecrawl search or Firecrawl screenshot capture, treat Firecrawl cloud credentials as an optional enhancement. Do not silently enable billing or add a credential merely to make health appear green.

## Controller rollback

Controller changes are developed on isolated branches and tested before merge. If an Open Lovable controller action must be rolled back:

1. Revert the controller change in GitHub on an isolated branch.
2. Run the full controller test gate.
3. Merge the tested revert.
4. Verify existing unrelated controller actions remain healthy.

Do not repair a dirty production controller checkout by overwriting it. The controller self-maintenance path is designed to detect and avoid that condition.

## Recovery evidence

A rollback or recovery is complete only when the controlling GitHub issue records successful execution and Open Lovable again passes the applicable health, build, scrape, sandbox/browser and generation acceptance gates.
