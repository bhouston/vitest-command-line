import { stripAnsi } from './ansi.js';
import type { OutputCapture } from './capture.js';
import type { CommandResult, CommandState } from './types.js';

export function createInitialCommandState(): CommandState {
  return {
    exitCode: null,
    signal: null,
    timedOut: false,
    error: null,
  };
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Resolve the exit code to report for a thrown error. Errors may carry a
 * conventional integer `exitCode` property (e.g. `error.exitCode = 2`) which
 * takes precedence over the fallback.
 */
export function resolveErrorExitCode(error: unknown, fallback = 1): number {
  if (typeof error === 'object' && error !== null && 'exitCode' in error) {
    const code = (error as { exitCode: unknown }).exitCode;
    if (typeof code === 'number' && Number.isInteger(code)) {
      return code;
    }
  }
  return fallback;
}

export function finalizeCommandResult(
  command: string,
  args: string[],
  cwd: string,
  startedAt: number,
  state: CommandState,
  capture: OutputCapture,
  options?: { stripAnsi?: boolean },
): CommandResult {
  const snapshot = capture.snapshot();
  const clean = options?.stripAnsi
    ? {
        stdout: stripAnsi(snapshot.stdout),
        stderr: stripAnsi(snapshot.stderr),
        output: stripAnsi(snapshot.output),
        chunks: snapshot.chunks.map((chunk) => ({ ...chunk, text: stripAnsi(chunk.text) })),
      }
    : snapshot;
  return {
    command,
    args,
    cwd,
    exitCode: state.exitCode,
    signal: state.signal,
    timedOut: state.timedOut,
    durationMs: Date.now() - startedAt,
    stdout: clean.stdout,
    stderr: clean.stderr,
    output: clean.output,
    chunks: clean.chunks,
    error: state.error,
    success: !state.timedOut && state.exitCode === 0 && state.signal === null && state.error === null,
    json: <T = unknown>(): T => JSON.parse(clean.stdout) as T,
  };
}
