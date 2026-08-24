# Open Lovable

Chat with AI to build React apps instantly. This fork is managed for TheOMKGroup's AI BOX environment and tracks the upstream [Firecrawl Open Lovable](https://github.com/firecrawl/open-lovable) project.

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Open Lovable Demo" width="100%"/>

## Setup

1. **Clone & Install**

```bash
git clone https://github.com/gnomedev-gvs/open-lovable.git
cd open-lovable
npm install
```

2. **Configure environment**

```env
# Firecrawl's official keyless API mode, with no account or API key required.
FIRECRAWL_MODE=keyless

# Need at least one AI provider
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
# Or use OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY

# Local Docker sandbox
SANDBOX_PROVIDER=local-docker
LOCAL_SANDBOX_IMAGE=open-lovable-sandbox:dev
```

A Firecrawl API key remains optional if higher limits are later required. Open Lovable does not return mock scrape data when Firecrawl is unavailable.

For standalone local development, build the sandbox image first:

```bash
docker build -t open-lovable-sandbox:dev -f sandbox/Dockerfile sandbox
```

The sandbox Dockerfile pins its Node 22.23.2 Bookworm parent image by digest. Vercel Sandbox and E2B remain optional provider adapters for other environments.

3. **Run for development**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI BOX managed deployment

Production AI BOX deployment is controlled through `gnomedev-gvs/aibox-control`. Do not deploy by manually editing the AI BOX checkout or service.

The managed deployment builds `sandbox/Dockerfile` before restarting Open Lovable and tags the resulting local image with the exact Open Lovable commit being deployed. The runtime uses:

- Open Lovable service: `open-lovable.service`
- application port: `4320`
- Firecrawl mode: official keyless API, 1,000 free credits/month under Firecrawl's current service terms
- sandbox provider: `local-docker`
- generated-app base runtime: pinned Node 22.23.2 Bookworm image
- generated-app Vite port: `5173`, mapped to an ephemeral host port on the AI BOX LAN address
- container capabilities: all dropped
- `no-new-privileges`: enabled
- host filesystem mounts: none
- default container limits: 1.5 GB memory, 2 CPUs, 512 PIDs

The protected runtime environment file is `/home/aibox/.config/open-lovable/env` and must remain mode `0600`. Secret values must never be committed to Git or written to GitHub issues/logs.

## License

MIT
