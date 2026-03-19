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

- Test real CLIs with a simple `defineCommandLine(...).run(...)` API.
- Capture `stdout`, `stderr`, combined output, exit code, signal, timeout, and
  stream chunks in one `CommandResult`.
- Reuse `cwd`, `env`, `context`, and timeout defaults with immutable command
  instances via `createInstance()`.
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

This example runs a real CLI, reuses stable defaults with `createInstance()`,
creates temporary files with `createScratch()`, and uses the bundled custom
matchers for readable assertions.

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  type Scratch,
  createScratch,
  defineCommandLine,
  extendCommandLineMatchers,
} from 'vitest-command-line';

extendCommandLineMatchers();

describe('my-cli', () => {
  const scratch: undefined | Scratch;

  beforeEach(async () => {
    scratch = await createScratch();
  });
  afterEach(async () => {
    scratch.cleanup();
    scratch = undefined;
  });

  it('writes a report file', async () => {
    const reportFile = await scratch.newFile('report.json');

    const cli = defineCommandLine({
      command: ['node', './dist/cli.js'],
      name: 'my-cli',
    }).createInstance({
      cwd: scratch.path,
      env: {
        FORCE_COLOR: '0',
      },
    });

    const result = await cli.run(['build', '--format', 'json', '--output', reportFile.path], {
      timeout: 5_000,
      subprocessCleanup: 'process-tree',
    });

    expect(result).toSucceed();
    expect(result).toHaveStdout(/build complete/i);
    //expect(reportFile).toExist(); - not needed, implied by toHaveFileContents()
    expect(reportFile).toHaveFileContents();
  });
```

## Core API

- `defineCommandLine({ command, name?, run? })` defines a reusable command target.
- `command.run(args?, options?)` runs the command and returns a `CommandResult`.
- `command.createInstance(defaults?)` derives a new immutable command with baked-in
  defaults such as `cwd`, `env`, `context`, or timeout behavior.
- `createScratch()` creates a disposable temp directory with helpers for creating
  files and subdirectories.
- `extendCommandLineMatchers()` installs custom Vitest matchers on `expect`.

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
