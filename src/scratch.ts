import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

  if (normalized.startsWith(`.${sep}`)) {
    /* v8 ignore next — path.normalize usually drops `./`; Windows may retain `.\` */
    return normalized.slice(2);
  }
  return normalized;
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

function createScratchPathState(): ScratchPathState {
  return {
    nextFileId: 1,
    nextDirId: 1,
  };
}

function createScratchDirectoryPath(prefix: string): string {
  return join(tmpdir(), `${prefix}${randomUUID()}`);
}

export class ScratchEntry {
  readonly path: string;

  protected constructor(path: string) {
    this.path = path;
  }
}

export class ScratchFile extends ScratchEntry {
  async set(content: ScratchContent, options?: { encoding?: BufferEncoding }): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    if (typeof content === 'string') {
      await writeFile(this.path, content, { encoding: options?.encoding ?? 'utf8' });
      return;
    }
    await writeFile(this.path, content);
  }

  async create(): Promise<void> {
    await this.set('');
  }

  text(encoding: BufferEncoding = 'utf8'): Promise<string> {
    return readFile(this.path, { encoding });
  }

  buffer(): Promise<Buffer> {
    return readFile(this.path);
  }
}

export class ScratchDirectory extends ScratchEntry {
  private readonly state: ScratchPathState;

  constructor(path: string, state: ScratchPathState) {
    super(path);
    this.state = state;
  }

  async create(): Promise<void> {
    await mkdir(this.path, { recursive: true });
  }

  async file(input: ScratchFileInput = {}): Promise<ScratchFile> {
    const options = normalizeFileInput(input);
    if (options.touch && 'content' in options && options.content !== undefined) {
      throw new Error('ScratchDirectory.file() does not allow both "content" and "touch".');
    }
    if (
      'encoding' in options &&
      options.encoding !== undefined &&
      (!('content' in options) || typeof options.content !== 'string')
    ) {
      throw new Error(
        'ScratchDirectory.file() only supports "encoding" when string "content" is provided.',
      );
    }

    const filePath = join(this.path, resolveFileRelativePath(this.state, options));
    await mkdir(dirname(filePath), { recursive: true });

    const file = new ScratchFile(filePath);
    if (options.touch) {
      await file.create();
    } else if ('content' in options && options.content !== undefined) {
      await file.set(options.content, {
        encoding: options.encoding,
      });
    }

    return file;
  }

  files<const TInputs extends readonly ScratchFileInput[]>(
    inputs: TInputs,
  ): Promise<{ [K in keyof TInputs]: ScratchFile }> {
    return Promise.all(inputs.map((input) => this.file(input))) as Promise<{
      [K in keyof TInputs]: ScratchFile;
    }>;
  }

  async dir(relativePath?: string): Promise<ScratchDirectory> {
    const directoryPath = join(this.path, createDirectoryRelativePath(this.state, relativePath));
    await mkdir(directoryPath, { recursive: true });
    return new ScratchDirectory(directoryPath, this.state);
  }

  async remove(): Promise<void> {
    await rm(this.path, { recursive: true, force: true });
  }
}

export function scratchDirectory(options?: { prefix?: string }): ScratchDirectory {
  const prefix = options?.prefix ?? 'vitest-command-line-';
  return new ScratchDirectory(createScratchDirectoryPath(prefix), createScratchPathState());
}
