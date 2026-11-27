/**
 * Sets `values` in the text of a dotenv file, keeping every other line: an
 * existing assignment of a variable is replaced in place, and new variables are
 * appended under a short heading.
 */
export function mergeEnvFile(existing: string, values: Record<string, string>, heading: string): string {
  const pending = new Map(Object.entries(values));
  const lines = existing === '' ? [] : existing.replace(/\n$/, '').split('\n');

  const merged = lines.map((line) => {
    const name = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (!name || !pending.has(name)) return line;
    const value = pending.get(name)!;
    pending.delete(name);
    return `${name}=${formatValue(value)}`;
  });

  if (pending.size > 0) {
    if (merged.length > 0 && merged.at(-1) !== '') merged.push('');
    merged.push(`# ${heading}`);
    for (const [name, value] of pending) merged.push(`${name}=${formatValue(value)}`);
  }
  return `${merged.join('\n')}\n`;
}

function formatValue(value: string): string {
  return /^[\w@%+=:,./-]*$/.test(value) ? value : JSON.stringify(value);
}

/** Whether a `.gitignore` text ignores `file` (a name at the project root), for the usual patterns. */
export function gitignoreIgnores(gitignore: string, file: string): boolean {
  let ignored = false;
  for (const raw of gitignore.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    const pattern = (negated ? line.slice(1) : line).replace(/^\//, '').replace(/\/$/, '');
    if (pattern.includes('/')) continue;
    const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
    if (regex.test(file)) ignored = !negated;
  }
  return ignored;
}
