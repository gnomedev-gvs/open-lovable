import { existsSync } from 'fs';
import { NextResponse } from 'next/server';
import { firecrawlMode, isFirecrawlReady } from '@/lib/firecrawl';

export const dynamic = 'force-dynamic';

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const sandboxProvider = (process.env.SANDBOX_PROVIDER || 'local-docker').toLowerCase();
  const aiProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const codexBin = process.env.CODEX_BIN?.trim() || '/home/aibox/.npm-global/bin/codex';
  const codexReady = aiProvider === 'codex' && existsSync(codexBin);
  const apiKeyProviderReady =
    configured('AI_GATEWAY_API_KEY') ||
    configured('OPENAI_API_KEY') ||
    configured('ANTHROPIC_API_KEY') ||
    configured('GEMINI_API_KEY') ||
    configured('GROQ_API_KEY');
  const aiProviderReady = codexReady || apiKeyProviderReady;

  const vercelSandboxReady =
    configured('VERCEL_OIDC_TOKEN') ||
    (
      configured('VERCEL_TEAM_ID') &&
      configured('VERCEL_PROJECT_ID') &&
      configured('VERCEL_TOKEN')
    );

  const localDockerReady =
    (sandboxProvider === 'local-docker' || sandboxProvider === 'docker' || sandboxProvider === 'local') &&
    configured('LOCAL_SANDBOX_IMAGE');

  const sandboxReady =
    sandboxProvider === 'e2b'
      ? configured('E2B_API_KEY')
      : sandboxProvider === 'vercel'
        ? vercelSandboxReady
        : localDockerReady;

  const firecrawlReady = isFirecrawlReady();

  return NextResponse.json({
    ok: true,
    service: 'open-lovable',
    aiProvider: codexReady ? 'codex' : apiKeyProviderReady ? 'api-key' : 'none',
    aiProviderReady,
    firecrawlReady,
    firecrawlMode: firecrawlMode(),
    sandboxProvider,
    sandboxReady,
    generationReady: aiProviderReady && firecrawlReady && sandboxReady,
  });
}
