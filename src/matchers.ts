import { readFileSync, type Stats, statSync } from 'node:fs';
import { expect } from 'vitest';
import type { CommandResult } from './types.js';

type CommandLineMatcher = {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
};

type CommandLineMatchers = {
  toSucceed: (received: unknown) => CommandLineMatcher;
  toFail: (received: unknown) => CommandLineMatcher;
  toExitWith: (received: unknown, expectedExitCode: number | null) => CommandLineMatcher;
  toHaveStdout: (received: unknown, expected: string | RegExp) => CommandLineMatcher;
  toHaveStderr: (received: unknown, expected: string | RegExp) => CommandLineMatcher;
  toHaveOutput: (received: unknown, expected: string | RegExp) => CommandLineMatcher;
  toHaveTimedOut: (received: unknown) => CommandLineMatcher;
  toExist: (received: unknown) => CommandLineMatcher;
  toHaveFileContents: (received: unknown) => CommandLineMatcher;
  toMatchFileContents: (received: unknown, expected: unknown) => CommandLineMatcher;
};

function isCommandResult(value: unknown): value is CommandResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stdout' in value &&
    'stderr' in value &&
    'exitCode' in value &&
    'success' in value
  );
}

function formatResult(result: CommandResult): string {
  return [
    `command: ${result.command}`,
    `args: ${JSON.stringify(result.args)}`,
    `cwd: ${result.cwd}`,
    `exitCode: ${String(result.exitCode)}`,
    `signal: ${String(result.signal)}`,
    `timedOut: ${String(result.timedOut)}`,
    `stdout: ${JSON.stringify(result.stdout)}`,
    `stderr: ${JSON.stringify(result.stderr)}`,
  ].join('\n');
}

function makeMismatchMessage(label: string, expected: string | RegExp, actual: string): string {
  return `${label} mismatch\nexpected: ${String(expected)}\nactual: ${JSON.stringify(actual)}`;
}

function matchesText(actual: string, expected: string | RegExp): boolean {
  if (typeof expected === 'string') {
    return actual.includes(expected);
  }
  return expected.test(actual);
}

