import { describe, it, expect } from 'vitest';
import { discoverEntryPointsFromSource } from '../../../packages/core/src/analyzer/entry-points';

describe('Entry Point Discovery', () => {
  it('discovers Express route handlers', () => {
    const code = `
      import express from 'express';
      const app = express();
      app.get('/users', (req, res) => { res.json([]); });
      app.post('/orders', (req, res) => { res.json({}); });
    `;

    const entryPoints = discoverEntryPointsFromSource(code);
    const routes = entryPoints.filter((ep) => ep.type === 'http-route');

    expect(routes).toHaveLength(2);
    expect(routes[0].name).toBe('GET /users');
    expect(routes[0].httpMethod).toBe('GET');
    expect(routes[0].httpPath).toBe('/users');
    expect(routes[1].name).toBe('POST /orders');
    expect(routes[1].httpMethod).toBe('POST');
  });

  it('discovers exported named functions', () => {
    const code = `
      export function processOrder(items: any[]) { return items; }
      export const calculateTotal = (prices: number[]) => prices.reduce((a, b) => a + b, 0);
    `;

    const entryPoints = discoverEntryPointsFromSource(code);
    const exported = entryPoints.filter((ep) => ep.type === 'exported-function');

    expect(exported).toHaveLength(2);
    expect(exported[0].name).toBe('processOrder');
    expect(exported[1].name).toBe('calculateTotal');
  });

  it('discovers default exported functions', () => {
    const code = `
      export default function main() { console.log('start'); }
    `;

    const entryPoints = discoverEntryPointsFromSource(code);
    expect(entryPoints.some((ep) => ep.name === 'main')).toBe(true);
  });

  it('discovers main function pattern', () => {
    const code = `
      function main() { initialize(); }
    `;

    const entryPoints = discoverEntryPointsFromSource(code, 'main.ts');
    expect(entryPoints.some((ep) => ep.type === 'main-function')).toBe(true);
  });

  it('extracts function parameters', () => {
    const code = `
      export function createOrder(items: OrderItem[], notify: boolean) { }
    `;

    const entryPoints = discoverEntryPointsFromSource(code);
    expect(entryPoints[0].parameters).toHaveLength(2);
    expect(entryPoints[0].parameters[0].name).toBe('items');
    expect(entryPoints[0].parameters[1].name).toBe('notify');
  });

  it('assigns unique IDs to each entry point', () => {
    const code = `
      export function a() {}
      export function b() {}
      export function c() {}
    `;

    const entryPoints = discoverEntryPointsFromSource(code);
    const ids = entryPoints.map((ep) => ep.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array for files with no entry points', () => {
    const code = `const internal = 42;`;
    const entryPoints = discoverEntryPointsFromSource(code);
    expect(entryPoints).toHaveLength(0);
  });

  it('includes source location information', () => {
    const code = `export function handler() { }`;
    const entryPoints = discoverEntryPointsFromSource(code);
    expect(entryPoints[0].line).toBeGreaterThan(0);
    expect(entryPoints[0].file).toBe('test.ts');
  });
});
