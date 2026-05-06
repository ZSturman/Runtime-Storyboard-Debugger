import * as fs from 'fs';
import * as path from 'path';
import { ANALYZER_IGNORE_GLOBS } from '../analyzer';

// Defaults to top-level dir/file names that should never appear in the file
// tree even though `ANALYZER_IGNORE_GLOBS` would only filter them in the
// analyzer. Mirrors VS Code's default `files.exclude` more or less.
const HIDDEN_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.git',
  '.vercel',
  '.vscode-test',
  'coverage',
  'out',
  '.idea',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB cap on raw file reads
const MAX_SEARCH_HITS = 500;
const MAX_TREE_ENTRIES_PER_DIR = 2000;

export interface FileTreeNode {
  name: string;
  path: string; // workspace-relative POSIX path; '' = root
  type: 'file' | 'directory';
  size?: number; // files only
  children?: FileTreeNode[]; // directories only
}

export interface FileContents {
  path: string;
  language: string;
  contents: string;
  size: number;
  lineCount: number;
  truncated: boolean;
}

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export class WorkspaceFileError extends Error {
  status: number;
  code: string;
  hint?: string;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.name = 'WorkspaceFileError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Resolve a workspace-relative path safely. Throws WorkspaceFileError if the
 * resolved path escapes the workspace root (path traversal, absolute path,
 * or symlink to outside).
 */
export function resolveWorkspacePath(rootDir: string, relPath: string): string {
  const rawRoot = path.resolve(rootDir);
  // Canonicalize the root via realpath so the symlink check below works on
  // platforms where the temp/workspace dir is itself behind a symlink (macOS
  // uses /private/var for /var, for example).
  let root: string;
  try {
    root = fs.realpathSync(rawRoot);
  } catch {
    root = rawRoot;
  }
  if (typeof relPath !== 'string') {
    throw new WorkspaceFileError(400, 'invalid_path', 'A relative path string is required.');
  }
  // Reject absolute paths outright
  if (path.isAbsolute(relPath)) {
    throw new WorkspaceFileError(
      400,
      'absolute_path',
      'Absolute paths are not allowed.',
      'Provide a path relative to the workspace root.',
    );
  }
  const joined = path.resolve(root, relPath);
  if (joined !== root && !joined.startsWith(root + path.sep)) {
    throw new WorkspaceFileError(
      400,
      'path_outside_workspace',
      'Path resolves outside the workspace root.',
      '`..` segments that escape the workspace are not allowed.',
    );
  }
  // Defensive: realpath check to defeat symlink traversal
  try {
    const real = fs.realpathSync(joined);
    if (real !== root && !real.startsWith(root + path.sep)) {
      throw new WorkspaceFileError(
        400,
        'symlink_outside_workspace',
        'Path resolves to a target outside the workspace via a symlink.',
      );
    }
  } catch (err: unknown) {
    if (err instanceof WorkspaceFileError) throw err;
    // realpathSync throws ENOENT for non-existent paths; that's fine for
    // tree/listing callers but the read/file callers will surface it.
  }
  return joined;
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function isHiddenDir(name: string): boolean {
  return HIDDEN_DIR_NAMES.has(name);
}

export function listTree(rootDir: string, maxDepth = 8): FileTreeNode {
  const root = path.resolve(rootDir);
  const rootName = path.basename(root);

  function walk(dir: string, depth: number, relPrefix: string): FileTreeNode[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    if (entries.length > MAX_TREE_ENTRIES_PER_DIR) {
      entries = entries.slice(0, MAX_TREE_ENTRIES_PER_DIR);
    }
    const nodes: FileTreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.DS_Store')) continue;
      if (entry.isSymbolicLink()) continue; // skip symlinks
      if (entry.isDirectory()) {
        if (isHiddenDir(entry.name)) continue;
        const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const child: FileTreeNode = {
          name: entry.name,
          path: childRel,
          type: 'directory',
          children: depth + 1 >= maxDepth ? [] : walk(path.join(dir, entry.name), depth + 1, childRel),
        };
        nodes.push(child);
      } else if (entry.isFile()) {
        const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const stat = (() => {
          try {
            return fs.statSync(path.join(dir, entry.name));
          } catch {
            return null;
          }
        })();
        nodes.push({
          name: entry.name,
          path: childRel,
          type: 'file',
          size: stat?.size,
        });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  return {
    name: rootName,
    path: '',
    type: 'directory',
    children: walk(root, 0, ''),
  };
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sql': 'sql',
  '.xml': 'xml',
  '.svg': 'xml',
};

export function languageForFile(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  if (ext in LANGUAGE_BY_EXT) return LANGUAGE_BY_EXT[ext];
  const base = path.basename(relPath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  return 'plaintext';
}

export function readFileContents(rootDir: string, relPath: string): FileContents {
  const full = resolveWorkspacePath(rootDir, relPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    throw new WorkspaceFileError(404, 'file_not_found', `File "${relPath}" not found.`);
  }
  if (stat.isDirectory()) {
    throw new WorkspaceFileError(400, 'is_directory', `"${relPath}" is a directory.`);
  }
  let truncated = false;
  let buffer: Buffer;
  if (stat.size > MAX_FILE_BYTES) {
    truncated = true;
    const fd = fs.openSync(full, 'r');
    buffer = Buffer.alloc(MAX_FILE_BYTES);
    fs.readSync(fd, buffer, 0, MAX_FILE_BYTES, 0);
    fs.closeSync(fd);
  } else {
    buffer = fs.readFileSync(full);
  }
  // Reject obvious binaries by checking for NUL bytes in the first 8KB.
  const probeLen = Math.min(buffer.length, 8 * 1024);
  for (let i = 0; i < probeLen; i++) {
    if (buffer[i] === 0) {
      throw new WorkspaceFileError(415, 'binary_file', `"${relPath}" appears to be a binary file.`);
    }
  }
  const contents = buffer.toString('utf-8');
  return {
    path: toPosix(relPath),
    language: languageForFile(relPath),
    contents,
    size: stat.size,
    lineCount: contents.length === 0 ? 0 : contents.split('\n').length,
    truncated,
  };
}

const README_CANDIDATES = ['README.md', 'README.MD', 'Readme.md', 'readme.md', 'README', 'README.markdown'];

export function findReadme(rootDir: string): string | null {
  const root = path.resolve(rootDir);
  for (const name of README_CANDIDATES) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return name;
    }
  }
  return null;
}

const SEARCH_INCLUDED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.markdown', '.html', '.css', '.scss',
  '.yml', '.yaml', '.toml', '.txt', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.swift', '.c', '.h', '.cpp',
  '.hpp', '.cs', '.php', '.sql', '.xml', '.sh',
]);

export interface SearchOptions {
  maxResults?: number;
  caseSensitive?: boolean;
}

export function searchWorkspace(rootDir: string, query: string, options: SearchOptions = {}): SearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const max = Math.min(options.maxResults ?? MAX_SEARCH_HITS, MAX_SEARCH_HITS);
  const caseSensitive = !!options.caseSensitive;
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
  const root = path.resolve(rootDir);
  const hits: SearchHit[] = [];

  function visit(dir: string, relPrefix: string): void {
    if (hits.length >= max) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= max) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (isHiddenDir(entry.name)) continue;
        const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        visit(path.join(dir, entry.name), childRel);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SEARCH_INCLUDED_EXTS.has(ext)) continue;
        if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) continue;
        const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        let contents: string;
        try {
          const stat = fs.statSync(path.join(dir, entry.name));
          if (stat.size > MAX_FILE_BYTES) continue;
          contents = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
        } catch {
          continue;
        }
        const lines = contents.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const haystack = caseSensitive ? line : line.toLowerCase();
          const idx = haystack.indexOf(needle);
          if (idx >= 0) {
            hits.push({
              path: childRel,
              line: i + 1,
              column: idx + 1,
              preview: line.length > 240 ? line.slice(0, 240) + '…' : line,
            });
            if (hits.length >= max) return;
          }
        }
      }
    }
  }

  visit(root, '');
  return hits;
}

// Re-export so server callers don't need to import the analyzer module
// just to know what we hide.
export { ANALYZER_IGNORE_GLOBS };
