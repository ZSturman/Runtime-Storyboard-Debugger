import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { discoverEntryPoints } from '../analyzer/entry-points';
import { buildFlowGraph } from '../analyzer/flow-graph';
import { buildStoryboard } from '../storyboard/frame-builder';
import { installGlobalRuntime, uninstallGlobalRuntime, runWithTrace } from '../instrumenter/runtime';
import { transformFileSync } from '@babel/core';
import rsdBabelPlugin from '../instrumenter/babel-plugin';
import type { Storyboard, EntryPoint, SourceSnippet } from '../storyboard/types';

export interface ServerConfig {
  targetDir: string;
  port: number;
  uiDistPath?: string;
}

export class ServerStartupError extends Error {
  code?: string;
  port: number;

  constructor(message: string, port: number, code?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServerStartupError';
    this.code = code;
    this.port = port;
  }
}

export function createServer(config: ServerConfig) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let cachedEntryPoints: EntryPoint[] | null = null;
  const storyboards = new Map<string, Storyboard>();

  // ─── GET /api/entry-points ────────────────────────────────────
  app.get('/api/entry-points', async (_req, res) => {
    try {
      if (!cachedEntryPoints) {
        cachedEntryPoints = await discoverEntryPoints(config.targetDir);
      }
      res.json({ entryPoints: cachedEntryPoints });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─── GET /api/entry-points/:id/flow ───────────────────────────
  app.get('/api/entry-points/:id/flow', async (req, res) => {
    try {
      if (!cachedEntryPoints) {
        cachedEntryPoints = await discoverEntryPoints(config.targetDir);
      }
      const ep = cachedEntryPoints.find((e) => e.id === req.params.id);
      if (!ep) {
        res.status(404).json({ error: 'Entry point not found' });
        return;
      }

      const funcName = ep.name.includes(' ')
        ? ep.name.split(' ').pop()!  // For routes like "POST /orders"
        : ep.name;

      const flowGraph = buildFlowGraph(ep.file, funcName, config.targetDir);
      if (!flowGraph) {
        res.json({ flowGraph: null, message: 'Could not build flow graph for this entry point' });
        return;
      }
      flowGraph.entryPointId = ep.id;
      res.json({ flowGraph });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─── POST /api/run ────────────────────────────────────────────
  app.post('/api/run', async (req, res) => {
    try {
      const { scenarioPath } = req.body;
      if (!scenarioPath || typeof scenarioPath !== 'string') {
        res.status(400).json({ error: 'scenarioPath is required' });
        return;
      }

      const fullScenarioPath = path.resolve(config.targetDir, scenarioPath);
      if (!fullScenarioPath.startsWith(path.resolve(config.targetDir))) {
        res.status(400).json({ error: 'scenarioPath must be within target directory' });
        return;
      }
      if (!fs.existsSync(fullScenarioPath)) {
        res.status(404).json({ error: `Scenario file not found: ${scenarioPath}` });
        return;
      }

      // Discover entry points if not cached
      if (!cachedEntryPoints) {
        cachedEntryPoints = await discoverEntryPoints(config.targetDir);
      }

      // Install runtime, execute scenario, capture trace
      installGlobalRuntime();

      // Transform the scenario file and its dependencies using Babel
      const scenarioCode = transformScenarioFile(fullScenarioPath);

      // Execute the instrumented code within a trace context
      const traceResult = await runWithTrace(() => {
        // Execute the transformed code
        const module_ = { exports: {} as Record<string, unknown> };
        const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', scenarioCode);
        fn(module_, module_.exports, createSafeRequire(fullScenarioPath, config.targetDir), fullScenarioPath, path.dirname(fullScenarioPath));
        const runFn = module_.exports.run || module_.exports.default;
        if (typeof runFn === 'function') {
          return runFn();
        }
      });

      uninstallGlobalRuntime();

      // Build storyboard
      const entryPoint = cachedEntryPoints[0] || {
        id: 'ep_scenario',
        name: path.basename(scenarioPath, path.extname(scenarioPath)),
        type: 'exported-function' as const,
        file: scenarioPath,
        line: 1,
        description: `Scenario: ${path.basename(scenarioPath)}`,
        parameters: [],
      };

      const scenarioName = path.basename(scenarioPath, path.extname(scenarioPath));
      const storyboard = buildStoryboard(traceResult.events, entryPoint, scenarioName);
      storyboards.set(storyboard.id, storyboard);

      res.json({ storyboard });
    } catch (err: unknown) {
      uninstallGlobalRuntime();
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─── GET /api/storyboards ────────────────────────────────────
  app.get('/api/storyboards', (_req, res) => {
    const list = Array.from(storyboards.values()).map((sb) => ({
      id: sb.id,
      entryPoint: sb.entryPoint.name,
      totalFrames: sb.metadata.totalFrames,
      scenarioName: sb.metadata.scenarioName,
    }));
    res.json({ storyboards: list });
  });

  // ─── GET /api/storyboards/:id ────────────────────────────────
  app.get('/api/storyboards/:id', (req, res) => {
    const sb = storyboards.get(req.params.id);
    if (!sb) {
      res.status(404).json({ error: 'Storyboard not found' });
      return;
    }
    res.json({ storyboard: sb });
  });

  // ─── GET /api/source ─────────────────────────────────────────
  app.get('/api/source', (req, res) => {
    try {
      const file = req.query.file as string;
      const line = parseInt(req.query.line as string, 10) || 1;
      const context = parseInt(req.query.context as string, 10) || 5;

      if (!file) {
        res.status(400).json({ error: 'file query parameter is required' });
        return;
      }

      const fullPath = path.resolve(config.targetDir, file);
      if (!fullPath.startsWith(path.resolve(config.targetDir))) {
        res.status(400).json({ error: 'file must be within target directory' });
        return;
      }
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: `File not found: ${file}` });
        return;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const allLines = content.split('\n');
      const startLine = Math.max(1, line - context);
      const endLine = Math.min(allLines.length, line + context);

      const snippet: SourceSnippet = {
        file,
        startLine,
        endLine,
        lines: allLines.slice(startLine - 1, endLine).map((content, i) => ({
          number: startLine + i,
          content,
          highlighted: startLine + i === line,
        })),
      };

      res.json({ source: snippet });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─── GET /api/scenarios ──────────────────────────────────────
  app.get('/api/scenarios', (_req, res) => {
    try {
      const scenariosDir = path.join(config.targetDir, 'scenarios');
      if (!fs.existsSync(scenariosDir)) {
        res.json({ scenarios: [] });
        return;
      }

      const files = fs.readdirSync(scenariosDir)
        .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
        .map((f) => ({
          name: path.basename(f, path.extname(f)),
          path: path.join('scenarios', f),
          description: getScenarioDescription(path.join(scenariosDir, f)),
        }));

      res.json({ scenarios: files });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─── Serve UI static files ───────────────────────────────────
  if (config.uiDistPath && fs.existsSync(config.uiDistPath)) {
    app.use(express.static(config.uiDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.uiDistPath!, 'index.html'));
    });
  }

  return app;
}

function getScenarioDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const descMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
    if (descMatch) return descMatch[1].trim();
    const commentMatch = content.match(/\/\/\s*(.+)/);
    if (commentMatch) return commentMatch[1].trim();
    return '';
  } catch {
    return '';
  }
}

function transformScenarioFile(filePath: string): string {
  const result = transformFileSync(filePath, {
    presets: [],
    plugins: [
      rsdBabelPlugin,
      ['@babel/plugin-transform-typescript', { isTSX: false }],
      '@babel/plugin-transform-modules-commonjs',
    ],
    filename: filePath,
    sourceType: 'module',
  });

  return result?.code || '';
}

function createSafeRequire(scenarioPath: string, targetDir: string) {
  return function safeRequire(id: string): unknown {
    // Handle relative imports — transform and execute them too
    if (id.startsWith('.') || id.startsWith('/')) {
      const dir = path.dirname(scenarioPath);
      let resolved = path.resolve(dir, id);

      // Try adding extensions
      if (!fs.existsSync(resolved)) {
        for (const ext of ['.ts', '.js', '.tsx', '.jsx']) {
          if (fs.existsSync(resolved + ext)) {
            resolved = resolved + ext;
            break;
          }
          // Try index file
          if (fs.existsSync(path.join(resolved, `index${ext}`))) {
            resolved = path.join(resolved, `index${ext}`);
            break;
          }
        }
      }

      if (!resolved.startsWith(path.resolve(targetDir))) {
        throw new Error(`Cannot require files outside target directory: ${id}`);
      }

      if (fs.existsSync(resolved)) {
        const code = transformScenarioFile(resolved);
        const mod = { exports: {} as Record<string, unknown> };
        const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', code);
        fn(mod, mod.exports, createSafeRequire(resolved, targetDir), resolved, path.dirname(resolved));
        return mod.exports;
      }
    }

    // For node_modules, use regular require
    return require(id);
  };
}

export function startServer(config: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = createServer(config);
    const server = app.listen(config.port);

    const handleError = (err: NodeJS.ErrnoException) => {
      const message = err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Stop the process using it or rerun with --port <open-port>.`
        : `Failed to start server on port ${config.port}: ${err.message}`;

      reject(new ServerStartupError(message, config.port, err.code, { cause: err }));
    };

    server.once('error', handleError);
    server.once('listening', () => {
      server.off('error', handleError);
      console.log(`\n  Runtime Storyboard Debugger`);
      console.log(`  ─────────────────────────────`);
      console.log(`  Target:  ${config.targetDir}`);
      console.log(`  Server:  http://localhost:${config.port}`);
      console.log(`  API:     http://localhost:${config.port}/api/entry-points`);
      if (config.uiDistPath) {
        console.log(`  UI:      http://localhost:${config.port}`);
      }
      console.log(`  ─────────────────────────────\n`);
      resolve();
    });
  });
}
