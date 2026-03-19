import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { defineCommandLine } from './index.ts';

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await sleep(25);
  }
  return false;
}

describe('subprocess command line', () => {
  it('captures stdout from echo', async () => {
    const command = defineCommandLine({
      command: ['/bin/echo'],
      name: 'echo',
    });

    const result = await command.run(['hello world']);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello world\n');
    expect(result.stderr).toBe('');
    expect(result.output).toBe('hello world\n');
  });

  it('streams stdin into cat', async () => {
    const command = defineCommandLine({
      command: ['/bin/cat'],
      name: 'cat',
    });

    const result = await command.run([], {
      input: 'alpha\nbeta\n',
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('alpha\nbeta\n');
    expect(result.stderr).toBe('');
  });

  it('supports preset env via createInstance', async () => {
    const command = defineCommandLine({
      command: ['/bin/sh', '-c'],
      name: 'shell',
    }).createInstance({
      env: {
        PRESET_VALUE: 'preset',
      },
    });

    const result = await command.run(['printf "%s:%s" "$PRESET_VALUE" "$RUNTIME_VALUE"'], {
      env: {
        RUNTIME_VALUE: 'runtime',
      },
    });

    expect(result.stdout).toBe('preset:runtime');
  });

  it('captures stderr and exit codes', async () => {
    const command = defineCommandLine({
      command: ['/bin/sh', '-c'],
      name: 'shell',
    });

    const result = await command.run(['printf "problem\\n" 1>&2; exit 3']);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('problem\n');
  });

  it('can clean up a subprocess tree on timeout', { timeout: 5000 }, async () => {
    if (process.platform === 'win32') {
      return;
    }

    const command = defineCommandLine({
      command: ['/bin/sh', '-c'],
      name: 'shell',
    });

    const result = await command.run(['sleep 10 & echo $!; wait'], {
      timeout: 100,
      forceKillAfterMs: 100,
      subprocessCleanup: 'process-tree',
    });

    const childPid = Number.parseInt(result.stdout.trim(), 10);
    expect(Number.isFinite(childPid)).toBe(true);
    expect(result.timedOut).toBe(true);

    const exited = await waitForProcessExit(childPid, 1500);
    if (!exited) {
      process.kill(childPid, 'SIGKILL');
    }
    expect(exited).toBe(true);
  });
});
