import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunningDockerContainer {
  containerId: string;
  host: string;
  port: number;
  stop(): Promise<void>;
}

export interface DockerContainerOptions {
  image: string;
  env: Record<string, string>;
  containerPort: number;
  platform?: string;
}

export async function startDockerContainer(
  options: DockerContainerOptions,
): Promise<RunningDockerContainer> {
  const args = ['run', '--rm', '-d', '-p', `127.0.0.1::${options.containerPort}`];

  if (options.platform) {
    args.push('--platform', options.platform);
  }

  Object.entries(options.env).forEach(([key, value]) => {
    args.push('-e', `${key}=${value}`);
  });

  args.push(options.image);

  const { stdout } = await execFileAsync('docker', args, {
    cwd: process.cwd(),
  });
  const containerId = stdout.trim();
  const port = await getMappedPort(containerId, options.containerPort);

  return {
    containerId,
    host: '127.0.0.1',
    port,
    async stop() {
      await execFileAsync('docker', ['rm', '-f', containerId], {
        cwd: process.cwd(),
      }).catch(() => undefined);
    },
  };
}

export async function waitFor(
  check: () => Promise<void>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Timed out waiting for dockerized database to become ready.');
}

async function getMappedPort(
  containerId: string,
  containerPort: number,
): Promise<number> {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'inspect',
      '--format',
      `{{(index (index .NetworkSettings.Ports "${containerPort}/tcp") 0).HostPort}}`,
      containerId,
    ],
    {
      cwd: process.cwd(),
    },
  );

  return Number(stdout.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
