import { NextRequest, NextResponse } from "next/server";
import { firecrawlPost } from '@/lib/firecrawl';

export async function POST(request: NextRequest) {
  try {
    const { url, formats = ['markdown', 'html'], options = {} } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const result = await firecrawlPost('/scrape', {
      url,
      formats,
      onlyMainContent: options.onlyMainContent !== false,
      waitFor: options.waitFor || 2000,
      timeout: options.timeout || 30000,
      ...options,
    });

    const data = result?.data || result;
    if (!data) {
      throw new Error('Firecrawl returned no scrape data');
    }

    return NextResponse.json({
      success: true,
      data: {
        title: data?.metadata?.title || "Untitled",
        content: data?.markdown || data?.html || "",
        description: data?.metadata?.description || "",
        markdown: data?.markdown || "",
        html: data?.html || "",
        metadata: data?.metadata || {},
        screenshot: data?.screenshot || null,
        links: data?.links || [],
        raw: data
      }
    });
  } catch (error) {
    console.error("Error scraping website:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to scrape website",
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
