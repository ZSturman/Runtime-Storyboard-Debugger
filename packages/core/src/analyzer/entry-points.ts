import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { EntryPoint, EntryPointParameter, EntryPointType } from '../storyboard/types';

let entryPointCounter = 0;

function nextId(): string {
  return `ep_${++entryPointCounter}`;
}

function parseFile(filePath: string): t.File | null {
  const code = fs.readFileSync(filePath, 'utf-8');
  try {
    return parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties'],
      sourceFilename: filePath,
    });
  } catch {
    return null;
  }
}

function extractParams(params: (t.Identifier | t.Pattern | t.RestElement | t.TSParameterProperty)[]): EntryPointParameter[] {
  return params
    .filter((p): p is t.Identifier => t.isIdentifier(p))
    .map((p) => ({
      name: p.name,
      type: p.typeAnnotation && t.isTSTypeAnnotation(p.typeAnnotation)
        ? formatTypeAnnotation(p.typeAnnotation)
        : undefined,
    }));
}

function formatTypeAnnotation(ann: t.TSTypeAnnotation): string {
  const t_ = ann.typeAnnotation;
  if (t.isTSStringKeyword(t_)) return 'string';
  if (t.isTSNumberKeyword(t_)) return 'number';
  if (t.isTSBooleanKeyword(t_)) return 'boolean';
  if (t.isTSAnyKeyword(t_)) return 'any';
  if (t.isTSTypeReference(t_) && t.isIdentifier(t_.typeName)) return t_.typeName.name;
  return 'unknown';
}

/**
 * Detect Express-style route registrations: app.get('/path', handler)
 */
function findHttpRoutes(ast: t.File, filePath: string): EntryPoint[] {
  const routes: EntryPoint[] = [];
  const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];

  traverse(ast, {
    CallExpression(nodePath) {
      const { node } = nodePath;
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property) &&
        httpMethods.includes(node.callee.property.name)
      ) {
        const method = node.callee.property.name.toUpperCase();
        const firstArg = node.arguments[0];
        if (t.isStringLiteral(firstArg)) {
          const routePath = firstArg.value;
          const handler = node.arguments[node.arguments.length - 1];
          let params: EntryPointParameter[] = [];

          if (t.isFunctionExpression(handler) || t.isArrowFunctionExpression(handler)) {
            params = extractParams(handler.params as t.Identifier[]);
          }

          routes.push({
            id: nextId(),
            name: `${method} ${routePath}`,
            type: 'http-route',
            file: filePath,
            line: node.loc?.start.line ?? 0,
            column: node.loc?.start.column,
            description: `HTTP ${method} route handler for ${routePath}`,
            parameters: params,
            httpMethod: method,
            httpPath: routePath,
          });
        }
      }
    },
  });

  return routes;
}

/**
 * Detect exported functions (named exports, default exports)
 */
function findExportedFunctions(ast: t.File, filePath: string): EntryPoint[] {
  const exports: EntryPoint[] = [];

  traverse(ast, {
    ExportNamedDeclaration(nodePath) {
      const { node } = nodePath;
      if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
        const fn = node.declaration;
        exports.push({
          id: nextId(),
          name: fn.id!.name,
          type: 'exported-function',
          file: filePath,
          line: fn.loc?.start.line ?? 0,
          column: fn.loc?.start.column,
          description: `Exported function "${fn.id!.name}"`,
          parameters: extractParams(fn.params as t.Identifier[]),
        });
      }

      if (t.isVariableDeclaration(node.declaration)) {
        for (const decl of node.declaration.declarations) {
          if (
            t.isIdentifier(decl.id) &&
            (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init))
          ) {
            exports.push({
              id: nextId(),
              name: decl.id.name,
              type: 'exported-function',
              file: filePath,
              line: decl.loc?.start.line ?? 0,
              column: decl.loc?.start.column,
              description: `Exported function "${decl.id.name}"`,
              parameters: extractParams(decl.init.params as t.Identifier[]),
            });
          }
        }
      }
    },

    ExportDefaultDeclaration(nodePath) {
      const { node } = nodePath;
      if (t.isFunctionDeclaration(node.declaration)) {
        const name = node.declaration.id?.name ?? 'default';
        exports.push({
          id: nextId(),
          name,
          type: 'exported-function',
          file: filePath,
          line: node.loc?.start.line ?? 0,
          column: node.loc?.start.column,
          description: `Default exported function "${name}"`,
          parameters: extractParams(node.declaration.params as t.Identifier[]),
        });
      }
    },
  });

  return exports;
}

/**
 * Detect main-like entry patterns: functions named main, top-level listen() calls
 */
function findMainPatterns(ast: t.File, filePath: string): EntryPoint[] {
  const mains: EntryPoint[] = [];
  const baseName = path.basename(filePath, path.extname(filePath));
  const isEntryFile = ['index', 'main', 'server', 'app', 'start'].includes(baseName);

  traverse(ast, {
    FunctionDeclaration(nodePath) {
      if (nodePath.node.id?.name === 'main') {
        mains.push({
          id: nextId(),
          name: 'main',
          type: 'main-function',
          file: filePath,
          line: nodePath.node.loc?.start.line ?? 0,
          description: 'Main function entry point',
          parameters: extractParams(nodePath.node.params as t.Identifier[]),
        });
      }
    },

    CallExpression(nodePath) {
      const { node } = nodePath;
      // Detect app.listen() or server.listen()
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property) &&
        node.callee.property.name === 'listen' &&
        nodePath.parentPath?.isExpressionStatement() &&
        isEntryFile
      ) {
        mains.push({
          id: nextId(),
          name: `${baseName}.listen()`,
          type: 'main-function',
          file: filePath,
          line: node.loc?.start.line ?? 0,
          description: `Server startup via listen() in ${baseName}`,
          parameters: [],
        });
      }
    },
  });

  return mains;
}

/**
 * Discover all entry points in a directory
 */
export async function discoverEntryPoints(targetDir: string): Promise<EntryPoint[]> {
  entryPointCounter = 0;
  const srcDir = path.join(targetDir, 'src');
  const searchDir = fs.existsSync(srcDir) ? srcDir : targetDir;

  const files = await glob('**/*.{ts,js,tsx,jsx}', {
    cwd: searchDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
  });

  const entryPoints: EntryPoint[] = [];

  for (const file of files) {
    const ast = parseFile(file);
    if (!ast) continue;

    const relFile = path.relative(targetDir, file);
    entryPoints.push(...findHttpRoutes(ast, relFile));
    entryPoints.push(...findExportedFunctions(ast, relFile));
    entryPoints.push(...findMainPatterns(ast, relFile));
  }

  return entryPoints;
}

/**
 * Discover entry points from source code string (for testing)
 */
export function discoverEntryPointsFromSource(code: string, filename: string = 'test.ts'): EntryPoint[] {
  entryPointCounter = 0;
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    sourceFilename: filename,
  });

  const entryPoints: EntryPoint[] = [];
  entryPoints.push(...findHttpRoutes(ast, filename));
  entryPoints.push(...findExportedFunctions(ast, filename));
  entryPoints.push(...findMainPatterns(ast, filename));
  return entryPoints;
}