function getPathStats(path: string): Stats | null {
  try {
    return statSync(path);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function resolvePathLike(received: unknown, matcherName: string): string {
  if (typeof received === 'string') {
    return received;
  }
  if (
    typeof received === 'object' &&
    received !== null &&
    'path' in received &&
    typeof (received as { path: unknown }).path === 'string'
  ) {
    return (received as { path: string }).path;
  }
  throw new TypeError(`${matcherName} expected a string path or an object with a string "path" property.`);
}

function formatPath(path: string): string {
  const stats = getPathStats(path);
  let type = 'missing';
  let size = 'n/a';
  if (stats !== null) {
    if (stats.isDirectory()) {
      type = 'directory';
    } else if (stats.isFile()) {
      type = 'file';
      size = String(stats.size);
    } else {
      type = 'other';
    }
  }
  return [`path: ${path}`, `exists: ${String(stats !== null)}`, `type: ${type}`, `size: ${size}`].join('\n');
}

function isRegularFile(stats: Stats | null): stats is Stats {
  return stats?.isFile() ?? false;
}

function formatFileComparison(actualPath: string, expectedPath: string): string {
  return [`actual file`, formatPath(actualPath), '', `expected file`, formatPath(expectedPath)].join('\n');
}

function assertCommandResult(received: unknown, matcherName: string): CommandResult {
  if (isCommandResult(received)) {
    return received;
  }
  throw new TypeError(`${matcherName} expected a CommandResult-compatible object.`);
}

export const commandLineMatchers: CommandLineMatchers = {
  toSucceed(received: unknown) {
    const result = assertCommandResult(received, 'toSucceed');
    const pass = result.success;
    return {
      pass,
      message: () =>
        pass
          ? `Expected command not to succeed.\n\n${formatResult(result)}`
          : `Expected command to succeed.\n\n${formatResult(result)}`,
      actual: result.success,
      expected: true,
    };
  },

  toFail(received: unknown) {
    const result = assertCommandResult(received, 'toFail');
    const pass = !result.success;
    return {
      pass,
      message: () =>
        pass
          ? `Expected command not to fail.\n\n${formatResult(result)}`
          : `Expected command to fail.\n\n${formatResult(result)}`,
      actual: result.success,
      expected: false,
    };
  },

  toExitWith(received: unknown, expectedExitCode: number | null) {
    const result = assertCommandResult(received, 'toExitWith');
    const pass = result.exitCode === expectedExitCode;
    return {
      pass,
      message: () =>
        pass
          ? `Expected command not to exit with ${String(expectedExitCode)}.\n\n${formatResult(result)}`
          : `Expected command to exit with ${String(expectedExitCode)}.\n\n${formatResult(result)}`,
      actual: result.exitCode,
      expected: expectedExitCode,
    };
  },

  toHaveStdout(received: unknown, expected: string | RegExp) {
    const result = assertCommandResult(received, 'toHaveStdout');
    const pass = matchesText(result.stdout, expected);
    return {
      pass,
      message: () =>
        pass
          ? `Expected stdout not to match.\n\n${makeMismatchMessage('stdout', expected, result.stdout)}`
          : `Expected stdout to match.\n\n${makeMismatchMessage('stdout', expected, result.stdout)}`,
      actual: result.stdout,
      expected,
    };
  },

  toHaveStderr(received: unknown, expected: string | RegExp) {
    const result = assertCommandResult(received, 'toHaveStderr');
    const pass = matchesText(result.stderr, expected);
    return {
      pass,
      message: () =>
        pass
          ? `Expected stderr not to match.\n\n${makeMismatchMessage('stderr', expected, result.stderr)}`
          : `Expected stderr to match.\n\n${makeMismatchMessage('stderr', expected, result.stderr)}`,
      actual: result.stderr,
      expected,
    };
  },

  toHaveOutput(received: unknown, expected: string | RegExp) {
    const result = assertCommandResult(received, 'toHaveOutput');
    const pass = matchesText(result.output, expected);
    return {
      pass,
      message: () =>
        pass
          ? `Expected merged output not to match.\n\n${makeMismatchMessage('output', expected, result.output)}`
          : `Expected merged output to match.\n\n${makeMismatchMessage('output', expected, result.output)}`,
      actual: result.output,
      expected,
    };
  },

  toHaveTimedOut(received: unknown) {
    const result = assertCommandResult(received, 'toHaveTimedOut');
    const pass = result.timedOut;
    return {
      pass,
      message: () =>
        pass
          ? `Expected command not to time out.\n\n${formatResult(result)}`
          : `Expected command to time out.\n\n${formatResult(result)}`,
      actual: result.timedOut,
      expected: true,
    };
  },

  toExist(received: unknown) {
    const path = resolvePathLike(received, 'toExist');
    const pass = getPathStats(path) !== null;
    return {
      pass,
      message: () =>
        pass ? `Expected path not to exist.\n\n${formatPath(path)}` : `Expected path to exist.\n\n${formatPath(path)}`,
      actual: pass,
      expected: true,
    };
  },

  toHaveFileContents(received: unknown) {
    const path = resolvePathLike(received, 'toHaveFileContents');
    const stats = getPathStats(path);
    const pass = isRegularFile(stats) && stats.size > 0;
    let actual: number | null | 'not-a-file' = null;
    if (isRegularFile(stats)) {
      actual = stats.size;
    } else if (stats !== null) {
      actual = 'not-a-file';
    }
    return {
      pass,
      message: () =>
        pass
          ? `Expected file not to have contents.\n\n${formatPath(path)}`
          : `Expected path to be a file with contents.\n\n${formatPath(path)}`,
      actual,
      expected: 'file with size > 0',
    };
  },

  toMatchFileContents(received: unknown, expected: unknown) {
    const actualPath = resolvePathLike(received, 'toMatchFileContents');
    const expectedPath = resolvePathLike(expected, 'toMatchFileContents');
    const actualStats = getPathStats(actualPath);
    const expectedStats = getPathStats(expectedPath);
    const pass =
      isRegularFile(actualStats) &&
      isRegularFile(expectedStats) &&
      readFileSync(actualPath).equals(readFileSync(expectedPath));

    return {
      pass,
      message: () =>
        pass
          ? `Expected files not to have equal contents.\n\n${formatFileComparison(actualPath, expectedPath)}`
          : `Expected files to have equal contents.\n\n${formatFileComparison(actualPath, expectedPath)}`,
      actual: actualPath,
      expected: expectedPath,
    };
  },
};

let installed = false;

export function extendMatchers(): void {
  if (installed) {
    return;
  }
  expect.extend(commandLineMatchers);
  installed = true;
}

declare module 'vitest' {
  // Vitest's Assertion interface uses `any` as its default type parameter.
  interface Assertion<T = any> {
    toSucceed(): T;
    toFail(): T;
    toExitWith(expectedExitCode: number | null): T;
    toHaveStdout(expected: string | RegExp): T;
    toHaveStderr(expected: string | RegExp): T;
    toHaveOutput(expected: string | RegExp): T;
    toHaveTimedOut(): T;
    toExist(): T;
    toHaveFileContents(): T;
    toMatchFileContents(expected: string | { path: string }): T;
  }

  interface AsymmetricMatchersContaining {
    toSucceed(): void;
    toFail(): void;
    toExitWith(expectedExitCode: number | null): void;
    toHaveStdout(expected: string | RegExp): void;
    toHaveStderr(expected: string | RegExp): void;
    toHaveOutput(expected: string | RegExp): void;
    toHaveTimedOut(): void;
    toExist(): void;
    toHaveFileContents(): void;
    toMatchFileContents(expected: string | { path: string }): void;
  }
}
