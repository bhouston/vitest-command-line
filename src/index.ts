import { mergeCommandRunOptions } from './defaults.ts';
import { runSubprocessCommand } from './subprocess.ts';
import type { CommandLine, CommandLineOptions, CommandRunOptions } from './types.ts';
import { runWrapperCommand } from './wrapper.ts';

export { commandLineMatchers, extendCommandLineMatchers } from './matchers.ts';
export type {
  Scratch,
  ScratchContent,
  ScratchDirectory,
  ScratchFile,
  ScratchFileInput,
  ScratchFileOptions,
  ScratchPathLike,
} from './scratch.ts';
export { createScratch } from './scratch.ts';
export type * from './types.ts';

/**
 * Define a command-line target that can run as a real subprocess or through an
 * optional injected runner. Returned command objects are immutable and support
 * `createInstance()` for layering defaults like `env`, `context`, and `cwd`.
 */
export function defineCommandLine<TContext = undefined>(
  options: CommandLineOptions<TContext>,
): CommandLine<TContext> {
  return createCommandLine(options, {});
}

function createCommandLine<TContext>(
  options: CommandLineOptions<TContext>,
  defaults: CommandRunOptions<TContext>,
): CommandLine<TContext> {
  return {
    run: (args = [], runOptions = {}) => {
      const mergedRunOptions = mergeCommandRunOptions(defaults, runOptions);
      if (options.run) {
        return runWrapperCommand(options, args, mergedRunOptions);
      }
      return runSubprocessCommand(options, args, mergedRunOptions);
    },
    createInstance: (instanceDefaults = {}) => {
      return createCommandLine(options, mergeCommandRunOptions(defaults, instanceDefaults));
    },
  };
}
