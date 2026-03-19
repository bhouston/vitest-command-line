# vitest-command-line

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]

Helpers and matchers for testing command-line tools with Vitest. `vitest-command-line`
gives you a small, typed API for running real subprocesses or injected wrapper
commands while capturing stdout, stderr, merged output, timing, and exit state in
one result object.

## Benefits

- Test real CLIs with a simple `commandLine(...).run(...)` API.
- Capture `stdout`, `stderr`, combined output, exit code, signal, timeout, and
  stream chunks in one `CommandResult`.
- Reuse `cwd`, `env`, `context`, and timeout via options or `withOptions()` for
  derived instances.
- Kill stuck subprocesses reliably, including whole process trees when needed.
- Use built-in Vitest matchers like `toSucceed()`, `toHaveStdout()`, and
  `toHaveTimedOut()`.
- Create disposable scratch directories and files for CLI fixtures and output
  assertions.
- Swap real subprocess execution for an injected wrapper runner when you want
  faster or more targeted tests.

## Install

```sh
pnpm add -D vitest vitest-command-line
```

`vitest` is a peer dependency because the matcher helpers extend Vitest's
`expect`.

## Usage

This example runs a real CLI with defaults in one options object, uses
`scratchDirectory()` for temporary files, and the bundled custom matchers for
assertions.

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commandLine,
  extendMatchers,
  scratchDirectory,
} from 'vitest-command-line';

extendMatchers();

describe('my-cli', () => {
  const cli = commandLine({
    command: ['node', './dist/cli.js'],
    name: 'my-cli',
    cwd: directory.path,
    env: { FORCE_COLOR: '0' },
  });
  let directory = scratchDirectory();

  beforeEach(async () => {
    directory = scratchDirectory();
    await directory.create();
  });

  afterEach(async () => {
    await directory.remove();
  });

  it('writes a report file', async () => {
    const reportFile = await directory.file('report.json');

    const result = await cli.run(['build', '--format', 'json', '--output', reportFile.path], {
      timeout: 5_000,
      subprocessCleanup: 'process-tree',
    });

    expect(result).toSucceed();
    expect(result).toHaveStdout(/build complete/i);
    expect(reportFile).toHaveFileContents();
  });
```

## Core API

- `commandLine({ command, name?, run?, cwd?, env?, ... })` defines a command
  target; run-related keys are used as defaults for every `run()`.
- `command.run(args?, options?)` runs the command and returns a `CommandResult`.
- `command.withOptions(options?)` returns a new command with additional or
  overridden run options (e.g. `cwd`, `env`, `timeout`).
- `scratchDirectory()` returns a disposable `ScratchDirectory`; call `create()`
  when you want to materialize it, then use helpers like `file()`, `files()`,
  `dir()`, and `remove()`.
- `scratchDir()` creates a disposable `ScratchDirectory` immediately when you
  prefer a one-step async helper.
- `extendMatchers()` installs custom Vitest matchers on `expect`.

## Local Development

```sh
pnpm install
pnpm build
pnpm test
pnpm test:coverage
pnpm lint
pnpm dev
pnpm make-release
```

`pnpm build` emits the publishable package to `dist/`. `pnpm make-release` builds,
stages the npm payload in `publish/`, copies `dist`, `README.md`, and `LICENSE`,
and then runs `npm publish`. For a non-publishing smoke test of the staged payload,
run `node scripts/make-release.mjs . --dry-run`.

## Testing Notes

- The self-tests live in `src/*.test.ts` and run with Vitest.
- Some subprocess tests use Unix-style tools such as `/bin/echo`, `/bin/cat`, and
  `/bin/sh`, so they currently assume a Unix-like environment.

## License

MIT

## Author

Created by [Ben Houston](https://benhouston3d.com) and sponsored by [Land of Assets](https://landofassets.com).

[npm]: https://img.shields.io/npm/v/vitest-command-line
[npm-url]: https://www.npmjs.com/package/vitest-command-line
[npm-downloads]: https://img.shields.io/npm/dw/vitest-command-line
[npmtrends-url]: https://www.npmtrends.com/vitest-command-line
[tests-badge]: https://github.com/bhouston/vitest-command-line/actions/workflows/test.yml/badge.svg
[tests-url]: https://github.com/bhouston/vitest-command-line/actions/workflows/test.yml
[coverage-badge]: https://codecov.io/gh/bhouston/vitest-command-line/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/vitest-command-line
