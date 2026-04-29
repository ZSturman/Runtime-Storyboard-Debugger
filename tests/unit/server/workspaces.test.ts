import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceManager, buildGitHubCheckoutPlan, parseGitHubUrl } from '../../../packages/core/src/server/workspaces';

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
