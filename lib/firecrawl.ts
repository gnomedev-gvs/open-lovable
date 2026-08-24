const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';

export type FirecrawlMode = 'keyless' | 'api-key' | 'disabled';

export function firecrawlMode(): FirecrawlMode {
  if ((process.env.FIRECRAWL_MODE || '').trim().toLowerCase() === 'keyless') {
    return 'keyless';
  }
  if (process.env.FIRECRAWL_API_KEY?.trim()) {
    return 'api-key';
  }
  return 'disabled';
}

export function isFirecrawlReady(): boolean {
  return firecrawlMode() !== 'disabled';
}

export function firecrawlHeaders(): Record<string, string> {
  const mode = firecrawlMode();
  if (mode === 'disabled') {
    throw new Error('Firecrawl is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (mode === 'api-key') {
    headers.Authorization = `Bearer ${process.env.FIRECRAWL_API_KEY!.trim()}`;
  }

  return headers;
}

export async function firecrawlPost(path: '/search' | '/scrape', body: unknown): Promise<any> {
  const response = await fetch(`${FIRECRAWL_BASE_URL}${path}`, {
    method: 'POST',
    headers: firecrawlHeaders(),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || text || `HTTP ${response.status}`;
    throw new Error(`Firecrawl API error (${response.status}): ${String(message).slice(0, 1000)}`);
  }

  if (payload?.success === false) {
    throw new Error(`Firecrawl API error: ${String(payload?.error || payload?.message || 'request failed').slice(0, 1000)}`);
  }

  return payload;
}
