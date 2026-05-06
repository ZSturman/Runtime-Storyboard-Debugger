/**
 * Integration test: real GitHub clone via WorkspaceManager.
 *
 * These tests perform actual network operations and are opt-in.
 * Run with:
 *   INTEGRATION=1 npx vitest run tests/integration
 *
 * They are skipped automatically in normal `npm test` runs.
 */
import { afterAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceManager } from '../../packages/core/src/server/workspaces';

const INTEGRATION = process.env.INTEGRATION === '1';

// Cache paths created by these tests so we can clean them up in afterAll.
const clonedPaths: string[] = [];

afterAll(() => {
  for (const p of clonedPaths) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe.skipIf(!INTEGRATION)('GitHub workspace — real clone (INTEGRATION=1)', { timeout: 90_000 }, () => {
  it('clones the Runtime-Storyboard-Debugger repo and reaches ready status', async () => {
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: {
        type: 'github-url',
        url: 'https://github.com/ZSturman/Runtime-Storyboard-Debugger',
      },
    });

    // Record cache path for cleanup regardless of outcome.
    if (workspace.cachePath) {
      clonedPaths.push(workspace.cachePath);
    } else {
      // Compute the deterministic cache path to clean up even if not yet set on workspace.
      clonedPaths.push(
        path.join(os.homedir(), '.runtime-storyboard-debugger', 'cache', 'ZSturman', 'Runtime-Storyboard-Debugger', 'default'),
      );
    }

    const result = await manager.waitForWorkspace(workspace.id);

    expect(result.status).toBe('ready');
    expect(result.cacheState).toBe('fresh-clone');
    expect(result.entryPoints.length).toBeGreaterThan(0);
    expect(result.likelyJourneys.length).toBeGreaterThan(0);
  });

  it('clones a specific branch ref (tree URL) and discovers entry points', async () => {
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: {
        type: 'github-url',
        url: 'https://github.com/ZSturman/Runtime-Storyboard-Debugger/tree/main',
      },
    });

    if (workspace.cachePath) {
      clonedPaths.push(workspace.cachePath);
    }

    const result = await manager.waitForWorkspace(workspace.id);

    expect(result.status).toBe('ready');
    expect(result.cacheState).toBe('fresh-clone');
    expect(result.entryPoints.length).toBeGreaterThan(0);
  });

  it('returns failed status for a non-existent GitHub repository', async () => {
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace({
      source: {
        type: 'github-url',
        url: 'https://github.com/ZSturman/this-repo-definitely-does-not-exist-rsd-test',
      },
    });

    if (workspace.cachePath) {
      clonedPaths.push(workspace.cachePath);
    }

    const result = await manager.waitForWorkspace(workspace.id);
    expect(result.status).toBe('failed');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
