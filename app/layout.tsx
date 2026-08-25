import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter"
});

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
});

const persistenceGuard = `
(() => {
  if (window.__openLovablePersistenceInstalled) return;
  window.__openLovablePersistenceInstalled = true;

  const originalFetch = window.fetch.bind(window);
  let snapshotTimer = null;

  const generationSandboxId = () => {
    try {
      if (window.location.pathname !== '/generation') return null;
      return new URL(window.location.href).searchParams.get('sandbox');
    } catch {
      return null;
    }
  };

  const jsonResponse = (value) => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const snapshot = async (sandboxId) => {
    const id = sandboxId || generationSandboxId();
    if (!id) return;
    try {
      await originalFetch('/api/session-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snapshot', sandboxId: id }),
        keepalive: true,
      });
    } catch {
      // Snapshotting is best-effort here. The live sandbox remains authoritative.
    }
  };

  const scheduleSnapshot = () => {
    if (snapshotTimer) window.clearTimeout(snapshotTimer);
    snapshotTimer = window.setTimeout(() => snapshot(), 2500);
  };

  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const currentSandbox = generationSandboxId();

    if (
      currentSandbox &&
      requestUrl.includes('/api/conversation-state') &&
      method === 'POST' &&
      typeof init?.body === 'string' &&
      init.body.includes('clear-old')
    ) {
      return jsonResponse({ success: true, preserved: true, message: 'Existing conversation preserved' });
    }

    if (currentSandbox && requestUrl.includes('/api/create-ai-sandbox-v2') && method === 'POST') {
      try {
        const statusResponse = await originalFetch('/api/sandbox-status', { cache: 'no-store' });
        const status = await statusResponse.json();
        if (
          status?.active &&
          status?.healthy &&
          status?.sandboxData?.sandboxId === currentSandbox &&
          status?.sandboxData?.url
        ) {
          return jsonResponse({
            success: true,
            sandboxId: status.sandboxData.sandboxId,
            url: status.sandboxData.url,
            provider: 'local-docker',
            restored: true,
            message: 'Existing sandbox restored',
          });
        }
      } catch {
        // Fall through to durable snapshot recovery.
      }

      // The Next.js process may have restarted while the Docker sandbox is still alive.
      // Capture that container before create-ai-sandbox-v2 removes stale labelled sandboxes.
      await snapshot(currentSandbox);

      const createdResponse = await originalFetch(input, init);
      if (createdResponse.ok) {
        try {
          const created = await createdResponse.clone().json();
          if (created?.sandboxId) {
            const restoreResponse = await originalFetch('/api/session-snapshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'restore', sourceSandboxId: currentSandbox }),
            });
            if (restoreResponse.ok) {
              scheduleSnapshot();
            }
          }
        } catch {
          // If no durable snapshot exists, the newly created sandbox remains usable.
        }
      }
      return createdResponse;
    }

    const response = await originalFetch(input, init);

    if (
      currentSandbox &&
      method === 'POST' &&
      [
        '/api/apply-ai-code',
        '/api/apply-ai-code-stream',
        '/api/install-packages',
        '/api/install-packages-v2',
        '/api/run-command',
        '/api/run-command-v2',
        '/api/restart-vite',
      ].some((endpoint) => requestUrl.includes(endpoint))
    ) {
      scheduleSnapshot();
    }

    return response;
  };

  window.setInterval(() => {
    if (generationSandboxId()) snapshot();
  }, 15000);

  window.addEventListener('pagehide', () => {
    const sandboxId = generationSandboxId();
    if (!sandboxId || !navigator.sendBeacon) return;
    const payload = new Blob([
      JSON.stringify({ action: 'snapshot', sandboxId })
    ], { type: 'application/json' });
    navigator.sendBeacon('/api/session-snapshot', payload);
  });
})();
`;

export const metadata: Metadata = {
  title: "Open Lovable v3",
  description: "Re-imagine any website in seconds with AI-powered website builder.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} ${robotoMono.variable} font-sans`}>
        <script dangerouslySetInnerHTML={{ __html: persistenceGuard }} />
        {children}
      </body>
    </html>
  );
}
