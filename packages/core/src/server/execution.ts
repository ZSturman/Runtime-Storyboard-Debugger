import * as fs from 'fs';
import * as path from 'path';
import { transformFileSync } from '@babel/core';
import { installGlobalRuntime, uninstallGlobalRuntime, runWithTrace } from '../instrumenter/runtime';
import rsdBabelPlugin from '../instrumenter/babel-plugin';
import type { EntryPoint, RunContext } from '../storyboard/types';

interface LoadedModule {
  exports: Record<string, unknown>;
}

interface InstrumentedModuleCacheEntry extends LoadedModule {}

type ModuleCache = Map<string, InstrumentedModuleCacheEntry>;

export interface ExecutionResult {
  events: Awaited<ReturnType<typeof runWithTrace>>['events'];
  durationMs: number;
  technicalNotes: string[];
  runContext: RunContext;
}

function transformInstrumentedFile(filePath: string): string {
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

function resolveWithinTarget(requesterPath: string, id: string, targetDir: string): string | null {
  if (!id.startsWith('.') && !id.startsWith('/')) {
    return null;
  }

  const requesterDir = path.dirname(requesterPath);
  let resolved = path.resolve(requesterDir, id);

  if (!fs.existsSync(resolved)) {
    for (const ext of ['.ts', '.js', '.tsx', '.jsx']) {
      if (fs.existsSync(resolved + ext)) {
        resolved = resolved + ext;
        break;
      }
      if (fs.existsSync(path.join(resolved, `index${ext}`))) {
        resolved = path.join(resolved, `index${ext}`);
        break;
      }
    }
  }

  if (!resolved.startsWith(path.resolve(targetDir))) {
    throw new Error(
      `[require_outside_target] Cannot require "${id}" because it resolves outside the target directory. ` +
        'Suggested action: only require modules that live inside the target project, or rerun rsd with a wider --target.',
    );
  }

  return fs.existsSync(resolved) ? resolved : null;
}

function executeInstrumentedModule(filePath: string, targetDir: string, cache: ModuleCache): LoadedModule {
  const cached = cache.get(filePath);
  if (cached) {
    return cached;
  }

  const code = transformInstrumentedFile(filePath);
  const moduleRecord: LoadedModule = { exports: {} };
  cache.set(filePath, moduleRecord);

  const instrumentedRequire = (id: string): unknown => {
    const resolved = resolveWithinTarget(filePath, id, targetDir);
    if (!resolved) {
      return require(id);
    }

    return executeInstrumentedModule(resolved, targetDir, cache).exports;
  };

  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', code);
  fn(moduleRecord, moduleRecord.exports, instrumentedRequire, filePath, path.dirname(filePath));

  return moduleRecord;
}

function loadInstrumentedModule(filePath: string, targetDir: string): LoadedModule {
  return executeInstrumentedModule(filePath, targetDir, new Map());
}

function coerceValue(value: unknown, type?: string): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (type === 'number') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    }
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  if (type === 'string' && typeof value !== 'string') {
    return String(value);
  }

  return value;
}

function buildFunctionArguments(entryPoint: EntryPoint, inputs: Record<string, unknown>): unknown[] {
  return entryPoint.parameters.map((parameter) => coerceValue(inputs[parameter.name], parameter.type));
}

function resolveExportedFunction(moduleExports: Record<string, unknown>, entryPoint: EntryPoint): (...args: unknown[]) => unknown {
  const namedExport = moduleExports[entryPoint.name];
  if (typeof namedExport === 'function') {
    return namedExport as (...args: unknown[]) => unknown;
  }

  if (entryPoint.name === 'default' && typeof moduleExports.default === 'function') {
    return moduleExports.default as (...args: unknown[]) => unknown;
  }

  if (typeof moduleExports.default === 'function') {
    const defaultFn = moduleExports.default as (...args: unknown[]) => unknown;
    if ((defaultFn as { name?: string }).name === entryPoint.name) {
      return defaultFn;
    }
  }

  throw new Error(
    `[entry_point_export_missing] Could not resolve exported function "${entryPoint.name}" from ${entryPoint.file}. ` +
      'Suggested action: confirm the function is exported (named or default) and that the file compiles. Then refresh the workspace overview.',
  );
}

interface MockRequest {
  method: string;
  path: string;
  url: string;
  originalUrl: string;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  body: unknown;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
}

class MockResponse {
  statusCode = 200;
  body: unknown = undefined;
  headers: Record<string, unknown> = {};
  finished = false;
  locals: Record<string, unknown> = {};

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    this.headers['content-type'] = 'application/json';
    this.finished = true;
    return this;
  }

  send(payload: unknown) {
    this.body = payload;
    this.finished = true;
    return this;
  }

  set(name: string, value: unknown) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  setHeader(name: string, value: unknown) {
    this.headers[name.toLowerCase()] = value;
  }

  getHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }

  end(payload?: unknown) {
    if (payload !== undefined) {
      this.body = payload;
    }
    this.finished = true;
    return this;
  }
}

