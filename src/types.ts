import type { Readable } from 'node:stream';

export type CommandStream = 'stdout' | 'stderr';

export type CommandChunk = {
  stream: CommandStream;
  text: string;
  timestamp: number;
};

export type CommandResult = {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  output: string;
  chunks: CommandChunk[];
  error: unknown | null;
  success: boolean;
};

export type CommandTextWriter = {
  write: (chunk: string | Uint8Array) => void;
};

export type CommandIo = {
  stdin: Readable;
  stdout: CommandTextWriter;
  stderr: CommandTextWriter;
};

export type CommandInput = string | Uint8Array | Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>;

export type SubprocessCleanupMode = 'process' | 'process-tree';

/**
 * Options applied to a single `run()` call or baked into an instance via
 * `withOptions()` or as part of `commandLine()` options.
 *
 * Merge rules:
 * - top-level scalar fields (`cwd`, `timeout`, etc.) are overridden by the
 *   most specific value
 * - `env` is shallow-merged, with per-run values overriding instance defaults
 * - `context` is shallow-merged only when both values are plain objects;
 *   otherwise the more specific value replaces the default
 */
export type CommandRunOptions<TContext = undefined> = {
  context?: TContext;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: CommandInput;
  timeout?: number;
  killSignal?: NodeJS.Signals;
  forceKillAfterMs?: number;
  subprocessCleanup?: SubprocessCleanupMode;
};

export type WrapperCommandOutcome =
  | undefined
  | number
  | {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
    };

export type CommandRunnerInvocation<TContext = undefined> = {
  command: [string, ...string[]];
  cwd: string;
  env: NodeJS.ProcessEnv;
  context: TContext | undefined;
  io: CommandIo;
  signal: AbortSignal;
};

export type CommandRunner<TContext = undefined> = (
  invocation: CommandRunnerInvocation<TContext>,
) => Promise<WrapperCommandOutcome> | WrapperCommandOutcome;

export type CommandLineOptions<TContext = undefined> = {
  /**
   * Base command vector, equivalent to the executable and baked-in arguments a
   * subprocess invocation would use. Runtime `run(args)` values are appended to
   * this vector before execution or before calling a custom `run` override.
   */
  command: [string, ...string[]];
  name?: string;
  /**
   * Optional custom execution hook. When omitted, the command runs as a real
   * subprocess. When provided, it receives the full expanded command vector and
   * can emulate or redirect execution while keeping the same public API.
   */
  run?: CommandRunner<TContext>;
} & Partial<CommandRunOptions<TContext>>;

export type CommandLine<TContext = undefined> = {
  run: (args?: string[], options?: CommandRunOptions<TContext>) => Promise<CommandResult>;
  /**
   * Return an immutable derived command with additional or overridden run
   * options (e.g. `cwd`, `env`, `timeout`) baked in.
   */
  withOptions: (options?: CommandRunOptions<TContext>) => CommandLine<TContext>;
};

export type CommandState = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  error: unknown | null;
};
