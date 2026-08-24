import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';

const execFileAsync = promisify(execFile);
const WORKDIR = '/home/node/app';
const VITE_PORT = 5173;
const SANDBOX_LABEL = 'com.omk.open-lovable.sandbox=true';
const DEFAULT_IMAGE = 'node:22.23.2-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function ipv4OrLocal(value: string | undefined): string {
  const candidate = (value || '').trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)) {
    const valid = candidate.split('.').every(part => Number(part) >= 0 && Number(part) <= 255);
    if (valid) return candidate;
  }
  return '127.0.0.1';
}

export class LocalDockerProvider extends SandboxProvider {
  private containerName: string | null = null;
  private hostPort: number | null = null;
  private hostIp: string;
  private image: string;
  private dockerBin: string;

  constructor(config: any = {}) {
    super(config);
    const local = config.localDocker || {};
    this.image = local.image || process.env.LOCAL_SANDBOX_IMAGE || DEFAULT_IMAGE;
    this.hostIp = ipv4OrLocal(local.host || process.env.LOCAL_SANDBOX_HOST);
    this.dockerBin = process.env.LOCAL_SANDBOX_DOCKER_BIN || '/usr/bin/docker';
  }

  private async docker(args: string[], timeoutMs = 120000): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.dockerBin, args, {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      });
      return {
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        exitCode: 0,
        success: true,
      };
    } catch (error: any) {
      return {
        stdout: String(error?.stdout || ''),
        stderr: String(error?.stderr || error?.message || 'Docker command failed'),
        exitCode: typeof error?.code === 'number' ? error.code : 1,
        success: false,
      };
    }
  }

  private async dockerChecked(args: string[], timeoutMs = 120000): Promise<CommandResult> {
    const result = await this.docker(args, timeoutMs);
    if (!result.success) {
      throw new Error(`Docker command failed: ${result.stderr || result.stdout}`);
    }
    return result;
  }

  private requireContainer(): string {
    if (!this.containerName) {
      throw new Error('No active local Docker sandbox');
    }
    return this.containerName;
  }

  private normalizeRelative(input: string): string {
    let value = (input || '').trim().replace(/\\/g, '/');
    for (const prefix of [`${WORKDIR}/`, '/vercel/sandbox/', '/home/user/app/']) {
      if (value.startsWith(prefix)) {
        value = value.slice(prefix.length);
      }
    }
    value = value.replace(/^\/+/, '');
    const normalized = path.posix.normalize(value || '.');
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new Error(`Unsafe sandbox path: ${input}`);
    }
    return normalized;
  }

  private fullPath(input: string): string {
    return `${WORKDIR}/${this.normalizeRelative(input)}`;
  }

  private async writeViaStdin(fullPath: string, content: string): Promise<void> {
    const container = this.requireContainer();
    const dir = path.posix.dirname(fullPath);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.dockerBin,
        [
          'exec', '-i', '-u', '1000:1000', '-w', WORKDIR, container,
          'sh', '-lc', `mkdir -p ${shellQuote(dir)} && cat > ${shellQuote(fullPath)}`,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to write ${fullPath}: ${stderr || `docker exec exited ${code}`}`));
      });
      child.stdin.end(content, 'utf8');
    });
  }

  private async removeLabelledSandboxes(): Promise<void> {
    const listed = await this.docker(['ps', '-aq', '--filter', `label=${SANDBOX_LABEL}`], 30000);
    if (!listed.success || !listed.stdout.trim()) return;
    const ids = listed.stdout.split('\n').map(v => v.trim()).filter(Boolean);
    if (ids.length) {
      await this.dockerChecked(['rm', '-f', ...ids], 120000);
    }
  }

  async createSandbox(): Promise<SandboxInfo> {
    await this.terminate();
    await this.dockerChecked(['version', '--format', '{{.Server.Version}}'], 30000);

    const imagePresent = await this.docker(['image', 'inspect', this.image], 30000);
    if (!imagePresent.success) {
      await this.dockerChecked(['pull', this.image], 900000);
    }

    await this.removeLabelledSandboxes();

    const name = `open-lovable-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const memory = process.env.LOCAL_SANDBOX_MEMORY || this.config.localDocker?.memory || '1536m';
    const cpus = process.env.LOCAL_SANDBOX_CPUS || this.config.localDocker?.cpus || '2';
    const pids = String(process.env.LOCAL_SANDBOX_PIDS || this.config.localDocker?.pidsLimit || 512);

    await this.dockerChecked([
      'run', '-d', '--rm',
      '--name', name,
      '--label', SANDBOX_LABEL,
      '--init',
      '--user', '1000:1000',
      '--workdir', WORKDIR,
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true',
      '--pids-limit', pids,
      '--memory', memory,
      '--cpus', cpus,
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m',
      '--publish', `${this.hostIp}::${VITE_PORT}`,
      this.image,
      'sh', '-lc', 'trap "exit 0" TERM INT; while :; do sleep 3600 & wait $!; done',
    ], 180000);

    this.containerName = name;
    this.sandbox = { containerName: name };

    const portResult = await this.dockerChecked(['port', name, `${VITE_PORT}/tcp`], 30000);
    const first = portResult.stdout.trim().split('\n')[0] || '';
    const portMatch = first.match(/:(\d+)$/);
    if (!portMatch) {
      await this.terminate();
      throw new Error(`Could not determine published Vite port from: ${first}`);
    }
    this.hostPort = Number(portMatch[1]);

    this.sandboxInfo = {
      sandboxId: name,
      url: `http://${this.hostIp}:${this.hostPort}`,
      provider: 'local-docker',
      createdAt: new Date(),
    };
    return this.sandboxInfo;
  }

  async runCommand(command: string): Promise<CommandResult> {
    const container = this.requireContainer();
    return this.docker([
      'exec', '-u', '1000:1000', '-w', WORKDIR,
      container, 'sh', '-lc', command,
    ], 300000);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.writeViaStdin(this.fullPath(filePath), content);
  }

  async readFile(filePath: string): Promise<string> {
    const result = await this.runCommand(`cat ${shellQuote(this.fullPath(filePath))}`);
    if (!result.success) {
      throw new Error(`Failed to read ${filePath}: ${result.stderr}`);
    }
    return result.stdout;
  }

  async listFiles(directory: string = WORKDIR): Promise<string[]> {
    let target = '.';
    if (directory && ![WORKDIR, '/vercel/sandbox', '/home/user/app'].includes(directory)) {
      target = this.normalizeRelative(directory);
    }
    const command = `find ${shellQuote(target)} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/dist/*' -not -path '*/build/*' -print`;
    const result = await this.runCommand(command);
    if (!result.success) return [];
    return result.stdout
      .split('\n')
      .map(line => line.trim().replace(/^\.\//, ''))
      .filter(Boolean);
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    const flags = (process.env.NPM_FLAGS || '').trim().split(/\s+/).filter(Boolean);
    const args = [...flags, ...packages].map(shellQuote).join(' ');
    const result = await this.runCommand(`npm install --no-audit --no-fund ${args}`.trim());
    if (result.success && process.env.AUTO_RESTART_VITE === 'true') {
      await this.restartViteServer();
    }
    return result;
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandboxInfo || !this.hostPort) {
      throw new Error('Local Docker sandbox has not been created');
    }

    const packageJson = {
      name: 'sandbox-app',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite --host 0.0.0.0 --port 5173 --strictPort',
        build: 'vite build',
        preview: 'vite preview --host 0.0.0.0 --port 5173 --strictPort',
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.0.0',
        vite: '^4.3.9',
        tailwindcss: '^3.3.0',
        postcss: '^8.4.31',
        autoprefixer: '^10.4.16',
      },
    };

    const viteConfig = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    host: '0.0.0.0',\n    port: 5173,\n    strictPort: true,\n    allowedHosts: ['${this.hostIp}', 'localhost', '127.0.0.1'],\n    hmr: {\n      host: '${this.hostIp}',\n      clientPort: ${this.hostPort},\n      protocol: 'ws'\n    }\n  }\n})\n`;

    const tailwindConfig = `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n  theme: { extend: {} },\n  plugins: [],\n}\n`;
    const postcssConfig = `export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n`;
    const indexHtml = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Sandbox App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`;
    const mainJsx = `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n)\n`;
    const appJsx = `function App() {\n  return (\n    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">\n      <div className="text-center max-w-2xl">\n        <p className="text-lg text-gray-400">\n          Local Docker Sandbox Ready<br/>\n          Start building your React app with Vite and Tailwind CSS!\n        </p>\n      </div>\n    </div>\n  )\n}\n\nexport default App\n`;
    const indexCss = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;\n  background-color: rgb(17 24 39);\n}\n`;

    await this.writeFile('package.json', JSON.stringify(packageJson, null, 2));
    await this.writeFile('vite.config.js', viteConfig);
    await this.writeFile('tailwind.config.js', tailwindConfig);
    await this.writeFile('postcss.config.js', postcssConfig);
    await this.writeFile('index.html', indexHtml);
    await this.writeFile('src/main.jsx', mainJsx);
    await this.writeFile('src/App.jsx', appJsx);
    await this.writeFile('src/index.css', indexCss);

    const install = await this.runCommand('npm install --no-audit --no-fund');
    if (!install.success) {
      throw new Error(`Sandbox npm install failed: ${install.stderr || install.stdout}`);
    }

    await this.restartViteServer();
  }

  private async waitForVite(timeoutMs = 30000): Promise<void> {
    const url = this.getSandboxUrl();
    if (!url) throw new Error('Sandbox URL unavailable');
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (response.ok) return;
        lastError = `HTTP ${response.status}`;
      } catch (error: any) {
        lastError = error?.message || String(error);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Vite did not become ready at ${url}: ${lastError}`);
  }

  async restartViteServer(): Promise<void> {
    const stop = await this.runCommand("if [ -f /tmp/vite.pid ]; then kill $(cat /tmp/vite.pid) 2>/dev/null || true; rm -f /tmp/vite.pid; fi");
    if (!stop.success) {
      throw new Error(`Failed to stop Vite: ${stop.stderr || stop.stdout}`);
    }
    const start = await this.runCommand("nohup npm run dev > /tmp/vite.log 2>&1 & echo $! > /tmp/vite.pid");
    if (!start.success) {
      throw new Error(`Failed to start Vite: ${start.stderr || start.stdout}`);
    }
    await this.waitForVite();
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.containerName) {
      await this.docker(['rm', '-f', this.containerName], 120000);
    }
    this.containerName = null;
    this.hostPort = null;
    this.sandbox = null;
    this.sandboxInfo = null;
  }

  isAlive(): boolean {
    return Boolean(this.containerName);
  }
}
