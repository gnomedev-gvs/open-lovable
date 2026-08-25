import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const DOCKER_BIN = process.env.LOCAL_SANDBOX_DOCKER_BIN || '/usr/bin/docker';
const WORKDIR = '/home/node/app';
const SESSION_ROOT = process.env.OPEN_LOVABLE_SESSION_ROOT || path.join(os.homedir(), '.local', 'share', 'open-lovable', 'sessions');
const SANDBOX_ID_RE = /^open-lovable-[a-f0-9]{12}$/;
const SANDBOX_LABEL = 'com.omk.open-lovable.sandbox';

declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
}

async function docker(args: string[], timeout = 180000): Promise<string> {
  const { stdout } = await execFileAsync(DOCKER_BIN, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  return String(stdout || '');
}

function assertSandboxId(value: unknown): string {
  if (typeof value !== 'string' || !SANDBOX_ID_RE.test(value)) {
    throw new Error('Invalid Open Lovable sandbox id');
  }
  return value;
}

async function assertManagedSandbox(sandboxId: string): Promise<void> {
  const label = (await docker([
    'inspect', '--format', `{{ index .Config.Labels "${SANDBOX_LABEL}" }}`, sandboxId,
  ], 30000)).trim();
  if (label !== 'true') {
    throw new Error('Refusing non-Open-Lovable Docker container');
  }
}

function currentSandboxId(): string {
  const fromGlobal = global.sandboxData?.sandboxId;
  if (typeof fromGlobal === 'string' && SANDBOX_ID_RE.test(fromGlobal)) return fromGlobal;
  const fromProvider = global.activeSandboxProvider?.getSandboxInfo?.()?.sandboxId;
  return assertSandboxId(fromProvider);
}

function archivePath(sandboxId: string): string {
  return path.join(SESSION_ROOT, `${sandboxId}.tgz`);
}

async function snapshotContainer(sandboxId: string): Promise<{ sandboxId: string; bytes: number }> {
  await assertManagedSandbox(sandboxId);
  await mkdir(SESSION_ROOT, { recursive: true, mode: 0o700 });

  // Stream the archive directly from Docker to a private host-side temporary file.
  // This avoids relying on /tmp inside the sandbox and is safe when snapshots overlap.
  const destination = archivePath(sandboxId);
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const child = spawn(DOCKER_BIN, [
      'exec', '-u', '1000:1000', '-w', WORKDIR, sandboxId,
      'tar',
      '--exclude=./node_modules',
      '--exclude=./.git',
      '--exclude=./dist',
      '--exclude=./build',
      '--exclude=./.next',
      '-czf', '-', '.',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });

    const exit = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Docker snapshot tar failed (${code ?? 'unknown'}): ${stderr.slice(-4000)}`));
      });
    });

    await Promise.all([
      pipeline(child.stdout, createWriteStream(temporary, { mode: 0o600 })),
      exit,
    ]);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }

  const info = await stat(destination);
  return { sandboxId, bytes: info.size };
}

async function restoreContainer(sourceSandboxId: string): Promise<{ sourceSandboxId: string; sandboxId: string; bytes: number }> {
  const targetSandboxId = currentSandboxId();
  await assertManagedSandbox(targetSandboxId);

  const source = archivePath(sourceSandboxId);
  const sourceStat = await stat(source);

  await docker(['cp', source, `${targetSandboxId}:/tmp/open-lovable-session.tgz`]);
  await docker([
    'exec', '-u', '1000:1000', '-w', WORKDIR, targetSandboxId, 'sh', '-lc',
    `tar -xzf /tmp/open-lovable-session.tgz && rm -f /tmp/open-lovable-session.tgz && npm install --no-audit --no-fund`,
  ], 900000);

  if (global.activeSandboxProvider?.restartViteServer) {
    await global.activeSandboxProvider.restartViteServer();
  }

  await mkdir(SESSION_ROOT, { recursive: true, mode: 0o700 });
  await copyFile(source, archivePath(targetSandboxId));

  return { sourceSandboxId, sandboxId: targetSandboxId, bytes: sourceStat.size };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'snapshot') {
      const sandboxId = body?.sandboxId ? assertSandboxId(body.sandboxId) : currentSandboxId();
      const result = await snapshotContainer(sandboxId);
      return NextResponse.json({ success: true, action, ...result });
    }

    if (action === 'restore') {
      const sourceSandboxId = assertSandboxId(body?.sourceSandboxId);
      const result = await restoreContainer(sourceSandboxId);
      return NextResponse.json({ success: true, action, ...result });
    }

    return NextResponse.json({ success: false, error: 'action must be snapshot or restore' }, { status: 400 });
  } catch (error) {
    console.error('[session-snapshot] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Session snapshot failed',
    }, { status: 500 });
  }
}
