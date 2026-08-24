import { NextRequest, NextResponse } from 'next/server';
import { firecrawlPost } from '@/lib/firecrawl';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const searchData = await firecrawlPost('/search', {
      query,
      limit: 10,
      scrapeOptions: {
        formats: ['markdown', 'screenshot'],
        onlyMainContent: true,
      },
    });

    const results = searchData.data?.map((result: any) => ({
      url: result.url,
      title: result.title || result.url,
      description: result.description || '',
      screenshot: result.screenshot || null,
      markdown: result.markdown || '',
    })) || [];

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform search' },
      { status: 500 }
    );
  }
}
