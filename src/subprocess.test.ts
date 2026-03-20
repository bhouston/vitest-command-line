import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { commandLine } from './index.js';

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
  it('records spawn error and default command label when executable is missing', async () => {
    const missing = join(tmpdir(), `vitest-command-line-missing-${randomUUID()}`);
    const command = commandLine({
      command: [missing, '--arg'],
    });

    const result = await command.run(['extra']);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.command).toBe(`${missing} --arg`);
    // Node may report null or a negative errno-style code when spawn fails.
    expect(result.exitCode === null || (typeof result.exitCode === 'number' && result.exitCode < 0)).toBe(true);
  });

  it('captures stdout from echo', async () => {
    const command = commandLine({
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
    const command = commandLine({
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

  it('streams async-iterable stdin into cat', async () => {
    const command = commandLine({
      command: ['/bin/cat'],
      name: 'cat',
    });

    async function* input(): AsyncGenerator<string> {
      yield 'chunk-a';
      yield 'chunk-b';
    }

    const result = await command.run([], {
      input: input(),
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('chunk-achunk-b');
  });

  it('supports preset env via withOptions', async () => {
    const command = commandLine({
      command: ['/bin/sh', '-c'],
      name: 'shell',
    }).withOptions({
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
    const command = commandLine({
      command: ['/bin/sh', '-c'],
      name: 'shell',
    });

    const result = await command.run(['printf "problem\\n" 1>&2; exit 3']);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('problem\n');
  });

  // Skip in CI: default forceKillAfterMs can be large; test is timing-sensitive and flaky on runners.
  it.skipIf(process.env.CI === 'true')(
    'applies default forceKillAfterMs when only timeout is set',
    { timeout: 20_000 },
    async () => {
      if (process.platform === 'win32') {
        return;
      }

      const command = commandLine({
        command: ['/bin/sh', '-c'],
        name: 'shell',
      });

      const result = await command.run(['sleep 30'], {
        timeout: 80,
        subprocessCleanup: 'process',
      });

      expect(result.timedOut).toBe(true);
    },
  );

  it('uses killSignal and force-kill timer on timeout', { timeout: 10_000 }, async () => {
    if (process.platform === 'win32') {
      return;
    }

    const command = commandLine({
      command: ['node'],
      name: 'node-ignore-signals',
    });

    // Ignore soft signals so the SIGKILL follow-up timer actually runs.
    const result = await command.run(
      ['-e', 'process.on("SIGINT", () => {}); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'],
      {
        timeout: 400,
        killSignal: 'SIGINT',
        forceKillAfterMs: 500,
        subprocessCleanup: 'process',
      },
    );

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });

  it('can clean up a subprocess tree on timeout', { timeout: 5000 }, async () => {
    if (process.platform === 'win32') {
      return;
    }

    const command = commandLine({
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
