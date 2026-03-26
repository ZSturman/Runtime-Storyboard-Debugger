import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { transformSync } from '@babel/core';
import rsdBabelPlugin from '../../packages/core/src/instrumenter/babel-plugin';
import { installGlobalRuntime, runWithTrace } from '../../packages/core/src/instrumenter/runtime';
import { buildFrames } from '../../packages/core/src/storyboard/frame-builder';
import { narrate } from '../../packages/core/src/storyboard/narrator';
import { discoverEntryPointsFromSource } from '../../packages/core/src/analyzer/entry-points';
import * as fs from 'fs';

// ─── Helpers ────────────────────────────────────────────────────

function instrumentAndLoad(code: string, filename: string): Record<string, unknown> {
  const result = transformSync(code, {
    plugins: [rsdBabelPlugin],
    filename,
    presets: [],
  });
  if (!result?.code) throw new Error('Babel transform failed');

  const mod: Record<string, unknown> = {};
  const fn = new Function('exports', 'require', '__filename', '__dirname', result.code);
  fn(mod, require, filename, path.dirname(filename));
  return mod;
}

const exampleDir = path.resolve(__dirname, '../../examples/order-api');

function readExample(relativePath: string): string {
  return fs.readFileSync(path.join(exampleDir, relativePath), 'utf-8');
}

// Transform the example code without TS syntax (strip types manually or use babel presets)
function instrumentExample(relativePath: string): string {
  const code = readExample(relativePath);
  const result = transformSync(code, {
    plugins: [rsdBabelPlugin],
    presets: [
      ['@babel/preset-typescript', { isTSX: false, allExtensions: true }],
    ],
    filename: relativePath,
  });
  return result?.code || '';
}

// ─── Integration: Inline instrument + trace + build frames ──────

describe('Integration: Instrument → Trace → Storyboard Pipeline', () => {
  beforeEach(() => {
    installGlobalRuntime();
  });

  afterEach(() => {
    (global as any).__rsd = undefined;
    (global as any).__rsd_runtime = undefined;
  });

  it('traces a simple function and produces frames', async () => {
    const code = `
      function greet(name) {
        if (name === 'VIP') {
          return 'Welcome, VIP!';
        }
        return 'Hello, ' + name;
      }
      exports.greet = greet;
    `;

    const mod = instrumentAndLoad(code, 'greet.js');
    const greet = mod.greet as (name: string) => string;

    const result = await runWithTrace(() => greet('VIP'));
    expect(result.events.length).toBeGreaterThan(0);

    const frames = buildFrames(result.events);
    expect(frames.length).toBeGreaterThan(0);

    // Should have function-entry frame
    const entryFrame = frames.find((f) => f.type === 'function-entry');
    expect(entryFrame).toBeDefined();
    expect(entryFrame!.functionName).toBe('greet');

    // Should have branch frame
    const branchFrame = frames.find((f) => f.type === 'branch');
    expect(branchFrame).toBeDefined();
    expect(branchFrame!.branch?.taken).toBe(true);

    // Narrate should produce readable text
    const narrated = narrate(entryFrame!);
    expect(narrated.title).toContain('greet');
    expect(narrated.description).toContain('greet');
  });

  it('traces function returning a value and captures it', async () => {
    const code = `
      function add(a, b) { return a + b; }
      exports.add = add;
    `;

    const mod = instrumentAndLoad(code, 'add.js');
    const add = mod.add as (a: number, b: number) => number;

    const result = await runWithTrace(() => add(3, 4));
    const frames = buildFrames(result.events);

    const returnFrame = frames.find((f) => f.type === 'return');
    expect(returnFrame).toBeDefined();
    expect(returnFrame!.returnValue).toBe(7);
  });

  it('traces branch-not-taken (else path)', async () => {
    const code = `
      function check(x) {
        if (x > 100) {
          return 'big';
        } else {
          return 'small';
        }
      }
      exports.check = check;
    `;

    const mod = instrumentAndLoad(code, 'check.js');
    const check = mod.check as (x: number) => string;

    const result = await runWithTrace(() => check(50));
    const frames = buildFrames(result.events);

    const branchFrame = frames.find((f) => f.type === 'branch');
    expect(branchFrame).toBeDefined();
    expect(branchFrame!.branch?.taken).toBe(false);

    const narrated = narrate(branchFrame!);
    expect(narrated.branch?.explanation).toContain('false');
    expect(narrated.branch?.explanation).toContain('alternate');
  });

  it('captures side effects from console calls', async () => {
    const code = `
      function process(msg) {
        console.log('Processing:', msg);
        return 'done';
      }
      exports.process = process;
    `;

    const mod = instrumentAndLoad(code, 'process.js');
    const process = mod.process as (msg: string) => string;

    const result = await runWithTrace(() => process('hello'));
    const frames = buildFrames(result.events);

    const seFrame = frames.find((f) => f.type === 'side-effect');
    expect(seFrame).toBeDefined();
    expect(seFrame!.sideEffects[0].type).toBe('log');
  });

  it('produces linked frames with nextFrameId', async () => {
    const code = `
      function outer() {
        return inner();
      }
      function inner() {
        return 42;
      }
      exports.outer = outer;
    `;

    const mod = instrumentAndLoad(code, 'chain.js');
    const outer = mod.outer as () => number;

    const result = await runWithTrace(() => outer());
    const frames = buildFrames(result.events);

    // Most frames (except the last) should have a nextFrameId
    const linked = frames.filter((f) => f.nextFrameId);
    expect(linked.length).toBeGreaterThan(0);

    // All linked nextFrameIds should reference valid frames
    const ids = new Set(frames.map((f) => f.id));
    for (const f of linked) {
      expect(ids.has(f.nextFrameId!)).toBe(true);
    }
  });
});

describe('Entry Point Discovery on Example App', () => {
  it('finds entry points in order-service source', () => {
    const code = readExample('src/services/order-service.ts');
    const entryPoints = discoverEntryPointsFromSource(code, 'order-service.ts');

    const createOrder = entryPoints.find((ep) => ep.name === 'createOrder');
    expect(createOrder).toBeDefined();
    expect(createOrder!.type).toBe('exported-function');
    expect(createOrder!.parameters.length).toBeGreaterThanOrEqual(1);
  });

  it('finds HTTP route in app.ts', () => {
    const code = readExample('src/app.ts');
    const entryPoints = discoverEntryPointsFromSource(code, 'app.ts');

    const postRoute = entryPoints.find((ep) => ep.httpMethod === 'POST');
    expect(postRoute).toBeDefined();
    expect(postRoute!.httpPath).toBe('/orders');
  });
});
