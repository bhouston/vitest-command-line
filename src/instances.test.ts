import { describe, expect, it } from 'vitest';
import { defineCommandLine } from './index.ts';

describe('command instances', () => {
  it('prefers per-run env over instance defaults', async () => {
    const command = defineCommandLine({
      command: ['virtual-cli'],
      run: ({ env, io }) => {
        io.stdout.write(
          `${env.SHARED_VALUE ?? ''}|${env.DEFAULT_ONLY ?? ''}|${env.RUN_ONLY ?? ''}`,
        );
        return 0;
      },
    }).createInstance({
      env: {
        SHARED_VALUE: 'default',
        DEFAULT_ONLY: 'from-defaults',
      },
    });

    const result = await command.run([], {
      env: {
        SHARED_VALUE: 'override',
        RUN_ONLY: 'from-run',
      },
    });

    expect(result.stdout).toBe('override|from-defaults|from-run');
  });

  it('shallow-merges plain object context and prefers per-run values', async () => {
    const command = defineCommandLine<{
      auth?: string;
      format?: string;
    }>({
      command: ['virtual-cli'],
      run: ({ context, io }) => {
        io.stdout.write(`${context?.auth ?? ''}|${context?.format ?? ''}`);
        return 0;
      },
    }).createInstance({
      context: {
        auth: 'token',
      },
    });

    const result = await command.run([], {
      context: {
        format: 'json',
      },
    });

    expect(result.stdout).toBe('token|json');
  });

  it('replaces non-object context values instead of merging them', async () => {
    const command = defineCommandLine<string>({
      command: ['virtual-cli'],
      run: ({ context, io }) => {
        io.stdout.write(context ?? '');
        return 0;
      },
    }).createInstance({
      context: 'default-context',
    });

    const result = await command.run([], {
      context: 'run-context',
    });

    expect(result.stdout).toBe('run-context');
  });

  it('supports chained instances with accumulated defaults', async () => {
    const base = defineCommandLine<{
      left?: string;
      right?: string;
    }>({
      command: ['virtual-cli'],
      run: ({ context, env, io, cwd }) => {
        io.stdout.write(
          `${context?.left ?? ''}|${context?.right ?? ''}|${env.PRESET ?? ''}|${cwd}`,
        );
        return 0;
      },
    });

    const instance = base
      .createInstance({
        context: { left: 'A' },
        env: { PRESET: 'one' },
      })
      .createInstance({
        context: { right: 'B' },
      });

    const result = await instance.run([], {
      cwd: '/tmp/vitest-command-line',
    });

    expect(result.stdout).toBe('A|B|one|/tmp/vitest-command-line');
  });
});
