import { describe, it, expect, beforeEach } from 'vitest';
import type { DirEntry, FilesystemAdapter } from '../adapters/filesystem.js';
import { deriveTitleFromPath, loadNote, saveNote } from './note.js';

/**
 * In-memory FilesystemAdapter for tests. Stores files under their absolute
 * paths (the adapter resolves vault-relative → absolute itself, so we follow
 * the same contract). Uses POSIX `/` separators throughout.
 */
class MockFilesystemAdapter implements FilesystemAdapter {
  files = new Map<string, { content: string; mtimeMs: number }>();
  dirs = new Set<string>();
  writes: Array<{ path: string; content: string }> = [];

  resolveAbsolute(vaultRoot: string, relativePath: string): string {
    return `${vaultRoot}/${relativePath}`;
  }

  toRelative(vaultRoot: string, absolutePath: string): string {
    const prefix = `${vaultRoot}/`;
    return absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : absolutePath;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(path);
    if (!f) throw new Error(`ENOENT: ${path}`);
    return f.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.writes.push({ path, content });
    const prev = this.files.get(path);
    this.files.set(path, { content, mtimeMs: prev ? prev.mtimeMs : 1000 });
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async rename(from: string, to: string): Promise<void> {
    const f = this.files.get(from);
    if (!f) throw new Error(`ENOENT: ${from}`);
    this.files.delete(from);
    this.files.set(to, f);
  }

  async mkdir(path: string, _opts?: { recursive?: boolean }): Promise<void> {
    this.dirs.add(path);
  }

  async rmdir(path: string, _opts?: { recursive?: boolean }): Promise<void> {
    this.dirs.delete(path);
  }

  async readDir(_path: string): Promise<DirEntry[]> {
    return [];
  }

  async stat(path: string): Promise<{ mtimeMs: number; size: number; isDirectory: boolean }> {
    const f = this.files.get(path);
    if (f) return { mtimeMs: f.mtimeMs, size: f.content.length, isDirectory: false };
    if (this.dirs.has(path)) return { mtimeMs: 0, size: 0, isDirectory: true };
    throw new Error(`ENOENT: ${path}`);
  }

  /** Test helper: pre-populate a file with a given mtime. */
  putFile(path: string, content: string, mtimeMs = 1000): void {
    this.files.set(path, { content, mtimeMs });
  }
}

describe('deriveTitleFromPath', () => {
  it('strips the .md extension from a flat filename', () => {
    expect(deriveTitleFromPath('foo.md')).toBe('foo');
  });

  it('uses only the basename for a nested path', () => {
    expect(deriveTitleFromPath('projects/ziba.md')).toBe('ziba');
  });

  it('preserves spaces in the basename', () => {
    expect(deriveTitleFromPath('note with spaces.md')).toBe('note with spaces');
  });

  it('returns the input unchanged when there is no .md extension', () => {
    expect(deriveTitleFromPath('no-extension')).toBe('no-extension');
  });

  it('handles deeply nested paths', () => {
    expect(deriveTitleFromPath('a/b/c/d.md')).toBe('d');
  });

  it('does not strip a trailing .md when it is part of a longer extension', () => {
    expect(deriveTitleFromPath('foo.md.bak')).toBe('foo.md.bak');
  });
});

describe('loadNote — title precedence', () => {
  let fs: MockFilesystemAdapter;
  const VAULT = '/vault';

  beforeEach(() => {
    fs = new MockFilesystemAdapter();
  });

  it('uses frontmatter.title when present', async () => {
    fs.putFile(`${VAULT}/note.md`, '---\ntitle: From FM\n---\n# Heading Ignored\n\nbody');
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.title).toBe('From FM');
  });

  it('falls back to the first H1 when frontmatter.title is missing', async () => {
    fs.putFile(`${VAULT}/note.md`, '# Heading Title\n\nbody');
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.title).toBe('Heading Title');
  });

  it('falls back to the filename when neither frontmatter nor heading is set', async () => {
    fs.putFile(`${VAULT}/note.md`, 'just body');
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.title).toBe('note');
  });

  it('uses the filename for nested paths when no other title source exists', async () => {
    fs.putFile(`${VAULT}/projects/ziba.md`, 'body');
    const note = await loadNote(fs, VAULT, 'projects/ziba.md');
    expect(note.title).toBe('ziba');
  });

  it('ignores non-string frontmatter.title and falls back to heading', async () => {
    fs.putFile(`${VAULT}/note.md`, '---\ntitle: 42\n---\n# Real Title\n\nbody');
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.title).toBe('Real Title');
  });
});

describe('loadNote — content shape', () => {
  let fs: MockFilesystemAdapter;
  const VAULT = '/vault';

  beforeEach(() => {
    fs = new MockFilesystemAdapter();
  });

  it('extracts wikilinks from the body', async () => {
    fs.putFile(`${VAULT}/note.md`, '# Title\n\nSee [[Other]] and [[Third|alias]]');
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.wikilinks).toEqual(['Other', 'Third']);
  });

  it('returns the body without the frontmatter block', async () => {
    fs.putFile(`${VAULT}/note.md`, '---\ntitle: T\n---\nbody only');
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.content.trim()).toBe('body only');
  });

  it('exposes the file mtime on the returned note', async () => {
    fs.putFile(`${VAULT}/note.md`, 'body', 12345);
    const note = await loadNote(fs, VAULT, 'note.md');
    expect(note.mtimeMs).toBe(12345);
  });

  it('echoes the path on the returned note', async () => {
    fs.putFile(`${VAULT}/projects/n.md`, 'body');
    const note = await loadNote(fs, VAULT, 'projects/n.md');
    expect(note.path).toBe('projects/n.md');
  });

  it('returns the parsed frontmatter object', async () => {
    fs.putFile(`${VAULT}/n.md`, '---\ntags: [a, b]\n---\nbody');
    const note = await loadNote(fs, VAULT, 'n.md');
    expect(note.frontmatter).toEqual({ tags: ['a', 'b'] });
  });
});

describe('saveNote', () => {
  let fs: MockFilesystemAdapter;
  const VAULT = '/vault';

  beforeEach(() => {
    fs = new MockFilesystemAdapter();
  });

  it('writes the body unchanged when frontmatter is empty', async () => {
    await saveNote(fs, VAULT, 'note.md', 'plain body', {});
    const written = fs.writes.at(-1);
    expect(written?.path).toBe(`${VAULT}/note.md`);
    expect(written?.content).toBe('plain body');
  });

  it('serializes frontmatter as a YAML block when non-empty', async () => {
    await saveNote(fs, VAULT, 'note.md', 'body', { title: 'Hello' });
    const written = fs.writes.at(-1);
    expect(written?.content.startsWith('---\n')).toBe(true);
    expect(written?.content).toContain('title: Hello');
    expect(written?.content).toContain('body');
  });

  it('creates the parent directory recursively for nested paths', async () => {
    await saveNote(fs, VAULT, 'a/b/c.md', 'body', {});
    expect(fs.dirs.has(`${VAULT}/a/b`)).toBe(true);
  });

  it('mkdirs the vault root when saving a note at the top level', async () => {
    // saveNote walks back to the last separator and mkdirs the parent. For a
    // top-level note that parent is the vault root itself; this is harmless
    // because mkdir is idempotent with `recursive: true`.
    await saveNote(fs, VAULT, 'top.md', 'body', {});
    expect(fs.dirs.has(VAULT)).toBe(true);
  });
});
