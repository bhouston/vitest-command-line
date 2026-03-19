import { describe, expect, it } from 'vitest';
import { createScratch, extendCommandLineMatchers } from './index.ts';

extendCommandLineMatchers();

describe('scratch helper', () => {
  it('creates deferred, seeded, and touched files', async () => {
    const scratch = await createScratch({
      prefix: 'vitest-command-line-test-',
    });

    try {
      const deferred = await scratch.newFile({
        filename: 'deferred.txt',
      });
      const shorthand = await scratch.newFile('shorthand.txt');
      const seeded = await scratch.newFile({
        filename: 'seeded.txt',
        content: 'hello world',
      });
      const encoded = await scratch.newFile({
        filename: 'encoded.txt',
        content: 'hello encoded',
        encoding: 'utf16le',
      });
      const binary = await scratch.newFile({
        filename: 'binary.bin',
        content: Buffer.from([1, 2, 3]),
      });
      const touched = await scratch.newFile({
        filename: 'empty.txt',
        touch: true,
      });

      expect(deferred.exists).toBe(false);
      expect(shorthand.exists).toBe(false);
      expect(seeded).toExist();
      expect(encoded).toExist();
      expect(binary).toExist();
      expect(touched).toExist();

      expect(await seeded.readText()).toBe('hello world');
      expect(await encoded.readText('utf16le')).toBe('hello encoded');
      expect(await binary.readBuffer()).toEqual(Buffer.from([1, 2, 3]));
      expect(await touched.readText()).toBe('');
      expect(seeded).toHaveFileContents();
      expect(seeded).toMatchFileContents(seeded.path);
      expect(seeded).not.toMatchFileContents(encoded);

      await deferred.write('written later');
      expect(deferred).toExist();
      expect(await deferred.readText()).toBe('written later');
    } finally {
      await scratch.cleanup();
    }
  });

  it('supports custom extensions, nested paths, and explicit file listing', async () => {
    const scratch = await createScratch();

    try {
      const outputDir = await scratch.newDir('outputs');
      const nestedDir = await outputDir.newDir('nested');
      const report = await outputDir.newFile({
        name: 'report',
        ext: 'txt',
        content: 'summary',
      });
      const generated = await outputDir.newFile({
        relativePath: 'nested/generated.bin',
        touch: true,
      });
      const rootFile = await outputDir.newFile('root.txt');

      expect(outputDir.exists).toBe(true);
      expect(outputDir.entries()).toEqual(['nested', 'report.txt']);
      expect((await outputDir.getFiles()).map((file) => file.path.split('/').pop())).toEqual([
        'report.txt',
      ]);
      expect(
        (await nestedDir.getFiles()).map((file) => file.path.endsWith('generated.bin')),
      ).toEqual([true]);
      expect(report.path.endsWith('report.txt')).toBe(true);
      expect(generated.path.endsWith('nested/generated.bin')).toBe(true);
      expect(rootFile.path.endsWith('root.txt')).toBe(true);
      expect(rootFile.exists).toBe(false);
      expect(generated).not.toHaveFileContents();
      expect(generated).toMatchFileContents(generated.path);
    } finally {
      await scratch.cleanup();
    }
  });

  it('supports creating multiple file handles in one call', async () => {
    const scratch = await createScratch();

    try {
      const outputDir = await scratch.newDir('outputs');
      const [first, second, third] = await outputDir.newFiles([
        'first.txt',
        'second.txt',
        'third.txt',
      ]);

      expect(first.path.endsWith('first.txt')).toBe(true);
      expect(second.path.endsWith('second.txt')).toBe(true);
      expect(third.path.endsWith('third.txt')).toBe(true);
      expect(first.exists).toBe(false);
      expect(await outputDir.getFiles()).toHaveLength(0);
    } finally {
      await scratch.cleanup();
    }
  });
});
