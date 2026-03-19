import type { CommandRunOptions } from './types.ts';

const RUN_OPTION_KEYS = [
  'context',
  'cwd',
  'env',
  'input',
  'timeout',
  'killSignal',
  'forceKillAfterMs',
  'subprocessCleanup',
] as const;

/**
 * Extract run-option keys from a command-line options object for use as initial
 * defaults. Only defined values are included.
 */
export function pickRunOptions<TContext>(
  options: Partial<CommandRunOptions<TContext>>,
): CommandRunOptions<TContext> {
  const result: CommandRunOptions<TContext> = {};
  for (const key of RUN_OPTION_KEYS) {
    if (options[key] !== undefined) {
      (result as Record<string, unknown>)[key] = options[key];
    }
  }
  return result;
}

export function mergeCommandRunOptions<TContext>(
  defaults: CommandRunOptions<TContext>,
  overrides: CommandRunOptions<TContext>,
): CommandRunOptions<TContext> {
  const merged: CommandRunOptions<TContext> = {
    ...defaults,
    ...overrides,
  };

  if (defaults.env || overrides.env) {
    merged.env = {
      ...defaults.env,
      ...overrides.env,
    };
  }

  merged.context = mergeContext(defaults.context, overrides.context);
  return merged;
}

function mergeContext<TContext>(
  defaults: TContext | undefined,
  overrides: TContext | undefined,
): TContext | undefined {
  if (overrides === undefined) {
    return defaults;
  }

  if (defaults === undefined) {
    return overrides;
  }

  if (isPlainObject(defaults) && isPlainObject(overrides)) {
    return {
      ...defaults,
      ...overrides,
    } as TContext;
  }

  return overrides;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
