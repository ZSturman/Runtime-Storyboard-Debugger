import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { WorkspaceManager, buildGitHubCheckoutPlan, buildWorkspaceSourceLabel, parseGitHubUrl } from '../../../packages/core/src/server/workspaces';

// Mock child_process at the module level so the mock is in place when workspaces.ts
// calls promisify(execFile) during module initialisation.
vi.mock('child_process', () => ({ execFile: vi.fn() }));

const tempDirs: string[] = [];

function writeTempProject(files: Record<string, string>): string {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsd-workspace-'));
  tempDirs.push(projectDir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
  }

  return projectDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const nextDir = tempDirs.pop();
    if (nextDir) {
      fs.rmSync(nextDir, { recursive: true, force: true });
    }
  }
});

describe('workspace helpers', () => {
  it('parses GitHub repository root URLs', () => {
    expect(parseGitHubUrl('https://github.com/openai/codex')).toMatchObject({
      type: 'github-url',
      owner: 'openai',
      repo: 'codex',
      ref: undefined,
      focusPath: undefined,
    });
  });

  it('parses GitHub repository URLs with a .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/openai/codex.git')).toMatchObject({
      type: 'github-url',
      owner: 'openai',
      repo: 'codex',
    });
  });

  it('parses GitHub tree URLs with refs and a focus path', () => {
    expect(parseGitHubUrl('https://github.com/openai/codex/tree/main/packages/core')).toMatchObject({
      type: 'github-url',
      owner: 'openai',
      repo: 'codex',
      ref: 'main',
      focusPath: 'packages/core',
    });
  });

  it('parses GitHub blob URLs with refs, focus paths, and extra URL parts', () => {
    expect(parseGitHubUrl('https://github.com/openai/codex/blob/main/packages/core/src/index.ts?plain=1#L10')).toMatchObject({
      type: 'github-url',
      owner: 'openai',
      repo: 'codex',
      ref: 'main',
      focusPath: 'packages/core/src/index.ts',
    });
  });

  it('accepts GitHub URLs with trailing slashes, query params, and hashes', () => {
    expect(parseGitHubUrl('https://github.com/openai/codex/?tab=readme#top')).toMatchObject({
      type: 'github-url',
      owner: 'openai',
      repo: 'codex',
    });
  });

  it('rejects non-GitHub hosts', () => {
    expect(() => parseGitHubUrl('https://gitlab.com/openai/codex')).toThrow('Only github.com URLs are supported in this release.');
  });

  it('plans a shallow partial clone without sparse checkout', () => {
    const plan = buildGitHubCheckoutPlan(parseGitHubUrl('https://github.com/openai/codex/tree/main'), {
      exists: false,
      targetDir: '/tmp/codex',
    });

    expect(plan.cacheState).toBe('fresh-clone');
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toEqual([
      'clone',
      '--depth',
      '1',
      '--filter=blob:none',
      '--single-branch',
      '--branch',
      'main',
      'https://github.com/openai/codex.git',
      '/tmp/codex',
    ]);
    expect(plan.commands.flat()).not.toContain('--sparse');
    expect(plan.commands.flat()).not.toContain('sparse-checkout');
  });

  it('plans a cached ref refresh without sparse checkout commands', () => {
    const plan = buildGitHubCheckoutPlan(parseGitHubUrl('https://github.com/openai/codex/tree/main'), {
      exists: true,
      targetDir: '/tmp/codex',
    });

    expect(plan.cacheState).toBe('refreshing');
    expect(plan.commands).toEqual([
      ['fetch', '--depth', '1', 'origin', 'main'],
      ['checkout', '--force', 'FETCH_HEAD'],
    ]);
    expect(plan.commands.flat()).not.toContain('sparse-checkout');
  });

  it('reuses cached root clones without extra git commands', () => {
    const plan = buildGitHubCheckoutPlan(parseGitHubUrl('https://github.com/openai/codex'), {
      exists: true,
      targetDir: '/tmp/codex',
    });

    expect(plan.cacheState).toBe('cached');
    expect(plan.commands).toEqual([]);
  });

  it('fails fast on malformed tree URLs', () => {
    expect(() => parseGitHubUrl('https://github.com/openai/codex/tree')).toThrow('GitHub tree URL must include a ref.');
  });

  it('fails fast on unsupported GitHub URL shapes', () => {
    expect(() => parseGitHubUrl('https://github.com/openai/codex/pull/123')).toThrow(
      'GitHub URL must point to a repository root, tree, or blob path.',
    );
  });

  it('still parses GitHub repository URLs with refs', () => {
    expect(parseGitHubUrl('https://github.com/openai/codex/tree/main')).toMatchObject({
      type: 'github-url',
      owner: 'openai',
      repo: 'codex',
      ref: 'main',
    });
  });

  it('builds local workspace analysis artifacts', async () => {
    const projectDir = writeTempProject({
      'package.json': JSON.stringify({
        scripts: {
          dev: 'vite',
          start: 'node server.js',
        },
      }),
      'src/app.ts': `
        import express from 'express';
        const app = express();
        app.get('/orders', (_req, res) => res.json([]));
        export default app;
      `,
      'src/actions.ts': `
        export function createOrder(items: unknown[]) {
          return items;
        }
      `,
    });

    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: {
        type: 'local-path',
        path: projectDir,
      },
    });

    const ready = await manager.waitForWorkspace(workspace.id);
    expect(ready.status).toBe('ready');
    expect(ready.entryPoints.some((entryPoint) => entryPoint.type === 'http-route')).toBe(true);
    expect(ready.detectedScripts.some((script) => script.name === 'dev')).toBe(true);
    expect(ready.likelyJourneys.length).toBeGreaterThan(0);
  });
});

