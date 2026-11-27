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
