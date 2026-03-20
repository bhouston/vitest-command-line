import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extendMatchers, type ScratchDirectory, scratchDirectory } from './index.js';

extendMatchers();

async function materializedScratch(options?: { prefix?: string }): Promise<ScratchDirectory> {
  const directory = scratchDirectory(options);
  await directory.create();
  return directory;
}

describe('scratch path validation', () => {
  it('rejects invalid relative paths for files', async () => {
    const directory = await materializedScratch();
    try {
      await expect(directory.file({ relativePath: '   ' })).rejects.toThrow(/must not be empty/);
      await expect(directory.file({ relativePath: join(tmpdir(), 'abs.txt') })).rejects.toThrow(/must be relative/);
      await expect(directory.file({ relativePath: '../outside' })).rejects.toThrow(/\.\./);
      await expect(directory.file({ relativePath: '.' })).rejects.toThrow(/scratch root/);
      await expect(directory.dir('../escape')).rejects.toThrow(/\.\./);
    } finally {
      await directory.remove();
    }
  });

  it('rejects conflicting file options', async () => {
    const directory = await materializedScratch();
    try {
      await expect(directory.file({ touch: true, content: 'nope' } as never)).rejects.toThrow(/does not allow both/);
      await expect(directory.file({ filename: 'x.txt', encoding: 'utf8' })).rejects.toThrow(/encoding/);
    } finally {
      await directory.remove();
    }
  });

  it('treats a null file input like an empty options object', async () => {
    const directory = await materializedScratch();
    try {
      const handle = await directory.file(null as never);
      expect(handle.path.endsWith('file-1')).toBe(true);
    } finally {
      await directory.remove();
    }
  });

  it('normalizes dot-prefixed relative paths on Windows', async () => {
    if (process.platform !== 'win32' || sep !== '\\') {
      return;
    }

    const directory = await materializedScratch();
    try {
      const handle = await directory.file({
        relativePath: `.${sep}nested${sep}win.txt`,
        content: 'ok',
      });
      expect(handle.path).toContain(`nested${sep}win.txt`);
    } finally {
      await directory.remove();
    }
  });
});

describe('scratch helper', () => {
  it('creates deferred, seeded, and touched files after create()', async () => {
    const directory = scratchDirectory({
      prefix: 'vitest-command-line-test-',
    });

    expect(directory).not.toExist();
    await directory.create();

    try {
      const deferred = await directory.file({
        filename: 'deferred.txt',
      });
      const shorthand = await directory.file('shorthand.txt');
      const seeded = await directory.file({
        filename: 'seeded.txt',
        content: 'hello world',
      });
      const encoded = await directory.file({
        filename: 'encoded.txt',
        content: 'hello encoded',
        encoding: 'utf16le',
      });
      const binary = await directory.file({
        filename: 'binary.bin',
        content: Buffer.from([1, 2, 3]),
      });
      const touched = await directory.file({
        filename: 'empty.txt',
        touch: true,
      });

      expect(deferred).not.toExist();
      expect(shorthand).not.toExist();
      expect(seeded).toExist();
      expect(encoded).toExist();
      expect(binary).toExist();
      expect(touched).toExist();

      expect(await seeded.text()).toBe('hello world');
      expect(await encoded.text('utf16le')).toBe('hello encoded');
      expect(await binary.buffer()).toEqual(Buffer.from([1, 2, 3]));
      expect(await touched.text()).toBe('');
      expect(seeded).toHaveFileContents();
      expect(seeded).toMatchFileContents(seeded.path);
      expect(seeded).not.toMatchFileContents(encoded);

      await deferred.set('written later');
      expect(deferred).toExist();
      expect(await deferred.text()).toBe('written later');
    } finally {
      await directory.remove();
    }

    expect(directory).not.toExist();
  });

  it('supports custom extensions, nested paths, and explicit file listing', async () => {
    const directory = await materializedScratch();

    try {
      const outputDir = await directory.dir('outputs');
      const nestedDir = await outputDir.dir('nested');
      const report = await outputDir.file({
        name: 'report',
        ext: 'txt',
        content: 'summary',
      });
      const doubledExt = await outputDir.file({
        filename: 'full.txt',
        ext: 'bak',
        content: 'x',
      });
      expect(doubledExt.path.endsWith('full.txt.bak')).toBe(true);
      const singleExt = await outputDir.file({
        filename: 'already.log',
        ext: 'log',
        content: 'y',
      });
      expect(singleExt.path.endsWith('already.log')).toBe(true);
      const dottedExt = await outputDir.file({
        name: 'readme',
        ext: '.md',
        content: '# hi',
      });
      expect(dottedExt.path.endsWith('readme.md')).toBe(true);
      const generated = await outputDir.file({
        relativePath: 'nested/generated.bin',
        touch: true,
      });
      const rootFile = await outputDir.file('root.txt');

      expect(outputDir).toExist();
      expect(readdirSync(outputDir.path).toSorted()).toEqual([
        'already.log',
        'full.txt.bak',
        'nested',
        'readme.md',
        'report.txt',
      ]);
      expect(readdirSync(nestedDir.path)).toEqual(['generated.bin']);
      expect(report.path.endsWith('report.txt')).toBe(true);
      expect(generated.path.endsWith('nested/generated.bin')).toBe(true);
      expect(rootFile.path.endsWith('root.txt')).toBe(true);
      expect(rootFile).not.toExist();
      expect(generated).not.toHaveFileContents();
      expect(generated).toMatchFileContents(generated.path);

      await nestedDir.remove();
      expect(nestedDir).not.toExist();
      expect(readdirSync(outputDir.path).toSorted()).toEqual([
        'already.log',
        'full.txt.bak',
        'readme.md',
        'report.txt',
      ]);
    } finally {
      await directory.remove();
    }
  });

  it('supports creating multiple file handles in one call', async () => {
    const directory = await materializedScratch();

    try {
      const autoDir = await directory.dir();
      expect(basename(autoDir.path)).toMatch(/^dir-\d+$/);

      const outputDir = await directory.dir('outputs');
      const [first, second, third] = await outputDir.files(['first.txt', 'second.txt', 'third.txt']);

      expect(first.path.endsWith('first.txt')).toBe(true);
      expect(second.path.endsWith('second.txt')).toBe(true);
      expect(third.path.endsWith('third.txt')).toBe(true);
      expect(first).not.toExist();
      expect(readdirSync(outputDir.path)).toHaveLength(0);
    } finally {
      await directory.remove();
    }
  });

  it('materializes the root directory before deferred file handles exist', async () => {
    const directory = scratchDirectory();
    await directory.create();

    try {
      expect(directory).toExist();

      const deferred = await directory.file('report.json');
      expect(deferred).not.toExist();
    } finally {
      await directory.remove();
    }
  });
});

describe('scratch helper workflow', () => {
  let directory = scratchDirectory();

  beforeEach(async () => {
    directory = scratchDirectory();
    await directory.create();
  });

  afterEach(async () => {
    await directory.remove();
  });

  it('supports the recommended per-test setup without non-null assertions', async () => {
    const reportFile = await directory.file('report.json');

    expect(directory).toExist();
    expect(reportFile).not.toExist();

    await reportFile.set('created during test');
    expect(reportFile).toHaveFileContents();
  });
});
