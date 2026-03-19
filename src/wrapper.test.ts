import { describe, expect, it } from 'vitest';
import { defineCommandLine } from './index.ts';

async function readInput(stream: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
  }
  return text;
}

describe('wrapper command line', () => {
  it('captures stdout, stderr, and merged output', async () => {
    const command = defineCommandLine({
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
    const command = defineCommandLine({
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
    const command = defineCommandLine({
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

  it('supports preset context and env via createInstance', async () => {
    const command = defineCommandLine<{
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
    }).createInstance({
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
});
