import { NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

declare global {
  var activeSandboxProvider: any;
}

export async function POST() {
  try {
    const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    if (!provider) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 400 });
    }

    console.log('[create-zip] Creating project archive...');

    const zipResult = await provider.runCommand(
      `zip -rq /tmp/project.zip . -x 'node_modules/*' '.git/*' '.next/*' 'dist/*' 'build/*' '*.log'`
    );

    if (!zipResult.success) {
      throw new Error(`Failed to create zip: ${zipResult.stderr || zipResult.stdout}`);
    }

    const sizeResult = await provider.runCommand("wc -c < /tmp/project.zip");
    if (!sizeResult.success) {
      throw new Error(`Failed to inspect zip: ${sizeResult.stderr || sizeResult.stdout}`);
    }
    console.log(`[create-zip] Created project.zip (${sizeResult.stdout.trim()} bytes)`);

    const readResult = await provider.runCommand('base64 -w 0 /tmp/project.zip');
    if (!readResult.success) {
      throw new Error(`Failed to read zip file: ${readResult.stderr || readResult.stdout}`);
    }

    const dataUrl = `data:application/zip;base64,${readResult.stdout.trim()}`;

    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: 'open-lovable-project.zip',
      message: 'Zip file created successfully'
    });
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}
