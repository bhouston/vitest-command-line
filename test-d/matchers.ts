import { expect } from 'vitest';
import { extendMatchers, type CommandResult, type ScratchFile } from '../dist/index.js';

extendMatchers();

declare const result: CommandResult;
declare const scratchFile: ScratchFile;

expect(result).toSucceed();
expect(result).not.toFail();
expect(result).toExitWith(0);
expect(result).toExitWith(null);
expect(result).toHaveStdout('ok');
expect(result).toHaveStdout(/ok/);
expect(result).toHaveStderr('error');
expect(result).toHaveStderr(/error/);
expect(result).toHaveOutput('ok');
expect(result).toHaveOutput(/ok/);
expect(result).toHaveTimedOut();
expect(result).toHaveJsonStdout({ ok: true });
expect(result).toCompleteWithin(100);

expect(scratchFile).toExist();
expect(scratchFile.path).toExist();
expect(scratchFile).toHaveFileContents();
expect(scratchFile).toMatchFileContents('/tmp/expected.txt');
expect('/tmp/actual.txt').toMatchFileContents(scratchFile);

// @ts-expect-error toExitWith only accepts numeric exit codes or null.
expect(result).toExitWith('0');
