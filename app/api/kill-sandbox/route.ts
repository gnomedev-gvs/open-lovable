import { NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

export async function POST() {
  try {
    console.log('[kill-sandbox] Stopping active sandbox...');

    const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    const sandboxKilled = Boolean(provider);

    await sandboxManager.terminateAll();

    if (global.activeSandboxProvider) {
      try {
        await global.activeSandboxProvider.terminate();
      } catch (error) {
        console.error('[kill-sandbox] Legacy sandbox termination failed:', error);
      }
    }

    global.activeSandboxProvider = null;
    global.sandboxData = null;

    if (global.existingFiles) {
      global.existingFiles.clear();
    }

    return NextResponse.json({
      success: true,
      sandboxKilled,
      message: 'Sandbox cleaned up successfully'
    });
  } catch (error) {
    console.error('[kill-sandbox] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}
