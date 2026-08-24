import { lookup } from 'dns/promises';
import net from 'net';

const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';
const MAX_LOCAL_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export type FirecrawlMode = 'local' | 'keyless' | 'api-key' | 'disabled';

type ScrapeRequest = {
  url?: string;
  formats?: string[];
  timeout?: number;
};

export function firecrawlMode(): FirecrawlMode {
  const configuredMode = (process.env.FIRECRAWL_MODE || '').trim().toLowerCase();
  if (configuredMode === 'local') {
    return 'local';
  }
  if (configuredMode === 'keyless') {
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

function isBlockedIp(address: string): boolean {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 2) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:169.254.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }

  return true;
}

async function validatePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Scrape URL is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Scrape URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Scrape URL credentials are not allowed');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Scrape URL must use the standard HTTP or HTTPS port');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Scrape URL must resolve to a public Internet host');
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error('Scrape URL cannot target a private or reserved IP address');
    }
    return parsed;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('Scrape URL must resolve only to public Internet addresses');
  }

  return parsed;
}

async function fetchLocalDocument(rawUrl: string, timeoutMs: number): Promise<{ finalUrl: string; html: string }> {
  let current = rawUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const parsed = await validatePublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs, 30000)));

    try {
      const response = await fetch(parsed, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'OpenLovable-AIBox/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.1',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Local scraper redirect (${response.status}) had no Location header`);
        }
        current = new URL(location, parsed).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Local scraper HTTP error (${response.status})`);
      }

      const declaredLength = Number(response.headers.get('content-length') || '0');
      if (declaredLength > MAX_LOCAL_BYTES) {
        throw new Error('Local scraper response is too large');
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_LOCAL_BYTES) {
        throw new Error('Local scraper response exceeded the 5 MB limit');
      }

      return {
        finalUrl: parsed.toString(),
        html: buffer.toString('utf8'),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Local scraper exceeded ${MAX_REDIRECTS} redirects`);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|article|header|footer|nav|main|aside|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function extractTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities((match?.[1] || '').replace(/<[^>]+>/g, ' ').trim());
}

function extractDescription(html: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== 'description') continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    return decodeEntities(content.trim());
  }
  return '';
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && links.size < 100) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        resolved.hash = '';
        links.add(resolved.toString());
      }
    } catch {
      // Ignore malformed links in third-party markup.
    }
  }
  return [...links];
}

async function localScrape(body: ScrapeRequest): Promise<any> {
  if (!body.url) {
    throw new Error('Local scraper requires a URL');
  }

  const { finalUrl, html } = await fetchLocalDocument(body.url, body.timeout || 30000);
  const markdown = htmlToMarkdown(html);
  const title = extractTitle(html) || new URL(finalUrl).hostname;
  const description = extractDescription(html);

  return {
    success: true,
    data: {
      markdown,
      html,
      screenshot: null,
      links: extractLinks(html, finalUrl),
      metadata: {
        title,
        description,
        sourceURL: finalUrl,
        scraper: 'local-http',
      },
    },
  };
}

export function firecrawlHeaders(): Record<string, string> {
  const mode = firecrawlMode();
  if (mode === 'disabled' || mode === 'local') {
    throw new Error('Firecrawl cloud is not configured');
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
  const mode = firecrawlMode();

  if (mode === 'local') {
    if (path === '/search') {
      throw new Error('Web search requires an optional Firecrawl API key; direct URL scraping is available locally');
    }
    return localScrape(body as ScrapeRequest);
  }

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
