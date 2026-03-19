import { Readable } from 'node:stream';
import type {
  CommandChunk,
  CommandInput,
  CommandIo,
  CommandResult,
  CommandStream,
} from './types.ts';

export type OutputCapture = {
  append: (stream: CommandStream, chunk: string | Uint8Array) => void;
  snapshot: () => Pick<CommandResult, 'stdout' | 'stderr' | 'output' | 'chunks'>;
  io: CommandIo;
};

export function createOutputCapture(input?: CommandInput): OutputCapture {
  let stdout = '';
  let stderr = '';
  let output = '';
  const chunks: CommandChunk[] = [];

  const append = (stream: CommandStream, chunk: string | Uint8Array): void => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    if (text.length === 0) {
      return;
    }
    const timestamp = Date.now();
    chunks.push({ stream, text, timestamp });
    output += text;
    if (stream === 'stdout') {
      stdout += text;
      return;
    }
    stderr += text;
  };

  return {
    append,
    snapshot: () => ({
      stdout,
      stderr,
      output,
      chunks: [...chunks],
    }),
    io: {
      stdin: createInputReadable(input),
      stdout: {
        write: (chunk) => append('stdout', chunk),
      },
      stderr: {
        write: (chunk) => append('stderr', chunk),
      },
    },
  };
}

export function createInputReadable(input?: CommandInput): Readable {
  if (input === undefined) {
    return Readable.from([]);
  }
  if (typeof input === 'string' || input instanceof Uint8Array) {
    return Readable.from([input]);
  }
  return Readable.from(input);
}
