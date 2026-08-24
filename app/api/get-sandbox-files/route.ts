import { NextResponse } from 'next/server';
import { parseJavaScriptFile, buildComponentTree } from '@/lib/file-parser';
import { FileManifest, FileInfo, RouteInfo } from '@/types/file-manifest';
import type { SandboxState } from '@/types/sandbox';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

declare global {
  var activeSandboxProvider: any;
  var sandboxState: SandboxState;
}

export async function GET() {
  try {
    const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    if (!provider) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 404 });
    }

    console.log('[get-sandbox-files] Fetching and analyzing file structure...');

    const fileList = (await provider.listFiles())
      .filter((filePath: string) => /\.(jsx?|tsx?|css|json)$/.test(filePath));

    console.log('[get-sandbox-files] Found', fileList.length, 'files');

    const filesContent: Record<string, string> = {};

    for (const filePath of fileList) {
      try {
        const content = await provider.readFile(filePath);
        if (Buffer.byteLength(content, 'utf8') < 10000) {
          filesContent[filePath.replace(/^\.\//, '')] = content;
        }
      } catch (readError) {
        console.debug(`[get-sandbox-files] Skipping unreadable file ${filePath}:`, readError);
      }
    }

    const directories = new Set<string>(['.']);
    for (const filePath of Object.keys(filesContent)) {
      const parts = filePath.split('/');
      for (let i = 1; i < parts.length; i += 1) {
        directories.add(parts.slice(0, i).join('/'));
      }
    }
    const structure = Array.from(directories).sort().slice(0, 50).join('\n');

    const fileManifest: FileManifest = {
      files: {},
      routes: [],
      componentTree: {},
      entryPoint: '',
      styleFiles: [],
      timestamp: Date.now(),
    };

    for (const [relativePath, content] of Object.entries(filesContent)) {
      const fullPath = `/${relativePath}`;

      const fileInfo: FileInfo = {
        content,
        type: 'utility',
        path: fullPath,
        relativePath,
        lastModified: Date.now(),
      };

      if (relativePath.match(/\.(jsx?|tsx?)$/)) {
        const parseResult = parseJavaScriptFile(content, fullPath);
        Object.assign(fileInfo, parseResult);

        if (relativePath === 'src/main.jsx' || relativePath === 'src/index.jsx') {
          fileManifest.entryPoint = fullPath;
        }

        if (relativePath === 'src/App.jsx' || relativePath === 'App.jsx') {
          fileManifest.entryPoint = fileManifest.entryPoint || fullPath;
        }
      }

      if (relativePath.endsWith('.css')) {
        fileManifest.styleFiles.push(fullPath);
        fileInfo.type = 'style';
      }

      fileManifest.files[fullPath] = fileInfo;
    }

    fileManifest.componentTree = buildComponentTree(fileManifest.files);
    fileManifest.routes = extractRoutes(fileManifest.files);

    if (global.sandboxState?.fileCache) {
      global.sandboxState.fileCache.manifest = fileManifest;
    }

    return NextResponse.json({
      success: true,
      files: filesContent,
      structure,
      fileCount: Object.keys(filesContent).length,
      manifest: fileManifest,
    });
  } catch (error) {
    console.error('[get-sandbox-files] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

function extractRoutes(files: Record<string, FileInfo>): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.content.includes('<Route') || fileInfo.content.includes('createBrowserRouter')) {
      const routeMatches = fileInfo.content.matchAll(/path=["']([^"']+)["'].*(?:element|component)={([^}]+)}/g);

      for (const match of routeMatches) {
        const [, routePath] = match;
        routes.push({
          path: routePath,
          component: path,
        });
      }
    }

    if (fileInfo.relativePath.startsWith('pages/') || fileInfo.relativePath.startsWith('src/pages/')) {
      const routePath = '/' + fileInfo.relativePath
        .replace(/^(src\/)?pages\//, '')
        .replace(/\.(jsx?|tsx?)$/, '')
        .replace(/index$/, '');

      routes.push({
        path: routePath,
        component: path,
      });
    }
  }

  return routes;
}
