import { format } from 'node:util';
import { commandLine } from './index.js';
import type { CommandIo, CommandLine, CommandRunOptions, CommandTextWriter } from './types.js';

/**
 * Structural subset of a yargs `Argv` instance. Using a structural type keeps
 * yargs out of this package's dependencies; any real yargs instance satisfies
 * it.
 */
export type YargsLike = {
  exitProcess: (enabled: boolean) => unknown;
  fail: (handler: (msg: string, error: Error | undefined, yargs?: unknown) => unknown) => unknown;
  parse: () => unknown;
};

export type YargsBuildInvocation<TContext = undefined> = {
  /**
   * Arguments after the program name (the first element of the command
   * vector), ready to pass to `yargs(argv)`.
   */
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  context: TContext | undefined;
  io: CommandIo;
  signal: AbortSignal;
};

export type YargsCommandLineOptions<TContext = undefined> = {
  /** Base command vector reported in results. Defaults to `[name ?? 'cli']`. */
  command?: [string, ...string[]];
  name?: string;
  /**
   * Build a yargs instance for one invocation, e.g. `yargs(argv).command(...)`.
   * The adapter applies `exitProcess(false)` and a re-throwing `fail()` handler
   * after this returns, so parse failures become assertable results instead of
   * killing the test process.
   */
  build: (invocation: YargsBuildInvocation<TContext>) => YargsLike | Promise<YargsLike>;
  /**
   * Redirect `console.log/info/debug` to captured stdout and
   * `console.warn/error` to captured stderr while the command runs, so yargs
   * help/error output is captured. Defaults to `true`.
   *
   * Note: the console is a process-wide global, so concurrent runs within one
   * worker may interleave captured console output.
   */
  captureConsole?: boolean;
} & Partial<CommandRunOptions<TContext>>;

/** Thrown for yargs validation failures that do not carry their own error. */
export class YargsParseError extends Error {
  readonly exitCode = 1;

  constructor(message: string) {
    super(message);
    this.name = 'YargsParseError';
  }
}

function createConsoleWriter(writer: CommandTextWriter): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    writer.write(`${format(...args)}\n`);
  };
}

function patchConsole(io: CommandIo): () => void {
  const original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };
  console.log = createConsoleWriter(io.stdout);
  console.info = createConsoleWriter(io.stdout);
  console.debug = createConsoleWriter(io.stdout);
  console.warn = createConsoleWriter(io.stderr);
  console.error = createConsoleWriter(io.stderr);
  return () => {
    Object.assign(console, original);
  };
}

/**
 * Create a command line backed by a yargs-based CLI running in-process. The
 * adapter wires yargs into the wrapper runner so the same `CommandResult`
 * shape and matchers work as with real subprocesses:
 *
 * - `exitProcess(false)` is applied so yargs never calls `process.exit`.
 * - A `fail()` handler re-throws so parse/validation failures surface as a
 *   failed result (exit code 1, message on stderr) instead of printed noise.
 * - Errors thrown by command handlers may carry an integer `exitCode`
 *   property to control the reported exit code.
 * - Console output (help text, errors) is captured into the result.
 */
export function yargsCommandLine<TContext = undefined>(
  options: YargsCommandLineOptions<TContext>,
): CommandLine<TContext> {
  const { build, captureConsole = true, command, name, ...runDefaults } = options;
  const baseCommand: [string, ...string[]] = command ?? [name ?? 'cli'];

  return commandLine<TContext>({
    ...runDefaults,
    command: baseCommand,
    name,
    run: async ({ command: fullCommand, cwd, env, context, io, signal }) => {
      const cli = await build({
        argv: fullCommand.slice(1),
        cwd,
        env,
        context,
        io,
        signal,
      });

      cli.exitProcess(false);
      cli.fail((msg, error) => {
        throw error ?? new YargsParseError(msg);
      });

      const restoreConsole = captureConsole ? patchConsole(io) : undefined;
      try {
        await cli.parse();
        return 0;
      } finally {
        restoreConsole?.();
      }
    },
  });
}
