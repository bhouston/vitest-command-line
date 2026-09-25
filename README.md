# vitest-command-line

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]
[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-5865F2?logo=discord&logoColor=white)][discord-url]

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
- Use built-in Vitest matchers like `toSucceed()`, `toHaveStdout()`,
  `toHaveJsonStdout()`, `toCompleteWithin()`, and `toHaveTimedOut()`.
- Create disposable scratch directories and files for CLI fixtures and output
  assertions, with `await using` support and `copyFrom()` fixture seeding.
- Swap real subprocess execution for an injected wrapper runner when you want
  faster or more targeted tests.
- Test yargs-based CLIs in-process with the bundled `vitest-command-line/yargs`
  adapter.
- Strip ANSI escape codes from captured output with the `stripAnsi` run option.

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
import { commandLine, extendMatchers, type ScratchDirectory, scratchDirectory } from 'vitest-command-line';

extendMatchers();

describe('my-cli', () => {
  const cli = commandLine({
    command: ['node', './dist/cli.js'],
    name: 'my-cli',
    env: { FORCE_COLOR: '0' },
  });
  let directory: ScratchDirectory;

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
      cwd: directory.path,
      timeout: 5_000,
      subprocessCleanup: 'process-tree',
    });

    expect(result).toSucceed();
    expect(result).toHaveStdout(/build complete/i);
    expect(reportFile).toHaveFileContents();
  });
});
```

Scratch directories also support `await using` (explicit resource management),
which removes the directory automatically when the scope exits:

```ts
it('writes a report file', async () => {
  await using directory = scratchDirectory();
  await directory.create();
  // ... directory.remove() happens automatically
});
```

## Core API

- `commandLine({ command, name?, run?, cwd?, env?, ... })` defines a command
  target; run-related keys are used as defaults for every `run()`.
- `command.run(args?, options?)` runs the command and returns a `CommandResult`.
- `command.withOptions(options?)` returns a new command with additional or
  overridden run options (e.g. `cwd`, `env`, `timeout`, `stripAnsi`).
- `result.json<T>()` parses the captured stdout as JSON.
- `scratchDirectory()` returns a disposable `ScratchDirectory`. Call
  `create()` to materialize the directory on disk before using `file()`,
  `files()`, `dir()`, `copyFrom()`, and `remove()`. It implements
  `Symbol.asyncDispose`, so `await using` cleans it up automatically.
- `directory.copyFrom(sourcePath)` recursively seeds the scratch directory
  from a fixture/template directory.
- `extendMatchers()` installs custom Vitest matchers on `expect`.
- `stripAnsi(text)` removes ANSI escape sequences from a string; the
  `stripAnsi: true` run option applies it to all captured output.

## Matchers

After calling `extendMatchers()`:

- `toSucceed()` / `toFail()` — overall result state.
- `toExitWith(code)` — exact exit code.
- `toHaveStdout(text | regexp)` / `toHaveStderr(text | regexp)` /
  `toHaveOutput(text | regexp)` — stream content.
- `toHaveJsonStdout(expected)` — parse stdout as JSON and deep-compare.
- `toHaveTimedOut()` — the run hit its `timeout`.
- `toCompleteWithin(maxDurationMs)` — duration budget.
- `toExist()` / `toHaveFileContents()` / `toMatchFileContents(other)` —
  filesystem assertions for paths and scratch handles.

## Yargs Adapter

If your CLI is built with [yargs](https://yargs.js.org/), the
`vitest-command-line/yargs` entry point runs it in-process while keeping the
same `CommandResult` shape and matchers. The adapter applies
`exitProcess(false)` and a re-throwing `fail()` handler so parse failures
become assertable results, captures `console` output (help text, errors) into
the result, and honors an integer `exitCode` property on thrown errors.

```ts
import yargs from 'yargs';
import { expect, it } from 'vitest';
import { extendMatchers } from 'vitest-command-line';
import { yargsCommandLine } from 'vitest-command-line/yargs';

extendMatchers();

const cli = yargsCommandLine({
  name: 'my-cli',
  build: ({ argv, io }) =>
    yargs(argv)
      .scriptName('my-cli')
      .command('greet <name>', 'greet somebody', {}, (parsed) => {
        io.stdout.write(`hello ${parsed.name}\n`);
      })
      .strict()
      .help(),
});

it('greets', async () => {
  const result = await cli.run(['greet', 'world']);
  expect(result).toSucceed();
  expect(result).toHaveStdout('hello world\n');
});

it('rejects unknown commands without exiting the test process', async () => {
  const result = await cli.run(['nope']);
  expect(result).toFail();
  expect(result).toHaveStderr(/unknown/i);
});
```

`build` receives `{ argv, cwd, env, context, io, signal }` per invocation, so
you can inject test dependencies via `context` and route your CLI's logging
through `io`. The adapter does not depend on yargs itself (it uses a
structural type), so any yargs version with `exitProcess`, `fail`, and `parse`
works.

Note: console capture temporarily patches the global `console`, so disable it
with `captureConsole: false` if you run commands concurrently within one test
worker and rely on console interleaving.

## Development

```bash
pnpm install
pnpm dev
pnpm tsc
pnpm build
pnpm lint # oxlint
pnpm lint:fix
pnpm format # oxfmt
pnpm test # vitest
```

`pnpm build` emits the publishable package to `dist/`. Run `pnpm package:check`
to inspect the npm payload without publishing, and `pnpm size` to check its size.

CI enforces a few quality gates beyond build/lint/test: `pnpm test --coverage`
must report at least 95% coverage for statements, branches, functions, and
lines; `pnpm size` enforces a 20 kB gzip budget on the runtime JavaScript
(`dist/**/*.js`); and `pnpm package:check` (`npm pack --dry-run`) verifies the
published npm payload. Change these thresholds only with an explanation in the
PR.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the issue → branch → PR workflow.
PRs target `main`; merging runs quality checks but does not publish. Releases
run only through a manually dispatched `Release` workflow on `main`, which
generates versions and changelogs from Conventional Commits and publishes
through npm trusted publishing. See [release setup](docs/releasing.md) and the
[security policy](SECURITY.md).

## Testing Notes

- The self-tests live in `src/*.test.ts` and run with Vitest.
- Some subprocess tests use Unix-style tools such as `/bin/echo`, `/bin/cat`, and
  `/bin/sh`, so they currently assume a Unix-like environment.

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com)

[npm]: https://img.shields.io/npm/v/vitest-command-line
[npm-url]: https://www.npmjs.com/package/vitest-command-line
[npm-downloads]: https://img.shields.io/npm/dw/vitest-command-line
[npmtrends-url]: https://www.npmtrends.com/vitest-command-line
[tests-badge]: https://github.com/bhouston/vitest-command-line/actions/workflows/ci.yml/badge.svg
[tests-url]: https://github.com/bhouston/vitest-command-line/actions/workflows/ci.yml
[coverage-badge]: https://codecov.io/gh/bhouston/vitest-command-line/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/vitest-command-line
[discord-url]: https://discord.gg/fwupDN493R
