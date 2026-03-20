import { mergeCommandRunOptions, pickRunOptions } from './defaults.js';
import { runSubprocessCommand } from './subprocess.js';
import type { CommandLine, CommandLineOptions, CommandRunOptions } from './types.js';
import { runWrapperCommand } from './wrapper.js';

export { commandLineMatchers, extendMatchers } from './matchers.js';
export type {
  ScratchContent,
  ScratchDirectory,
  ScratchFile,
  ScratchFileInput,
  ScratchFileOptions,
  ScratchPathLike,
} from './scratch.js';
export { scratchDirectory } from './scratch.js';
export type * from './types.js';

/**
 * Create a command-line target that can run as a real subprocess or through an
 * optional injected runner. Options may include run defaults (e.g. `cwd`, `env`,
 * `timeout`); use `withOptions()` to further customize a derived instance.
 */
export function commandLine<TContext = undefined>(options: CommandLineOptions<TContext>): CommandLine<TContext> {
  return createCommandLine(options, pickRunOptions(options));
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
    withOptions: (runOptions = {}) => {
      return createCommandLine(options, mergeCommandRunOptions(defaults, runOptions));
    },
  };
}
