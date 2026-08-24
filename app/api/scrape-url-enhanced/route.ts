import { NextRequest, NextResponse } from 'next/server';
import { firecrawlPost } from '@/lib/firecrawl';

function sanitizeQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00AB\u00BB]/g, '"')
    .replace(/[\u2039\u203A]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u00A0]/g, ' ');
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 });
    }

    console.log('[scrape-url-enhanced] Scraping with Firecrawl:', url);

    const data = await firecrawlPost('/scrape', {
      url,
      formats: ['markdown', 'html', 'screenshot'],
      waitFor: 3000,
      timeout: 30000,
      blockAds: true,
      maxAge: 3600000,
      actions: [
        { type: 'wait', milliseconds: 2000 },
        { type: 'screenshot', fullPage: false }
      ]
    });

    if (!data?.data) {
      throw new Error('Firecrawl returned no scrape data');
    }

    const { markdown, metadata, screenshot, actions } = data.data;
    const screenshotUrl = screenshot || actions?.screenshots?.[0] || null;
    const sanitizedMarkdown = sanitizeQuotes(markdown || '');
    const title = metadata?.title || '';
    const description = metadata?.description || '';

    const formattedContent = `
Title: ${sanitizeQuotes(title)}
Description: ${sanitizeQuotes(description)}
URL: ${url}

Main Content:
${sanitizedMarkdown}
    `.trim();

    return NextResponse.json({
      success: true,
      url,
      content: formattedContent,
      screenshot: screenshotUrl,
      structured: {
        title: sanitizeQuotes(title),
        description: sanitizeQuotes(description),
        content: sanitizedMarkdown,
        url,
        screenshot: screenshotUrl
      },
      metadata: {
        scraper: 'firecrawl-enhanced',
        timestamp: new Date().toISOString(),
        contentLength: formattedContent.length,
        cached: data.data.cached || false,
        ...metadata
      },
      message: 'URL scraped successfully with Firecrawl'
    });
  } catch (error) {
    console.error('[scrape-url-enhanced] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
