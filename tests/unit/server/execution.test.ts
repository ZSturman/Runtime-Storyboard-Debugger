import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverEntryPoints } from '../../../packages/core/src/analyzer';
import {
  executeFunctionEntryPoint,
  executeHttpRouteEntryPoint,
} from '../../../packages/core/src/server/execution';

const tempDirs: string[] = [];

function writeTempProject(files: Record<string, string>): string {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsd-execution-'));
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

describe('Execution helpers', () => {
  it('runs exported functions with direct input values', async () => {
    const projectDir = writeTempProject({
      'src/actions.ts': `
        export function greet(name: string, excited: boolean) {
          if (excited) {
            return 'Hello, ' + name + '!';
          }
          return 'Hello, ' + name;
        }
      `,
    });

    const entryPoints = await discoverEntryPoints(projectDir);
    const entryPoint = entryPoints.find((candidate) => candidate.name === 'greet');
    expect(entryPoint).toBeDefined();

    const execution = await executeFunctionEntryPoint(projectDir, entryPoint!, {
      name: 'Morgan',
      excited: true,
    });

    expect(execution.events.some((event) => event.type === 'branch')).toBe(true);
    expect(execution.runContext.inputs).toEqual({ name: 'Morgan', excited: true });
  });

  it('runs HTTP routes through the in-memory route shim', async () => {
    const projectDir = writeTempProject({
      'src/app.ts': `
        import express from 'express';
        const app = express();

        app.post('/hello', (req, res) => {
          if (req.body.vip) {
            res.status(201).json({ message: 'Welcome back' });
            return;
          }

          res.json({ message: 'Hello ' + req.body.name });
        });

        export default app;
      `,
    });

    const entryPoints = await discoverEntryPoints(projectDir);
    const entryPoint = entryPoints.find((candidate) => candidate.httpPath === '/hello');
    expect(entryPoint).toBeDefined();

    const execution = await executeHttpRouteEntryPoint(projectDir, entryPoint!, {
      body: { name: 'Morgan', vip: true },
      query: {},
      params: {},
      headers: {},
    });

    expect(execution.events.some((event) => event.type === 'branch')).toBe(true);
    expect(execution.technicalNotes.some((note) => note.includes('201'))).toBe(true);
  });
});
