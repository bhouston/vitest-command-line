import { describe, expect, it } from 'vitest';
import { commandLine } from './index.ts';
import { runWrapperCommand } from './wrapper.ts';

async function readInput(stream: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
  }
  return text;
}

describe('wrapper command line', () => {
  it('captures stdout, stderr, and merged output', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      name: 'wrapper',
      run: ({ command, io }) => {
        expect(command).toEqual(['virtual-cli']);
        io.stdout.write('out-1\n');
        io.stderr.write('err-1\n');
        io.stdout.write('out-2\n');
        return 0;
      },
    });

    const result = await command.run();

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('out-1\nout-2\n');
    expect(result.stderr).toBe('err-1\n');
    expect(result.output).toBe('out-1\nerr-1\nout-2\n');
  });

  it('passes stdin through the wrapper io', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      name: 'wrapper',
      run: async ({ command, io }) => {
        expect(command).toEqual(['virtual-cli']);
        const input = await readInput(io.stdin);
        io.stdout.write(input.toUpperCase());
        return { exitCode: 0 };
      },
    });

    const result = await command.run([], {
      input: 'hello wrapper\n',
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('HELLO WRAPPER\n');
  });

  it('passes the base command and runtime args as one vector', async () => {
    const command = commandLine({
      command: ['virtual-cli', '--flag'],
      name: 'wrapper',
      run: ({ command, io }) => {
        io.stdout.write(command.join(' '));
        return 0;
      },
    });

    const result = await command.run(['sub', '--value', '123']);

    expect(result.stdout).toBe('virtual-cli --flag sub --value 123');
  });

  it('supports preset context and env via withOptions', async () => {
    const command = commandLine<{
      prefix?: string;
      suffix?: string;
    }>({
      command: ['virtual-cli'],
      name: 'wrapper',
      run: ({ context, env, io }) => {
        io.stdout.write(
          `${context?.prefix ?? ''}${env.RUNTIME_VALUE ?? ''}${context?.suffix ?? ''}`,
        );
        return 0;
      },
    }).withOptions({
      context: {
        prefix: '[',
      },
      env: {
        PRESET_VALUE: 'unused',
      },
    });

    const result = await command.run([], {
      context: {
        suffix: ']',
      },
      env: {
        RUNTIME_VALUE: 'value',
      },
    });

    expect(result.stdout).toBe('[value]');
  });

  it('ignores empty writes on capture streams', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      name: 'wrapper',
      run: ({ io }) => {
        io.stdout.write('');
        io.stdout.write(new Uint8Array());
        io.stderr.write(Buffer.alloc(0));
        io.stdout.write('ok\n');
        return 0;
      },
    });

    const result = await command.run();
    expect(result.stdout).toBe('ok\n');
    expect(result.chunks).toHaveLength(1);
  });

  it('treats an implicit void return as exit code 0', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: () => {
        // undefined
      },
    });

    const result = await command.run();
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
  });

  it('accepts numeric and object outcomes including signal', async () => {
    const seven = commandLine({
      command: ['virtual-cli'],
      run: () => 7,
    });
    expect((await seven.run()).exitCode).toBe(7);

    const signaled = commandLine({
      command: ['virtual-cli'],
      run: () => ({ signal: 'SIGTERM' as const }),
    });
    const sigResult = await signaled.run();
    expect(sigResult.exitCode).toBe(0);
    expect(sigResult.signal).toBe('SIGTERM');
  });

  it('times out and aborts a slow wrapper run', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: async ({ signal }) => {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 60_000);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            resolve();
          });
        });
        return 0;
      },
    });

    const result = await command.run([], { timeout: 40 });
    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });

  it('maps thrown errors to exit code 1 and stderr', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: async () => {
        throw new Error('wrapper boom');
      },
    });

    const result = await command.run();
    expect(result.exitCode).toBe(1);
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('wrapper boom');
  });

  it('stringifies non-Error rejections for stderr', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: () => Promise.reject('plain string fail'),
    });

    const result = await command.run();
    expect(result.stderr).toContain('plain string fail');
  });

  it('does not duplicate stderr when the runner already wrote there', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: async ({ io }) => {
        io.stderr.write('already here\n');
        throw new Error('after stderr');
      },
    });

    const result = await command.run();
    expect(result.stderr).toBe('already here\n');
    expect(result.stderr).not.toContain('after stderr');
  });

  it('feeds sync iterable stdin to the runner', async () => {
    const command = commandLine({
      command: ['virtual-cli'],
      run: async ({ io }) => {
        const text = await readInput(io.stdin);
        io.stdout.write(text);
        return 0;
      },
    });

    function* chunks() {
      yield 'a';
      yield 'b';
    }

    const result = await command.run([], { input: chunks() });
    expect(result.stdout).toBe('ab');
  });

  it('rejects direct wrapper invocation without a runner', async () => {
    await expect(runWrapperCommand({ command: ['only-cli'] }, [], {})).rejects.toThrow(
      'Command runner is required',
    );
  });
});