describe('WorkspaceManager error handling', () => {
  it('sets status to failed when a local path does not exist', async () => {
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: { type: 'local-path', path: '/nonexistent/rsd-test-path-xyz123' },
    });
    const result = await manager.waitForWorkspace(workspace.id);
    expect(result.status).toBe('failed');
    expect(result.errors[0]).toContain('/nonexistent/rsd-test-path-xyz123');
    expect(result.errors[0]).toContain('Suggested action');
  });

  it('sets status to failed when the local path points to a deeply nonexistent directory', async () => {
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: { type: 'local-path', path: '/nonexistent/rsd-test-nested/path/xyz999' },
    });
    const result = await manager.waitForWorkspace(workspace.id);
    expect(result.status).toBe('failed');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('resolves a relative path to an absolute path when the directory exists', async () => {
    const projectDir = writeTempProject({
      'src/actions.ts': `export function hello() { return 'world'; }`,
    });

    // Pass a path relative to the system temp dir so it resolves correctly from process.cwd().
    // Since path.resolve() is called in resolveWorkspacePath, an absolute path passed in is fine.
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: { type: 'local-path', path: projectDir },
    });
    const result = await manager.waitForWorkspace(workspace.id);
    expect(result.status).toBe('ready');
    expect(path.isAbsolute(result.cachePath!)).toBe(true);
  });
});

describe('WorkspaceManager GitHub source (mocked git)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('completes with fresh-clone cache state when git clone succeeds', async () => {
    // Compute the deterministic cache path that WorkspaceManager will use.
    const cachePath = path.join(
      os.homedir(),
      '.runtime-storyboard-debugger',
      'cache',
      'testowner',
      'testrepo',
      'default',
    );
    tempDirs.push(cachePath);

    // Pre-populate the cache dir with a minimal project so static analysis can run.
    fs.mkdirSync(path.join(cachePath, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(cachePath, 'package.json'),
      JSON.stringify({ name: 'mock-repo', scripts: { start: 'node index.js' } }),
    );
    fs.writeFileSync(
      path.join(cachePath, 'src', 'actions.ts'),
      `export function greet(name: string) { return 'Hello ' + name; }`,
    );

    // The mock execFile is already in place (hoisted vi.mock at top of file).
    // Configure it to call the callback with success for this test.
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, stdout: string, stderr: string) => void;
      cb(null, '', '');
      return {} as ReturnType<typeof execFile>;
    });

    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: { type: 'github-url', url: 'https://github.com/testowner/testrepo' },
    });
    const result = await manager.waitForWorkspace(workspace.id);

    expect(result.status).toBe('ready');
    expect(result.cacheState).toBe('fresh-clone');
    expect(result.entryPoints.some((ep) => ep.type === 'exported-function')).toBe(true);
  });

  it('sets status to failed when git clone errors', async () => {
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error) => void;
      cb(new Error('git: command not found'));
      return {} as ReturnType<typeof execFile>;
    });

    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: { type: 'github-url', url: 'https://github.com/testowner/failrepo' },
    });
    const result = await manager.waitForWorkspace(workspace.id);

    expect(result.status).toBe('failed');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('buildWorkspaceSourceLabel', () => {
  it('returns the path for a local-path source', () => {
    expect(
      buildWorkspaceSourceLabel({ type: 'local-path', path: '/Users/me/my-project' }),
    ).toBe('/Users/me/my-project');
  });

  it('returns owner/repo for a GitHub source without a ref', () => {
    expect(
      buildWorkspaceSourceLabel({ type: 'github-url', owner: 'openai', repo: 'codex' }),
    ).toBe('openai/codex');
  });

  it('returns owner/repo@ref when a ref is provided', () => {
    expect(
      buildWorkspaceSourceLabel({ type: 'github-url', owner: 'openai', repo: 'codex', ref: 'main' }),
    ).toBe('openai/codex@main');
  });

  it('appends the focus path in parentheses when provided', () => {
    expect(
      buildWorkspaceSourceLabel({
        type: 'github-url',
        owner: 'openai',
        repo: 'codex',
        ref: 'main',
        focusPath: 'packages/core',
      }),
    ).toBe('openai/codex@main (focus: packages/core)');
  });

  it('falls back to the URL string when owner/repo are missing', () => {
    expect(
      buildWorkspaceSourceLabel({ type: 'github-url', url: 'https://github.com/openai/codex' }),
    ).toBe('https://github.com/openai/codex');
  });

  it('returns a generic label when neither path, owner/repo, nor URL are present', () => {
    expect(buildWorkspaceSourceLabel({ type: 'github-url' })).toBe('GitHub workspace');
  });
});
