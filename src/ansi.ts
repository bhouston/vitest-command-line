// Matches CSI/OSC escape sequences, based on the pattern used by `strip-ansi`.
const ANSI_PATTERN = new RegExp(
  [
    String.raw`[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?(?:\u0007|\u001B\u005C|\u009C))`,
    String.raw`(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))`,
  ].join('|'),
  'g',
);

/**
 * Remove ANSI escape sequences (colors, cursor movement, hyperlinks, etc.)
 * from a string. Useful for asserting on CLI output that may be colorized.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}
