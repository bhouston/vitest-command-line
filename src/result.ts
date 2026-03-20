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

export function finalizeCommandResult(
  command: string,
  args: string[],
  cwd: string,
  startedAt: number,
  state: CommandState,
  capture: OutputCapture,
): CommandResult {
  const snapshot = capture.snapshot();
  return {
    command,
    args,
    cwd,
    exitCode: state.exitCode,
    signal: state.signal,
    timedOut: state.timedOut,
    durationMs: Date.now() - startedAt,
    stdout: snapshot.stdout,
    stderr: snapshot.stderr,
    output: snapshot.output,
    chunks: snapshot.chunks,
    error: state.error,
    success: !state.timedOut && state.exitCode === 0 && state.signal === null && state.error === null,
  };
}
