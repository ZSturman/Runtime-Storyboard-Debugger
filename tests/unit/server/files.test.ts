import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findReadme,
  languageForFile,
  listTree,
  readFileContents,
  resolveWorkspacePath,
  searchWorkspace,
  WorkspaceFileError,
} from '../../../packages/core/src/server/files';

const tempDirs: string[] = [];

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsd-files-'));
  tempDirs.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveWorkspacePath', () => {
  it('rejects absolute paths', () => {
    const root = makeProject({ 'a.txt': 'hi' });
    expect(() => resolveWorkspacePath(root, '/etc/passwd')).toThrow(WorkspaceFileError);
  });

  it('rejects ../ traversal', () => {
    const root = makeProject({ 'a.txt': 'hi' });
    expect(() => resolveWorkspacePath(root, '../../../etc/passwd')).toThrow(WorkspaceFileError);
  });

  it('allows nested workspace-relative paths', () => {
    const root = makeProject({ 'src/a.ts': 'export {}' });
    expect(() => resolveWorkspacePath(root, 'src/a.ts')).not.toThrow();
  });
});

describe('listTree', () => {
  it('returns directories first, sorted alphabetically, with relative POSIX paths', () => {
    const root = makeProject({
      'README.md': '# hi',
      'src/index.ts': 'export {}',
      'src/util/helpers.ts': 'export {}',
      'package.json': '{}',
    });
    const tree = listTree(root);
    expect(tree.type).toBe('directory');
    const topNames = tree.children!.map((n) => n.name);
    // directories first
    expect(topNames[0]).toBe('src');
    expect(topNames).toContain('README.md');
    expect(topNames).toContain('package.json');
    const src = tree.children!.find((n) => n.name === 'src')!;
    expect(src.children!.find((n) => n.name === 'util')!.children!.some((n) => n.path === 'src/util/helpers.ts')).toBe(true);
  });

  it('hides node_modules and .git', () => {
    const root = makeProject({
      'src/a.ts': 'x',
      'node_modules/foo/index.js': 'x',
      '.git/HEAD': 'ref',
    });
    const tree = listTree(root);
    const names = tree.children!.map((n) => n.name);
    expect(names).not.toContain('node_modules');
    expect(names).not.toContain('.git');
  });
});

describe('readFileContents', () => {
  it('reads UTF-8 contents and infers language', () => {
    const root = makeProject({ 'src/a.ts': 'export const x = 1;\n' });
    const file = readFileContents(root, 'src/a.ts');
    expect(file.contents).toBe('export const x = 1;\n');
    expect(file.language).toBe('typescript');
    expect(file.lineCount).toBe(2);
    expect(file.truncated).toBe(false);
  });

  it('rejects directories', () => {
    const root = makeProject({ 'src/a.ts': 'x' });
    expect(() => readFileContents(root, 'src')).toThrow(/directory/);
  });

  it('rejects binary files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rsd-files-bin-'));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, 'image.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00]));
    expect(() => readFileContents(root, 'image.bin')).toThrow(/binary/);
  });

  it('blocks path traversal', () => {
    const root = makeProject({ 'a.ts': 'x' });
    expect(() => readFileContents(root, '../../../etc/passwd')).toThrow(WorkspaceFileError);
  });
});

describe('findReadme', () => {
  it('finds README.md', () => {
    const root = makeProject({ 'README.md': '# hi', 'src/a.ts': 'x' });
    expect(findReadme(root)).toBe('README.md');
  });

  it('returns null when missing', () => {
    const root = makeProject({ 'src/a.ts': 'x' });
    expect(findReadme(root)).toBeNull();
  });
});

describe('searchWorkspace', () => {
  it('finds case-insensitive matches across files', () => {
    const root = makeProject({
      'src/a.ts': 'function applyDiscount() {}\n',
      'src/b.ts': 'applyDiscount();\n',
      'README.md': 'See applyDiscount.\n',
    });
    const hits = searchWorkspace(root, 'applydiscount');
    expect(hits.length).toBe(3);
    expect(hits.every((h) => h.preview.toLowerCase().includes('applydiscount'))).toBe(true);
  });

  it('returns empty for empty query', () => {
    const root = makeProject({ 'a.ts': 'x' });
    expect(searchWorkspace(root, '   ')).toEqual([]);
  });

  it('skips hidden directories', () => {
    const root = makeProject({
      'src/a.ts': 'foo\n',
      'node_modules/x/index.js': 'foo\n',
    });
    const hits = searchWorkspace(root, 'foo');
    expect(hits.length).toBe(1);
    expect(hits[0].path).toBe('src/a.ts');
  });
});

describe('languageForFile', () => {
  it('maps common extensions', () => {
    expect(languageForFile('a.ts')).toBe('typescript');
    expect(languageForFile('a.tsx')).toBe('typescript');
    expect(languageForFile('a.json')).toBe('json');
    expect(languageForFile('Dockerfile')).toBe('dockerfile');
    expect(languageForFile('Makefile')).toBe('makefile');
    expect(languageForFile('a.unknownext')).toBe('plaintext');
  });
});
