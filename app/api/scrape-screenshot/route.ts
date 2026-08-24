import { NextRequest, NextResponse } from 'next/server';
import { firecrawlPost } from '@/lib/firecrawl';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('[scrape-screenshot] Attempting to capture screenshot for:', url);

    const result = await firecrawlPost('/scrape', {
      url,
      formats: ['screenshot'],
      waitFor: 3000,
      timeout: 30000,
      onlyMainContent: false,
      actions: [
        { type: 'wait', milliseconds: 2000 }
      ]
    });

    const data = result?.data || result;
    const screenshot = data?.screenshot || data?.actions?.screenshots?.[0] || null;
    if (!screenshot) {
      throw new Error('Screenshot not available in Firecrawl response');
    }

    return NextResponse.json({
      success: true,
      screenshot,
      metadata: data?.metadata || {}
    });
  } catch (error: any) {
    console.error('[scrape-screenshot] Screenshot capture error:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to capture screenshot'
    }, { status: 500 });
  }
}
