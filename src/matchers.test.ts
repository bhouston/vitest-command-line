import { describe, expect, it } from 'vitest';
import { createScratch } from './index.ts';
import { extendCommandLineMatchers } from './matchers.ts';
import type { CommandResult } from './types.ts';

extendCommandLineMatchers();

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
    const scratch = await createScratch();

    try {
      const outputDir = await scratch.newDir('outputs');
      const missingFile = await outputDir.newFile({
        filename: 'missing.txt',
      });
      const firstFile = await outputDir.newFile({
        filename: 'first.txt',
        touch: true,
      });
      await outputDir.newFile({
        filename: 'second.txt',
        touch: true,
      });

      expect(firstFile).toExist();
      expect(firstFile.path).toExist();
      expect(missingFile).not.toExist();
    } finally {
      await scratch.cleanup();
    }
  });

  it('supports non-empty file assertions', async () => {
    const scratch = await createScratch();

    try {
      const outputDir = await scratch.newDir('outputs');
      const emptyFile = await outputDir.newFile({
        filename: 'empty.txt',
        touch: true,
      });
      const populatedFile = await outputDir.newFile({
        filename: 'populated.txt',
        content: 'hello world',
      });
      const missingFile = await outputDir.newFile({
        filename: 'missing.txt',
      });

      expect(populatedFile).toHaveFileContents();
      expect(emptyFile).not.toHaveFileContents();
      expect(missingFile).not.toHaveFileContents();
      expect(outputDir).not.toHaveFileContents();
    } finally {
      await scratch.cleanup();
    }
  });

  it('supports file content equality assertions', async () => {
    const scratch = await createScratch();

    try {
      const outputDir = await scratch.newDir('outputs');
      const original = await outputDir.newFile({
        filename: 'original.txt',
        content: 'same bytes',
      });
      const matchingCopy = await outputDir.newFile({
        filename: 'matching.txt',
        content: 'same bytes',
      });
      const differentFile = await outputDir.newFile({
        filename: 'different.txt',
        content: 'different bytes',
      });
      const missingFile = await outputDir.newFile({
        filename: 'missing.txt',
      });

      expect(original).toMatchFileContents(matchingCopy);
      expect(original.path).toMatchFileContents(matchingCopy.path);
      expect(original).not.toMatchFileContents(differentFile);
      expect(original).not.toMatchFileContents(missingFile);
      expect(outputDir).not.toMatchFileContents(original);
    } finally {
      await scratch.cleanup();
    }
  });
});
