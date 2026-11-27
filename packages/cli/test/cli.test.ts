import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/index.ts';

const coreFixtures = new URL('../../core/test/fixtures/', import.meta.url).pathname;

function captureIo(cwd: string, env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { cwd, env, stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) },
    out,
    err,
  };
}

describe('luzia build', () => {
  it('compiles a Knowledge Base folder into a single artifact', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const { io, out } = captureIo(cwd);

    const code = await runCli(['build', '--dir', path.join(coreFixtures, 'knowledge-base')], io);

    expect(code).toBe(0);
    const artifact = JSON.parse(await readFile(path.join(cwd, '.luzia/knowledge-base.json'), 'utf8'));
    expect(artifact.core.text).toContain('eight years of experience building payment systems');
    expect(artifact.instructions.text).toContain('If asked about salary');
    expect(out.join('\n')).toContain('.luzia/knowledge-base.json');
  });

  it('writes the artifact to --out', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const { io } = captureIo(cwd);

    const code = await runCli(
      ['build', '--dir', path.join(coreFixtures, 'core-only'), '--out', 'generated/kb.json'],
      io,
    );

    expect(code).toBe(0);
    const artifact = JSON.parse(await readFile(path.join(cwd, 'generated/kb.json'), 'utf8'));
    expect(artifact.core.text).toContain('Ada is a backend engineer.');
    expect(artifact.instructions).toBeNull();
  });

  it('reports that a Core-only Knowledge Base has nothing to embed', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const { io, out } = captureIo(cwd);

    const code = await runCli(['build', '--dir', path.join(coreFixtures, 'core-only')], io);

    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/0 chunks/);
  });

  it('exits non-zero with a clear message when there is content to embed but no embeddings model', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const { io, err } = captureIo(cwd);

    const code = await runCli(['build', '--dir', path.join(coreFixtures, 'with-documents')], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/no embeddings model is configured.*LUZIA_EMBEDDING_PROVIDER/s);
  });

  it('reads the embeddings model from the environment it is given', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const { io, err } = captureIo(cwd, {
      LUZIA_EMBEDDING_PROVIDER: 'openai',
      LUZIA_EMBEDDING_MODEL: 'text-embedding-3-small',
    });

    const code = await runCli(['build', '--dir', path.join(coreFixtures, 'with-documents')], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/Missing API key.*OPENAI_API_KEY/);
  });

  it('exits non-zero with a clear message when the Core file is missing', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const { io, err } = captureIo(cwd);

    const code = await runCli(['build', '--dir', path.join(coreFixtures, 'missing-core')], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/No Core file found/);
  });
});

describe('luzia', () => {
  it('lists available commands and exits non-zero for an unknown command', async () => {
    const { io, err } = captureIo(process.cwd());

    const code = await runCli(['nope'], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/Unknown command "nope"/);
    expect(err.join('\n')).toMatch(/build/);
  });

  it('runs as an executable', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-cli-'));
    const bin = new URL('../src/bin.ts', import.meta.url).pathname;

    const { stdout } = await promisify(execFile)(
      process.execPath,
      [bin, 'build', '--dir', path.join(coreFixtures, 'core-only')],
      { cwd },
    );

    expect(stdout).toContain('Compiled Knowledge Base');
    const artifact = JSON.parse(await readFile(path.join(cwd, '.luzia/knowledge-base.json'), 'utf8'));
    expect(artifact.core.source).toBe('CORE.md');
  });
});
