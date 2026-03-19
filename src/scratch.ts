import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

export type ScratchContent = string | Uint8Array;
export type ScratchPathLike = string | { path: string };

type ScratchPathState = {
  nextFileId: number;
  nextDirId: number;
};

type ScratchFileNameOptions = {
  relativePath?: string;
  filename?: string;
  name?: string;
  ext?: string;
};

type ScratchFileDeferredOptions = {
  content?: never;
  encoding?: never;
  touch?: false | undefined;
};

type ScratchFileTextOptions = {
  content: string;
  encoding?: BufferEncoding;
  touch?: never;
};

type ScratchFileBinaryOptions = {
  content: Uint8Array;
  encoding?: never;
  touch?: never;
};

type ScratchFileTouchOptions = {
  content?: never;
  encoding?: never;
  touch: true;
};

export type ScratchFileOptions = ScratchFileNameOptions &
  (
    | ScratchFileDeferredOptions
    | ScratchFileTextOptions
    | ScratchFileBinaryOptions
    | ScratchFileTouchOptions
  );
export type ScratchFileInput = string | ScratchFileOptions;

type ScratchStats = ReturnType<typeof statSync>;

function getStats(path: string): ScratchStats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function normalizeRelativePath(relativePath: string): string {
  if (!relativePath.trim()) {
    throw new Error('Scratch paths must not be empty.');
  }
  if (isAbsolute(relativePath)) {
    throw new Error(`Scratch paths must be relative. Received: ${relativePath}`);
  }

  const normalized = normalize(relativePath);
  const segments = normalized.split(sep).filter(Boolean);
  if (segments.includes('..')) {
    throw new Error(`Scratch paths must not contain "..". Received: ${relativePath}`);
  }

  if (normalized === '.') {
    throw new Error('Scratch paths must not resolve to the scratch root.');
  }

  return normalized.startsWith(`.${sep}`) ? normalized.slice(2) : normalized;
}

function normalizeExtension(ext: string | undefined): string {
  if (!ext) {
    return '';
  }
  return ext.startsWith('.') ? ext : `.${ext}`;
}

function createFileBasename(state: ScratchPathState, options: ScratchFileNameOptions): string {
  const ext = normalizeExtension(options.ext);
  if (options.filename) {
    return ext && !options.filename.endsWith(ext) ? `${options.filename}${ext}` : options.filename;
  }
  const stem = options.name ?? `file-${state.nextFileId++}`;
  return `${stem}${ext}`;
}

function resolveFileRelativePath(state: ScratchPathState, options: ScratchFileNameOptions): string {
  if (options.relativePath) {
    return normalizeRelativePath(options.relativePath);
  }
  return normalizeRelativePath(createFileBasename(state, options));
}

function createDirectoryRelativePath(state: ScratchPathState, relativePath?: string): string {
  if (relativePath) {
    return normalizeRelativePath(relativePath);
  }
  return `dir-${state.nextDirId++}`;
}

function normalizeFileInput(input: ScratchFileInput | undefined): ScratchFileOptions {
  if (typeof input === 'string') {
    return {
      filename: input,
    };
  }
  return input ?? {};
}

export class ScratchEntry {
  readonly path: string;

  protected constructor(path: string) {
    this.path = path;
  }

  get exists(): boolean {
    return existsSync(this.path);
  }
}

export class ScratchFile extends ScratchEntry {
  get fileLength(): Promise<number> {
    return this.getFileLength();
  }

  async write(content: ScratchContent, options?: { encoding?: BufferEncoding }): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    if (typeof content === 'string') {
      await writeFile(this.path, content, { encoding: options?.encoding ?? 'utf8' });
      return;
    }
    await writeFile(this.path, content);
  }

  async touch(): Promise<void> {
    await this.write('');
  }

  readText(encoding: BufferEncoding = 'utf8'): Promise<string> {
    return readFile(this.path, { encoding });
  }

  readBuffer(): Promise<Buffer> {
    return readFile(this.path);
  }

  async equals(other: ScratchPathLike): Promise<boolean> {
    const otherPath = resolveScratchPath(other);
    const [thisStats, otherStats] = await Promise.all([
      getPathStatsAsync(this.path),
      getPathStatsAsync(otherPath),
    ]);
    if (!thisStats?.isFile() || !otherStats?.isFile()) {
      return false;
    }

    const [thisBuffer, otherBuffer] = await Promise.all([this.readBuffer(), readFile(otherPath)]);
    return thisBuffer.equals(otherBuffer);
  }

  private async getFileLength(): Promise<number> {
    const fileStats = await stat(this.path);
    return fileStats.size;
  }
}

export class ScratchDirectory extends ScratchEntry {
  private readonly state: ScratchPathState;

  constructor(path: string, state: ScratchPathState) {
    super(path);
    this.state = state;
  }

  entries(): string[] {
    const stats = getStats(this.path);
    if (!stats?.isDirectory()) {
      return [];
    }
    return readdirSync(this.path).sort();
  }

  async getFiles(): Promise<ScratchFile[]> {
    const stats = getStats(this.path);
    if (!stats?.isDirectory()) {
      return [];
    }

    const entries = await readdir(this.path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => new ScratchFile(join(this.path, entry.name)));
  }

  async newFile(input: ScratchFileInput = {}): Promise<ScratchFile> {
    const options = normalizeFileInput(input);
    if (options.touch && 'content' in options && options.content !== undefined) {
      throw new Error('scratch.newFile() does not allow both "content" and "touch".');
    }
    if (
      'encoding' in options &&
      options.encoding !== undefined &&
      (!('content' in options) || typeof options.content !== 'string')
    ) {
      throw new Error(
        'scratch.newFile() only supports "encoding" when string "content" is provided.',
      );
    }

    const filePath = join(this.path, resolveFileRelativePath(this.state, options));
    await mkdir(dirname(filePath), { recursive: true });

    const file = new ScratchFile(filePath);
    if (options.touch) {
      await file.touch();
    } else if ('content' in options && options.content !== undefined) {
      await file.write(options.content, {
        encoding: options.encoding,
      });
    }

    return file;
  }

  newFiles<const TInputs extends readonly ScratchFileInput[]>(
    inputs: TInputs,
  ): Promise<{ [K in keyof TInputs]: ScratchFile }> {
    return Promise.all(inputs.map((input) => this.newFile(input))) as Promise<{
      [K in keyof TInputs]: ScratchFile;
    }>;
  }

  async newDir(relativePath?: string): Promise<ScratchDirectory> {
    const directoryPath = join(this.path, createDirectoryRelativePath(this.state, relativePath));
    await mkdir(directoryPath, { recursive: true });
    return new ScratchDirectory(directoryPath, this.state);
  }
}

export class Scratch extends ScratchDirectory {
  async cleanup(): Promise<void> {
    await rm(this.path, { recursive: true, force: true });
  }
}

export async function createScratch(options?: { prefix?: string }): Promise<Scratch> {
  const prefix = options?.prefix ?? 'vitest-command-line-';
  const path = await mkdtemp(join(tmpdir(), prefix));
  return new Scratch(path, {
    nextFileId: 1,
    nextDirId: 1,
  });
}

function resolveScratchPath(pathLike: ScratchPathLike): string {
  if (typeof pathLike === 'string') {
    return pathLike;
  }
  return pathLike.path;
}

async function getPathStatsAsync(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}
