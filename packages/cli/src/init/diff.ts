/**
 * A line diff of `before` → `after` for showing the Owner a change: removed
 * lines start with `- `, added lines with `+ `, and up to `context` unchanged
 * lines around each change are kept (`  `); longer unchanged runs become `  …`.
 */
export function lineDiff(before: string, after: string, context = 2): string[] {
  const a = splitLines(before);
  const b = splitLines(after);

  // Longest common subsequence table, from the end.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: { kind: ' ' | '-' | '+'; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i++]! });
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      ops.push({ kind: '-', line: a[i++]! });
    } else {
      ops.push({ kind: '+', line: b[j++]! });
    }
  }

  const near = (index: number) =>
    ops.slice(Math.max(0, index - context), index + context + 1).some((op) => op.kind !== ' ');
  const lines: string[] = [];
  ops.forEach((op, index) => {
    if (op.kind !== ' ' || near(index)) lines.push(`${op.kind} ${op.line}`.trimEnd());
    else if (lines.at(-1) !== '  …') lines.push('  …');
  });
  return lines;
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** Whether `filePath` is a dotenv file (`.env`, `.env.local`, `.env.production`, …), whose values may be secrets. */
export function isDotenvFile(filePath: string): boolean {
  const name = filePath.split(/[\\/]/).at(-1) ?? '';
  return name === '.env' || name.startsWith('.env.');
}

/**
 * Hides every value in a dotenv file's lines before they are shown, whatever
 * the variable: an Owner's `.env.local` can hold secrets the wizard knows
 * nothing about. luzIA's own settings (`LUZIA_*`: providers, models, limits)
 * are not secrets and stay readable. Comments and blank lines are kept.
 * Values that differ from `previous` (or are new) are shown as
 * `<hidden, new value>`, so a diff still shows which secrets change.
 */
export function maskDotenv(text: string, previous?: string): string {
  const before = previous === undefined ? undefined : dotenvValues(previous);
  return text
    .split('\n')
    .map((line) => {
      const entry = dotenvEntry(line);
      if (!entry || entry.name.startsWith('LUZIA_') || entry.value === '') return line;
      const changed = before !== undefined && before.get(entry.name) !== entry.value;
      return `${entry.head}${changed ? '<hidden, new value>' : '<hidden>'}`;
    })
    .join('\n');
}

function dotenvEntry(line: string): { head: string; name: string; value: string } | null {
  const match = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*)(.*)$/.exec(line);
  return match ? { head: match[1]!, name: match[2]!, value: match[3]! } : null;
}

function dotenvValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const entry = dotenvEntry(line);
    if (entry) values.set(entry.name, entry.value);
  }
  return values;
}
