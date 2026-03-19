import type { Readable } from 'node:stream';

export async function pipeInput(input: Readable, output: NodeJS.WritableStream): Promise<void> {
  for await (const chunk of input) {
    if (!output.write(chunk)) {
      await new Promise<void>((resolve) => {
        output.once('drain', resolve);
      });
    }
  }
  output.end();
}
