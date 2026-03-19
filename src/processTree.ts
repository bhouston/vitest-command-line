import type { ChildProcess } from 'node:child_process';
import type { SubprocessCleanupMode } from './types.ts';

export function usesProcessTreeCleanup(mode: SubprocessCleanupMode | undefined): boolean {
  return mode === 'process-tree' && process.platform !== 'win32';
}

export function terminateChildProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
  cleanupMode: SubprocessCleanupMode | undefined,
): void {
  if (usesProcessTreeCleanup(cleanupMode) && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to regular child kill when group signaling is unavailable.
    }
  }
  try {
    child.kill(signal);
  } catch {
    /* v8 ignore next — child may already be dead */
  }
}
