import { execFileSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ScratchDirectory, scratchDirectory } from './index.ts';
import { extendMatchers } from './matchers.ts';
import type { CommandResult } from './types.ts';

extendMatchers();

async function materializedScratch(): Promise<ScratchDirectory> {
  const directory = scratchDirectory();
  await directory.create();
  return directory;
}

const STDOUT_PATTERN = /stdout/;
const PROBLEM_TEXT_PATTERN = /problem text/;

function createResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: 'test',
    args: [],
    cwd: '/tmp',
    exitCode: 0,
    signal: null,
    timedOut: false,
    durationMs: 1,
    stdout: 'stdout text',
    stderr: '',
    output: 'stdout text',
    chunks: [],
    error: null,
    success: true,
    ...overrides,
  };
}

describe('command line matchers', () => {
  it('supports success and exit assertions', () => {
    const result = createResult();

    expect(result).toSucceed();
    expect(result).toExitWith(0);
  });

  it('supports stdout, stderr, and output assertions', () => {
    const result = createResult({
      stderr: 'problem text',
      output: 'stdout textproblem text',
    });

    expect(result).toHaveStdout(STDOUT_PATTERN);
    expect(result).toHaveStderr('problem');
    expect(result).toHaveOutput(PROBLEM_TEXT_PATTERN);
  });

  it('supports failure and timeout assertions', () => {
    const result = createResult({
      success: false,
      exitCode: 1,
      timedOut: true,
      error: new Error('timeout'),
    });

    expect(result).toFail();
    expect(result).toHaveTimedOut();
  });

  it('supports filesystem assertions for scratch handles and raw paths', async () => {
    const directory = await materializedScratch();

    try {
      const outputDir = await directory.dir('outputs');
      const missingFile = await outputDir.file({
        filename: 'missing.txt',
      });
      const firstFile = await outputDir.file({
        filename: 'first.txt',
        touch: true,
      });
      await outputDir.file({
        filename: 'second.txt',
        touch: true,
      });

      expect(firstFile).toExist();
      expect(firstFile.path).toExist();
      expect(missingFile).not.toExist();
    } finally {
      await directory.remove();
    }
  });

  it('supports non-empty file assertions', async () => {
    const directory = await materializedScratch();

    try {
      const outputDir = await directory.dir('outputs');
      const emptyFile = await outputDir.file({
        filename: 'empty.txt',
        touch: true,
      });
      const populatedFile = await outputDir.file({
        filename: 'populated.txt',
        content: 'hello world',
      });
      const missingFile = await outputDir.file({
        filename: 'missing.txt',
      });

      expect(populatedFile).toHaveFileContents();
      expect(emptyFile).not.toHaveFileContents();
      expect(missingFile).not.toHaveFileContents();
      expect(outputDir).not.toHaveFileContents();
    } finally {
      await directory.remove();
    }
  });

  it('supports file content equality assertions', async () => {
    const directory = await materializedScratch();

    try {
      const outputDir = await directory.dir('outputs');
      const original = await outputDir.file({
        filename: 'original.txt',
        content: 'same bytes',
      });
      const matchingCopy = await outputDir.file({
        filename: 'matching.txt',
        content: 'same bytes',
      });
      const differentFile = await outputDir.file({
        filename: 'different.txt',
        content: 'different bytes',
      });
      const missingFile = await outputDir.file({
        filename: 'missing.txt',
      });

      expect(original).toMatchFileContents(matchingCopy);
      expect(original.path).toMatchFileContents(matchingCopy.path);
      expect(original).not.toMatchFileContents(differentFile);
      expect(original).not.toMatchFileContents(missingFile);
      expect(outputDir).not.toMatchFileContents(original);
    } finally {
      await directory.remove();
    }
  });

  it('is safe to call extendMatchers more than once', () => {
    extendMatchers();
    extendMatchers();
    expect(createResult()).toSucceed();
  });

  it('rejects non-result values for command matchers', () => {
    expect(() => expect(null).toSucceed()).toThrow(TypeError);
    expect(() => expect({ stdout: '' }).toSucceed()).toThrow(TypeError);
  });

  it('rejects invalid path-like values for filesystem matchers', () => {
    expect(() => expect(42).toExist()).toThrow(TypeError);
    expect(() => expect({ path: 1 }).toHaveFileContents()).toThrow(TypeError);
    expect(() => expect('/tmp').toMatchFileContents({ path: null })).toThrow(TypeError);
  });

  it('surfaces mismatch messages when assertions fail', () => {
    expect(() => expect(createResult({ success: false })).toSucceed()).toThrow(
      /Expected command to succeed/,
    );
    expect(() => expect(createResult()).not.toSucceed()).toThrow(/Expected command not to succeed/);
    expect(() => expect(createResult()).toFail()).toThrow(/Expected command to fail/);
    expect(() => expect(createResult({ success: false })).not.toFail()).toThrow(
      /Expected command not to fail/,
    );
    expect(() => expect(createResult()).toExitWith(1)).toThrow(/exit with 1/);
    expect(() => expect(createResult({ exitCode: 1 })).not.toExitWith(1)).toThrow(/not to exit/);
    expect(() => expect(createResult()).toHaveStdout('nope')).toThrow(/stdout/);
    expect(() => expect(createResult()).not.toHaveStdout(STDOUT_PATTERN)).toThrow(
      /stdout not to match/,
    );
    expect(() => expect(createResult({ stderr: 'e' })).toHaveStderr('zzz')).toThrow(/stderr/);
    expect(() => expect(createResult({ stderr: 'e' })).not.toHaveStderr('e')).toThrow(
      /stderr not to match/,
    );
    expect(() => expect(createResult()).toHaveOutput('zzz')).toThrow(/merged output/);
    expect(() => expect(createResult()).not.toHaveOutput(/stdout/)).toThrow(
      /merged output not to match/,
    );
    expect(() => expect(createResult()).toHaveTimedOut()).toThrow(/time out/);
    expect(() => expect(createResult({ timedOut: true })).not.toHaveTimedOut()).toThrow(
      /not to time out/,
    );
  });

  it('formats paths in filesystem matcher failures', async () => {
    const directory = await materializedScratch();
    try {
      const outputDir = await directory.dir('out');
      const empty = await outputDir.file({ filename: 'empty.txt', touch: true });

      expect(() => expect('/___vitest_command_line_missing___').toExist()).toThrow(/exists: false/);
      expect(() => expect(outputDir.path).not.toExist()).toThrow(/type: directory/);
      expect(() => expect(empty.path).toHaveFileContents()).toThrow(/size: 0/);
      expect(() => expect(outputDir.path).toHaveFileContents()).toThrow(/type: directory/);
      const filled = await outputDir.file({ filename: 'filled.txt', content: 'bytes' });
      expect(() => expect(filled).not.toHaveFileContents()).toThrow(/not to have contents/);

      if (process.platform !== 'win32') {
        const fifoPath = join(outputDir.path, 'fifo');
        try {
          execFileSync('mkfifo', [fifoPath], { stdio: 'ignore' });
        } catch {
          return;
        }
        try {
          expect(() => expect(fifoPath).not.toExist()).toThrow(/type: other/);
        } finally {
          unlinkSync(fifoPath);
        }
      }
    } finally {
      await directory.remove();
    }
  });

  it('reports file comparison details when toMatchFileContents fails', async () => {
    const directory = await materializedScratch();
    try {
      const a = await directory.file({ filename: 'a.txt', content: 'a' });
      const b = await directory.file({ filename: 'b.txt', content: 'b' });
      expect(() => expect(a.path).toMatchFileContents(b.path)).toThrow(/actual file/);
      expect(() => expect(a.path).not.toMatchFileContents(a.path)).toThrow(/not to have equal/);
    } finally {
      await directory.remove();
    }
  });
});

describe('getPathStats error propagation', () => {
  it('rethrows unexpected stat errors', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const { chmod } = await import('node:fs/promises');
    const directory = await materializedScratch();
    try {
      const sub = await directory.dir('locked');
      const file = await sub.file({ filename: 'x.txt', content: 'data' });
      await chmod(sub.path, 0);

      expect(() => expect(file.path).toExist()).toThrow();
    } finally {
      try {
        const subPath = `${directory.path}/locked`;
        await chmod(subPath, 0o755);
      } catch {
        // best-effort restore for cleanup
      }
      await directory.remove();
    }
  });
});
