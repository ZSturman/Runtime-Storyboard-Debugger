import { describe, it, expect } from 'vitest';
import { transformSync } from '@babel/core';
import rsdBabelPlugin from '../../../packages/core/src/instrumenter/babel-plugin';

function transform(code: string): string {
  const result = transformSync(code, {
    plugins: [rsdBabelPlugin],
    filename: 'test.ts',
    presets: [],
  });
  return result?.code || '';
}

describe('Babel Instrumentation Plugin', () => {
  it('injects __rsd runtime declaration at top of file', () => {
    const code = `const x = 1;`;
    const output = transform(code);
    expect(output).toContain('__rsd');
    expect(output).toContain('global.__rsd_runtime');
  });

  it('instruments function declarations with enter/exit calls', () => {
    const code = `function hello(name) { return name; }`;
    const output = transform(code);
    expect(output).toContain('__rsd.enter');
    expect(output).toContain('__rsd.exit');
    expect(output).toContain('"hello"');
  });

  it('instruments arrow functions', () => {
    const code = `const greet = (name) => name.toUpperCase();`;
    const output = transform(code);
    expect(output).toContain('__rsd.enter');
    expect(output).toContain('__rsd.exit');
  });

  it('instruments if statements with branch tracking', () => {
    const code = `
      function check(x) {
        if (x > 10) {
          return 'big';
        } else {
          return 'small';
        }
      }
    `;
    const output = transform(code);
    expect(output).toContain('__rsd.branch');
    expect(output).toContain('x > 10');
  });

  it('captures condition values in branch instrumentation', () => {
    const code = `
      function test(order) {
        if (order.total > 100) {
          return 'discount';
        }
      }
    `;
    const output = transform(code);
    expect(output).toContain('__rsd.branch');
    expect(output).toContain('order.total > 100');
  });

  it('instruments known side-effect method calls', () => {
    const code = `
      function process() {
        console.log('processing');
      }
    `;
    const output = transform(code);
    expect(output).toContain('__rsd.sideEffect');
    expect(output).toContain('"log"');
  });

  it('preserves original source semantics', () => {
    const code = `function add(a, b) { return a + b; }`;
    const output = transform(code);
    // The function should still contain the return of a + b
    expect(output).toContain('a + b');
  });

  it('handles functions with no parameters', () => {
    const code = `function noop() { }`;
    const output = transform(code);
    expect(output).toContain('__rsd.enter("noop"');
  });

  it('does not crash on complex code', () => {
    const code = `
      async function fetchData(url) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            return await response.json();
          } else {
            throw new Error('Failed');
          }
        } catch (err) {
          console.error(err);
          return null;
        }
      }
    `;
    expect(() => transform(code)).not.toThrow();
  });
});
