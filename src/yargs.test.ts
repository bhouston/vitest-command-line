import { describe, expect, it } from 'vitest';
import yargs from 'yargs';
import { extendMatchers } from './index.js';
import { yargsCommandLine, YargsParseError } from './yargs.js';

extendMatchers();

type GreetContext = {
  greeting?: string;
};

function createGreetCli(context?: GreetContext) {
  return yargsCommandLine<GreetContext>({
    name: 'greet-cli',
    context,
    build: ({ argv, io, context: buildContext }) =>
      yargs(argv)
        .scriptName('greet-cli')
        .command(
          'greet <name>',
          'greet somebody',
          (y) =>
            y
              .positional('name', { type: 'string', demandOption: true })
              .option('shout', { type: 'boolean', default: false }),
          (parsed) => {
            const greeting = buildContext?.greeting ?? 'hello';
            const message = `${greeting} ${parsed.name}`;
            io.stdout.write(`${parsed.shout ? message.toUpperCase() : message}\n`);
          },
        )
        .command(
          'explode [code]',
          'always fails',
          (y) => y.positional('code', { type: 'number' }),
          (parsed) => {
            const error = new Error('explosion');
            if (parsed.code !== undefined) {
              (error as Error & { exitCode: number }).exitCode = parsed.code;
            }
            throw error;
          },
        )
        .command('log-help', 'prints via console', {}, () => {
          console.log('via console.log');
          console.error('via console.error');
        })
        .strict()
        .help(),
  });
}

describe('yargsCommandLine', () => {
  it('runs a command handler and captures its output', async () => {
    const cli = createGreetCli();

    const result = await cli.run(['greet', 'world']);

    expect(result).toSucceed();
    expect(result).toExitWith(0);
    expect(result).toHaveStdout('hello world\n');
    expect(result.command).toBe('greet-cli');
  });

  it('parses options and passes context through', async () => {
    const cli = createGreetCli({ greeting: 'howdy' });

    const result = await cli.run(['greet', 'world', '--shout']);

    expect(result).toSucceed();
    expect(result).toHaveStdout('HOWDY WORLD\n');
  });

  it('turns unknown commands into a failed result instead of exiting', async () => {
    const cli = createGreetCli();

    const result = await cli.run(['no-such-command']);

    expect(result).toFail();
    expect(result).toExitWith(1);
    expect(result).toHaveStderr(/unknown\s+(argument|command)/i);
    expect(result.error).toBeInstanceOf(YargsParseError);
  });

  it('turns missing required positionals into a failed result', async () => {
    const cli = createGreetCli();

    const result = await cli.run(['greet']);

    expect(result).toFail();
    expect(result).toHaveStderr(/not enough non-option arguments/i);
  });

  it('propagates handler errors with message on stderr', async () => {
    const cli = createGreetCli();

    const result = await cli.run(['explode']);

    expect(result).toFail();
    expect(result).toExitWith(1);
    expect(result).toHaveStderr('explosion');
  });

  it('honors error.exitCode thrown from handlers', async () => {
    const cli = createGreetCli();

    const result = await cli.run(['explode', '42']);

    expect(result).toFail();
    expect(result).toExitWith(42);
  });

  it('captures help output without exiting the process', async () => {
    const cli = createGreetCli();

    const result = await cli.run(['--help']);

    expect(result).toSucceed();
    expect(result).toHaveOutput(/greet <name>/);
    expect(result).toHaveOutput(/greet somebody/);
  });

  it('captures console output from handlers and restores the console', async () => {
    const originalLog = console.log;
    const originalError = console.error;

    const cli = createGreetCli();
    const result = await cli.run(['log-help']);

    expect(result).toHaveStdout('via console.log\n');
    expect(result).toHaveStderr('via console.error\n');
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });

  it('restores the console even when parsing throws', async () => {
    const originalLog = console.log;

    const cli = createGreetCli();
    const result = await cli.run(['no-such-command']);

    expect(result).toFail();
    expect(console.log).toBe(originalLog);
  });

  it('leaves the console alone when captureConsole is false', async () => {
    const cli = yargsCommandLine({
      name: 'quiet-cli',
      captureConsole: false,
      build: ({ argv, io }) =>
        yargs(argv).command('ping', 'ping', {}, () => {
          io.stdout.write('pong\n');
        }),
    });

    const result = await cli.run(['ping']);

    expect(result).toSucceed();
    expect(result).toHaveStdout('pong\n');
  });

  it('honors an explicit command vector with baked-in arguments', async () => {
    const cli = yargsCommandLine({
      command: ['my-cli', 'echo-args'],
      build: ({ argv, io }) =>
        yargs(argv).command('echo-args', 'echo argv', {}, () => {
          io.stdout.write(`${argv.join(' ')}\n`);
        }),
    });

    const result = await cli.run(['--extra']);

    expect(result).toSucceed();
    expect(result.command).toBe('my-cli echo-args');
    expect(result).toHaveStdout('echo-args --extra\n');
  });

  it('supports run options like timeout and env', async () => {
    const cli = yargsCommandLine({
      name: 'env-cli',
      build: ({ argv, io, env }) =>
        yargs(argv).command('show-env', 'show env', {}, () => {
          io.stdout.write(`${env.ADAPTER_VALUE ?? 'missing'}\n`);
        }),
    });

    const result = await cli.run(['show-env'], {
      env: { ADAPTER_VALUE: 'present' },
      timeout: 5_000,
    });

    expect(result).toSucceed();
    expect(result).toHaveStdout('present\n');
  });
});