function createMockRequest(entryPoint: EntryPoint, inputs: Record<string, unknown>): MockRequest {
  const userHeaders = (inputs.headers as Record<string, unknown>) || {};
  const headers: Record<string, unknown> = {
    'content-type': 'application/json',
    'accept': 'application/json',
    ...userHeaders,
  };

  // Support both `params` (object) and `params.{key}` (individual fields)
  let params: Record<string, unknown> = {};
  if (inputs.params && typeof inputs.params === 'object') {
    params = inputs.params as Record<string, unknown>;
  }
  for (const [key, value] of Object.entries(inputs)) {
    if (key.startsWith('params.')) {
      params[key.slice(7)] = value;
    }
  }

  // Support both `body` (object) and `body.{key}` (individual fields)
  let body: unknown = inputs.body ?? {};
  const bodyFieldKeys = Object.keys(inputs).filter((k) => k.startsWith('body.'));
  if (bodyFieldKeys.length > 0) {
    const composed: Record<string, unknown> = {};
    for (const key of bodyFieldKeys) {
      composed[key.slice(5)] = inputs[key];
    }
    body = composed;
  }

  return {
    method: entryPoint.httpMethod || 'GET',
    path: entryPoint.httpPath || '/',
    url: entryPoint.httpPath || '/',
    originalUrl: entryPoint.httpPath || '/',
    headers,
    query: (inputs.query as Record<string, unknown>) || {},
    params,
    body,
    get(name: string) {
      const value = headers[name.toLowerCase()] ?? headers[name];
      return value === undefined ? undefined : String(value);
    },
    header(name: string) {
      const value = headers[name.toLowerCase()] ?? headers[name];
      return value === undefined ? undefined : String(value);
    },
  };
}

type RouteLayer = {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack?: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function resolveRouteHandlers(appExport: unknown, entryPoint: EntryPoint): Array<(...args: unknown[]) => unknown> {
  const stack = (appExport as { _router?: { stack?: RouteLayer[] } })?._router?.stack;
  if (!Array.isArray(stack)) {
    throw new Error(
      `[express_app_export_missing] Could not inspect Express routes from ${entryPoint.file}. ` +
        'Suggested action: export the Express app or router as the default export (e.g. `export default app`).',
    );
  }

  const routeLayer = stack.find((layer) => {
    if (!layer.route?.path || !layer.route.methods) {
      return false;
    }

    return layer.route.path === entryPoint.httpPath && Boolean(layer.route.methods[(entryPoint.httpMethod || 'GET').toLowerCase()]);
  });

  if (!routeLayer?.route?.stack?.length) {
    throw new Error(
      `[route_handler_not_found] Could not find a route handler matching "${entryPoint.name}". ` +
        'Suggested action: verify the method and path are still registered on the exported app, then refresh the workspace overview.',
    );
  }

  return routeLayer.route.stack.map((routeHandler) => routeHandler.handle);
}

async function runHandlersSequentially(
  handlers: Array<(...args: unknown[]) => unknown>,
  req: MockRequest,
  res: MockResponse,
): Promise<void> {
  for (const handler of handlers) {
    await new Promise<void>((resolve, reject) => {
      const next = (err?: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      };

      try {
        const result = handler(req, res, next);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(() => resolve()).catch(reject);
          return;
        }

        if (handler.length < 3 || res.finished) {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });

    if (res.finished) {
      break;
    }
  }
}

export async function executeFunctionEntryPoint(
  targetDir: string,
  entryPoint: EntryPoint,
  inputs: Record<string, unknown>,
  flags: Record<string, unknown> = {},
  rerunContext?: { storyboardId?: string; frameId?: string },
): Promise<ExecutionResult> {
  installGlobalRuntime();
  try {
    const fullPath = path.resolve(targetDir, entryPoint.file);
    const loadedModule = loadInstrumentedModule(fullPath, targetDir);
    const callable = resolveExportedFunction(loadedModule.exports, entryPoint);
    const args = buildFunctionArguments(entryPoint, inputs);
    const traceResult = await runWithTrace(async () => {
      await callable(...args);
    });

    return {
      events: traceResult.events,
      durationMs: traceResult.duration,
      technicalNotes: [],
      runContext: {
        mode: 'entry-point',
        entryPointId: entryPoint.id,
        entryPointName: entryPoint.name,
        inputs,
        flags,
        rerunOfStoryboardId: rerunContext?.storyboardId,
        rerunFromFrameId: rerunContext?.frameId,
      },
    };
  } finally {
    uninstallGlobalRuntime();
  }
}

export async function executeHttpRouteEntryPoint(
  targetDir: string,
  entryPoint: EntryPoint,
  inputs: Record<string, unknown>,
  flags: Record<string, unknown> = {},
  rerunContext?: { storyboardId?: string; frameId?: string },
): Promise<ExecutionResult> {
  installGlobalRuntime();
  try {
    const fullPath = path.resolve(targetDir, entryPoint.file);
    const loadedModule = loadInstrumentedModule(fullPath, targetDir);
    const appExport = loadedModule.exports.default || loadedModule.exports.app || loadedModule.exports;
    const handlers = resolveRouteHandlers(appExport, entryPoint);
    const req = createMockRequest(entryPoint, inputs);
    const res = new MockResponse();
    const traceResult = await runWithTrace(async () => {
      await runHandlersSequentially(handlers, req, res);
    });

    const technicalNotes = [
      `HTTP response status: ${res.statusCode}`,
      `HTTP response body: ${JSON.stringify(res.body)}`,
    ];

    return {
      events: traceResult.events,
      durationMs: traceResult.duration,
      technicalNotes,
      runContext: {
        mode: 'entry-point',
        entryPointId: entryPoint.id,
        entryPointName: entryPoint.name,
        inputs,
        flags,
        rerunOfStoryboardId: rerunContext?.storyboardId,
        rerunFromFrameId: rerunContext?.frameId,
      },
    };
  } finally {
    uninstallGlobalRuntime();
  }
}
