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
# Required for full cloning/search readiness
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Need at least one AI provider
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
# Or use OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY

# AI BOX default sandbox provider
SANDBOX_PROVIDER=local-docker
LOCAL_SANDBOX_IMAGE=node:22.23.2-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a
```

The AI BOX deployment uses an isolated local Docker container for generated applications. It does not require Vercel Sandbox or E2B credentials. Vercel Sandbox and E2B remain optional provider adapters for other environments.

3. **Run for development**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI BOX managed deployment

Production AI BOX deployment is controlled through `gnomedev-gvs/aibox-control`. Do not deploy by manually editing the AI BOX checkout or service.

The managed runtime uses:

- Open Lovable service: `open-lovable.service`
- application port: `4320`
- sandbox provider: `local-docker`
- generated-app runtime: pinned Node 22.23.2 Bookworm container
- generated-app Vite port: `5173`, mapped to an ephemeral host port on the AI BOX LAN address
- container capabilities: all dropped
- `no-new-privileges`: enabled
- host filesystem mounts: none
- default container limits: 1.5 GB memory, 2 CPUs, 512 PIDs

The protected runtime environment file is `/home/aibox/.config/open-lovable/env` and must remain mode `0600`. Secret values must never be committed to Git or written to GitHub issues/logs.

## License

MIT
