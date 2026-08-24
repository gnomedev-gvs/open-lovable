import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const sandboxProvider = (process.env.SANDBOX_PROVIDER || 'vercel').toLowerCase();
  const aiProviderReady =
    configured('AI_GATEWAY_API_KEY') ||
    configured('OPENAI_API_KEY') ||
    configured('ANTHROPIC_API_KEY') ||
    configured('GEMINI_API_KEY') ||
    configured('GROQ_API_KEY');

  const vercelSandboxReady =
    configured('VERCEL_OIDC_TOKEN') ||
    (
      configured('VERCEL_TEAM_ID') &&
      configured('VERCEL_PROJECT_ID') &&
      configured('VERCEL_TOKEN')
    );

  const sandboxReady =
    sandboxProvider === 'e2b'
      ? configured('E2B_API_KEY')
      : sandboxProvider === 'vercel' && vercelSandboxReady;

  const firecrawlReady = configured('FIRECRAWL_API_KEY');

  return NextResponse.json({
    ok: true,
    service: 'open-lovable',
    aiProviderReady,
    firecrawlReady,
    sandboxProvider,
    sandboxReady,
    generationReady: aiProviderReady && firecrawlReady && sandboxReady,
  });
}
