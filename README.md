<p align="center">
  <a href="https://npmjs.com/package/vitest-command-line"><img src="https://img.shields.io/npm/v/vitest-command-line.svg" alt="npm package"></a>
  <a href="https://www.npmtrends.com/vitest-command-line"><img src="https://img.shields.io/npm/dw/vitest-command-line.svg" alt="npm downloads"></a>
  <a href="https://codecov.io/gh/bhouston/vitest-command-line"><img src="https://codecov.io/gh/bhouston/vitest-command-line/branch/main/graph/badge.svg" alt="coverage"></a>
  <a href="https://discord.gg/fwupDN493R"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat&logo=discord" alt="discord chat"></a>
</p>
<br/>

# vitest-command-line

> Run real CLIs from Vitest and assert on everything they print.

- 🧪 Test Real CLIs
- 📦 One Result for All Output
- 🎯 Built-in Vitest Matchers
- 🌳 Kills Whole Process Trees
- 📁 Disposable Scratch Directories
- 🧶 In-Process yargs Adapter

`vitest-command-line` gives you a small, typed API for running real subprocesses or injected wrapper commands
while capturing stdout, stderr, merged output, timing, and exit state in one result object.

## Features

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

PRs target `main`; merging runs quality checks but does not publish.

## Testing Notes

- The self-tests live in `src/*.test.ts` and run with Vitest.
- Some subprocess tests use Unix-style tools such as `/bin/echo`, `/bin/cat`, and
  `/bin/sh`, so they currently assume a Unix-like environment.

## Releases

See [RELEASING.md](RELEASING.md) for how releases are published and [GitHub Releases](https://github.com/bhouston/vitest-command-line/releases) for changes. See the [security policy](SECURITY.md).

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com).
