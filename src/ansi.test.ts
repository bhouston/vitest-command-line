import { describe, expect, it } from 'vitest';
import { stripAnsi } from './ansi.js';
import { commandLine } from './index.js';

const RED_TEXT = '\u001B[31mred\u001B[0m';

describe('stripAnsi', () => {
  it('removes color codes', () => {
    expect(stripAnsi(RED_TEXT)).toBe('red');
    expect(stripAnsi('\u001B[1m\u001B[32mbold green\u001B[39m\u001B[22m')).toBe('bold green');
  });

  it('removes cursor movement and erase sequences', () => {
    expect(stripAnsi('\u001B[2K\u001B[1Gprogress 50%')).toBe('progress 50%');
  });

  it('removes OSC hyperlinks', () => {
    expect(stripAnsi('\u001B]8;;https://example.com\u0007label\u001B]8;;\u0007')).toBe('label');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain text\n')).toBe('plain text\n');
  });
});

describe('stripAnsi run option', () => {
  it('strips ANSI from wrapper results including chunks', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: ({ io }) => {
        io.stdout.write(`${RED_TEXT}\n`);
        io.stderr.write('\u001B[33mwarning\u001B[0m\n');
        return 0;
      },
    });

    const result = await command.run([], { stripAnsi: true });

    expect(result.stdout).toBe('red\n');
    expect(result.stderr).toBe('warning\n');
    expect(result.output).toBe('red\nwarning\n');
    expect(result.chunks.map((chunk) => chunk.text)).toEqual(['red\n', 'warning\n']);
  });

  it('preserves ANSI when the option is not set', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: ({ io }) => {
        io.stdout.write(RED_TEXT);
        return 0;
      },
    });

    const result = await command.run();
    expect(result.stdout).toBe(RED_TEXT);
  });

  it('strips ANSI from subprocess results', async () => {
    const command = commandLine({
      command: ['/bin/sh', '-c', `printf '\\033[31mred\\033[0m\\n'`],
      stripAnsi: true,
    });

    const result = await command.run();
    expect(result.stdout).toBe('red\n');
  });

  it('can be set as an instance default via withOptions', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: ({ io }) => {
        io.stdout.write(RED_TEXT);
        return 0;
      },
    }).withOptions({ stripAnsi: true });

    const result = await command.run();
    expect(result.stdout).toBe('red');
  });
});
