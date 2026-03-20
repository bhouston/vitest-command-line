import { describe, expect, it } from 'vitest';
import { mergeCommandRunOptions, pickRunOptions } from './defaults.js';

describe('pickRunOptions', () => {
  it('copies only defined run option keys', () => {
    const picked = pickRunOptions({
      cwd: '/tmp',
      env: { A: '1' },
      timeout: 100,
      killSignal: 'SIGINT',
      forceKillAfterMs: 50,
      subprocessCleanup: 'process-tree',
      context: { x: 1 },
      input: 'stdin',
      extraUnknown: 'ignored',
    } as Parameters<typeof pickRunOptions>[0] & { extraUnknown?: string });

    expect(picked).toEqual({
      cwd: '/tmp',
      env: { A: '1' },
      timeout: 100,
      killSignal: 'SIGINT',
      forceKillAfterMs: 50,
      subprocessCleanup: 'process-tree',
      context: { x: 1 },
      input: 'stdin',
    });
    expect('extraUnknown' in picked).toBe(false);
  });

  it('returns an empty object when no run keys are set', () => {
    expect(pickRunOptions({})).toEqual({});
  });
});

describe('mergeCommandRunOptions', () => {
  it('overrides scalars and shallow-merges env and plain object context', () => {
    const merged = mergeCommandRunOptions(
      {
        cwd: '/a',
        env: { X: '1', Y: '2' },
        context: { left: true },
        timeout: 100,
      },
      {
        cwd: '/b',
        env: { Y: '3', Z: '4' },
        context: { right: true },
        timeout: 200,
      },
    );

    expect(merged.cwd).toBe('/b');
    expect(merged.timeout).toBe(200);
    expect(merged.env).toEqual({ X: '1', Y: '3', Z: '4' });
    expect(merged.context).toEqual({ left: true, right: true });
  });

  it('keeps defaults when overrides omit context or env', () => {
    expect(mergeCommandRunOptions({ context: { a: 1 }, env: { K: 'v' } }, { cwd: '/x' })).toEqual({
      cwd: '/x',
      context: { a: 1 },
      env: { K: 'v' },
    });
  });

  it('replaces context when the default is undefined', () => {
    expect(mergeCommandRunOptions({}, { context: { only: 1 } }).context).toEqual({ only: 1 });
  });

  it('replaces context when the override is not a plain object', () => {
    expect(mergeCommandRunOptions({ context: { a: 1 } }, { context: 'run' as unknown as { a: number } }).context).toBe(
      'run',
    );
  });

  it('replaces context when the default is not a plain object', () => {
    expect(
      mergeCommandRunOptions(
        { context: 'base' as unknown as Record<string, never> },
        {
          context: { obj: true },
        },
      ).context,
    ).toEqual({ obj: true });
  });
});
