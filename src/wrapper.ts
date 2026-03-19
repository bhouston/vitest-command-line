import { createOutputCapture } from './capture.ts';
import { createInitialCommandState, finalizeCommandResult, normalizeError } from './result.ts';
import type {
  CommandLineOptions,
  CommandResult,
  CommandRunOptions,
  WrapperCommandOutcome,
} from './types.ts';

export async function runWrapperCommand<TContext>(
  options: CommandLineOptions<TContext>,
  args: string[],
  runOptions: CommandRunOptions<TContext>,
): Promise<CommandResult> {
  const startedAt = Date.now();
  const capture = createOutputCapture(runOptions.input);
  const cwd = runOptions.cwd ?? process.cwd();
  const env = { ...process.env, ...runOptions.env };
  const controller = new AbortController();
  const state = createInitialCommandState();
  const command = [...options.command, ...args] as [string, ...string[]];

  if (!options.run) {
    throw new Error('Command runner is required for wrapper execution.');
  }

  const runnerPromise = Promise.resolve(
    options.run({
      command,
      cwd,
      env,
      context: runOptions.context,
      io: capture.io,
      signal: controller.signal,
    }),
  );

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise =
    runOptions.timeout === undefined
      ? null
      : new Promise<{ kind: 'timeout' }>((resolve) => {
          timeoutId = setTimeout(() => {
            state.timedOut = true;
            state.error = new Error(`Command timed out after ${runOptions.timeout}ms`);
            controller.abort(state.error);
            resolve({ kind: 'timeout' });
          }, runOptions.timeout);
        });

  const raceEntries: Promise<
    | { kind: 'result'; value: WrapperCommandOutcome }
    | { kind: 'error'; error: unknown }
    | { kind: 'timeout' }
  >[] = [
    runnerPromise
      .then((value) => ({ kind: 'result' as const, value }))
      .catch((error: unknown) => ({ kind: 'error' as const, error })),
  ];
  if (timeoutPromise !== null) {
    raceEntries.push(timeoutPromise);
  }
  const outcome = await Promise.race(raceEntries);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (outcome.kind === 'result') {
    if (typeof outcome.value === 'number') {
      state.exitCode = outcome.value;
    } else if (outcome.value && typeof outcome.value === 'object') {
      state.exitCode = outcome.value.exitCode ?? 0;
      state.signal = outcome.value.signal ?? null;
    } else {
      state.exitCode = 0;
    }
  } else if (outcome.kind === 'error') {
    state.exitCode = 1;
    state.error = outcome.error;
    if (capture.snapshot().stderr.length === 0) {
      capture.append('stderr', `${normalizeError(outcome.error)}\n`);
    }
  }

  return finalizeCommandResult(
    options.name ?? options.command.join(' '),
    args,
    cwd,
    startedAt,
    state,
    capture,
  );
}
