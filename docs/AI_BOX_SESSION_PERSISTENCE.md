# AI BOX Open Lovable Session Persistence

Owner: TheOMKGroup

## Problem

The upstream generation page treated every browser mount as a new generation runtime. Even when a `sandbox` query parameter was present, the page called `create-ai-sandbox-v2`. That endpoint terminates the current sandbox before creating another one. A normal browser refresh therefore destroyed the active local Docker sandbox and all generated files that had not been exported elsewhere.

The upstream conversation endpoint also trims in-memory conversation state during generation-page mount. Both behaviours are inappropriate for the AI BOX production integration, where a live generation workspace must survive navigation and refresh.

## Production behaviour required

A generation URL containing `?sandbox=<id>` identifies the active workspace.

On ordinary refresh:

1. the browser checks the server-side sandbox status;
2. if the referenced sandbox is still active and healthy, the existing sandbox is reused;
3. no sandbox termination or replacement occurs;
4. the existing files and preview remain authoritative.

For stronger recovery:

- mutating builder operations schedule a durable workspace snapshot;
- active workspaces are snapshotted periodically;
- page exit requests a final best-effort snapshot;
- snapshots are stored outside the Docker container under the AI BOX user's local application-data directory;
- if the Next.js process restarts while the sandbox survives, the old container is captured before stale-container cleanup;
- if a replacement sandbox is required, the most recent snapshot is restored into it and Vite is restarted.

## Storage

Default snapshot root:

`~/.local/share/open-lovable/sessions/`

Snapshot names:

`<sandbox-id>.tgz`

The archive excludes dependency/build caches (`node_modules`, `.git`, `dist`, `build`, `.next`). Dependencies are reinstalled during recovery instead of storing a large transient dependency tree.

## Security and isolation

The snapshot API:

- accepts only Open Lovable sandbox IDs matching the controller-managed naming format;
- verifies the Docker container has the Open Lovable sandbox label before reading it;
- never accepts arbitrary host paths from the browser;
- writes only under the fixed session snapshot root;
- does not serialize AI-provider credentials or the Open Lovable service environment;
- restores only into the currently controller-managed Open Lovable sandbox.

## Files

- `app/api/session-snapshot/route.ts`: snapshot and recovery endpoint.
- `app/layout.tsx`: early browser persistence guard. It executes before the generation page's mount effects so upstream destructive refresh behaviour can be intercepted without carrying a large fork of the upstream generation page.

## Validation gate

Before production promotion, verify all of the following through AI BOX Controller:

1. production build succeeds;
2. generate a representative site;
3. make a visible code/content modification;
4. record sandbox ID and a file-content marker;
5. refresh the generation page;
6. verify the sandbox ID is unchanged when the runtime is healthy;
7. verify the file-content marker and preview survive;
8. verify continued editing succeeds after refresh;
9. verify a durable snapshot exists and can restore into a replacement sandbox;
10. verify `/api/health` remains green;
11. verify no unrelated AI BOX workload is restarted or modified.

Do not declare the persistence defect closed until the refresh test is proven on the deployed LAN instance.

## Rollback

Rollback is the normal GitHub/controller deployment rollback to the previous known-good Open Lovable commit. Snapshot files are additive application data and can remain on disk during rollback. The previous build does not read them.
