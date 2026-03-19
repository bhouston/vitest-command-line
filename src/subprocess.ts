import { spawn } from 'node:child_process';
import { createOutputCapture } from './capture.ts';
import { pipeInput } from './io.ts';
import { terminateChildProcess, usesProcessTreeCleanup } from './processTree.ts';
import { createInitialCommandState, finalizeCommandResult } from './result.ts';
import type { CommandLineOptions, CommandResult, CommandRunOptions } from './types.ts';

export async function runSubprocessCommand<TContext>(
  options: CommandLineOptions<TContext>,
  args: string[],
  runOptions: CommandRunOptions<TContext>,
): Promise<CommandResult> {
  const startedAt = Date.now();
  const capture = createOutputCapture(runOptions.input);
  const cwd = runOptions.cwd ?? process.cwd();
  const env = { ...process.env, ...runOptions.env };
  const [file, ...baseArgs] = options.command;
  const state = createInitialCommandState();
  const cleanupMode = runOptions.subprocessCleanup;

  await new Promise<void>((resolve) => {
    const child = spawn(file, [...baseArgs, ...args], {
      cwd,
      env,
      detached: usesProcessTreeCleanup(cleanupMode),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let forceKillTimer: NodeJS.Timeout | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    child.stdout?.on('data', (chunk: Buffer | string) => {
      capture.append('stdout', chunk);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      capture.append('stderr', chunk);
    });

    child.on('error', (error) => {
      state.error = error;
    });

    child.on('close', (exitCode, signal) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      state.exitCode = exitCode;
      state.signal = signal;
      resolve();
    });

    if (runOptions.timeout !== undefined) {
      timeoutId = setTimeout(() => {
        state.timedOut = true;
        state.error = new Error(`Command timed out after ${runOptions.timeout}ms`);
        terminateChildProcess(child, runOptions.killSignal ?? 'SIGTERM', cleanupMode);
        const forceKillAfterMs = runOptions.forceKillAfterMs ?? 2000;
        forceKillTimer = setTimeout(() => {
          terminateChildProcess(child, 'SIGKILL', cleanupMode);
        }, forceKillAfterMs);
      }, runOptions.timeout);
    }

    if (runOptions.input !== undefined) {
      void pipeInput(capture.io.stdin, child.stdin).catch((error: unknown) => {
        /* v8 ignore start — stdin may already be closed; difficult to reproduce portably */
        state.error = state.error ?? error;
        child.stdin.end();
        /* v8 ignore stop */
      });
      return;
    }

    child.stdin.end();
  });

  return finalizeCommandResult(
    options.name ?? [options.command[0], ...options.command.slice(1)].join(' '),
    args,
    cwd,
    startedAt,
    state,
    capture,
  );
}
