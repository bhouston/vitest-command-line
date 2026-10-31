import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { pipeInput } from './io.js';

describe('pipeInput', () => {
  it('waits for drain when the writable returns false', async () => {
    const chunks: Buffer[] = [];
    let firstWrite = true;
    let drained = false;

    const output = {
      writable: true,
      write(
        chunk: string | Uint8Array,
        encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
        maybeCallback?: (error?: Error | null) => void,
      ) {
        const callback = typeof encodingOrCallback === 'function' ? encodingOrCallback : maybeCallback;
        chunks.push(Buffer.from(chunk));
        if (firstWrite) {
          firstWrite = false;
          callback?.();
          return false;
        }
        callback?.();
        return true;
      },
      once(event: string, listener: (...args: unknown[]) => void) {
        if (event === 'drain') {
          queueMicrotask(() => {
            drained = true;
            listener();
          });
        }
        return output;
      },
      end(_chunk?: unknown, _encoding?: unknown, callback?: () => void) {
        callback?.();
        return output;
      },
    } as unknown as NodeJS.WritableStream;

    const input = Readable.from([Buffer.from('a'), Buffer.from('b')]);

    await pipeInput(input, output);

    expect(drained).toBe(true);
    expect(Buffer.concat(chunks).toString()).toBe('ab');
  });
});
