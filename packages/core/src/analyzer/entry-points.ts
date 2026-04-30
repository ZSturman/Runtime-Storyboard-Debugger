import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type {
  EntryPoint,
  EntryPointInputField,
  EntryPointParameter,
  EntryPointType,
  ExampleSet,
  InputControlType,
} from '../storyboard/types';

let entryPointCounter = 0;

/**
 * Globs that the analyzer should never traverse. Anything generated, vendored,
 * or test-only would only add noise to the entry-point and unfinished-work
 * lists. Keep this list in sync with `unfinished-work.ts`.
 */
export const ANALYZER_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/.git/**',
  '**/coverage/**',
  '**/out/**',
  '**/.vercel/**',
  '**/.vscode-test/**',
  '**/*.d.ts',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.min.*',
];

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
      required: true,
      uiControl: inferInputControl(
        p.typeAnnotation && t.isTSTypeAnnotation(p.typeAnnotation)
          ? formatTypeAnnotation(p.typeAnnotation)
          : undefined,
      ),
    }));
}

function inferInputControl(type?: string): InputControlType {
  if (!type) return 'json';
  if (type === 'string') return 'text';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'json';
}

function inferExampleValue(type?: string): unknown {
  if (!type) return undefined;
  if (type === 'string') return 'example';
  if (type === 'number') return 42;
  if (type === 'boolean') return true;
  return undefined;
}

function buildFunctionInputFields(parameters: EntryPointParameter[]): EntryPointInputField[] {
  return parameters.map((parameter) => ({
    key: parameter.name,
    label: parameter.name,
    type: parameter.uiControl || inferInputControl(parameter.type),
    location: 'argument' as const,
    required: parameter.required ?? true,
    helpText: parameter.type ? `Expected type: ${parameter.type}` : 'Enter a value or valid JSON.',
    exampleValue: inferExampleValue(parameter.type),
  }));
}

function humanizeParamName(param: string): string {
  return param.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
}

function parseRouteParams(routePath: string): string[] {
  const matches = routePath.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

function extractHandlerBodyKeys(handler: t.ArrowFunctionExpression | t.FunctionExpression): string[] {
  const firstParam = handler.params[0];
  if (!firstParam || !t.isIdentifier(firstParam)) return [];
  const reqName = firstParam.name;
  const keys: string[] = [];

  const program = t.program([t.expressionStatement(handler)]);
  const file = t.file(program);

  traverse(
    file,
    {
      MemberExpression(memberPath) {
        const { node } = memberPath;
        if (
          t.isMemberExpression(node.object) &&
          t.isIdentifier(node.object.object) &&
          node.object.object.name === reqName &&
          t.isIdentifier(node.object.property) &&
          node.object.property.name === 'body' &&
          t.isIdentifier(node.property)
        ) {
          keys.push(node.property.name);
        }
      },
      VariableDeclarator(declPath) {
        const { node } = declPath;
        if (
          t.isObjectPattern(node.id) &&
          t.isMemberExpression(node.init) &&
          t.isIdentifier(node.init.object) &&
          node.init.object.name === reqName &&
          t.isIdentifier(node.init.property) &&
          node.init.property.name === 'body'
        ) {
          for (const prop of node.id.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              keys.push(prop.key.name);
            }
          }
        }
      },
    },
  );

  return keys;
}

function buildRouteInputFields(method: string, routePath: string, handler?: t.ArrowFunctionExpression | t.FunctionExpression): EntryPointInputField[] {
  const fields: EntryPointInputField[] = [];
  const routeParams = parseRouteParams(routePath);
  const hasBody = method !== 'GET' && method !== 'DELETE';

  // Individual route parameter fields
  for (const param of routeParams) {
    fields.push({
      key: `params.${param}`,
      label: humanizeParamName(param),
      type: 'text',
      location: 'params',
      required: true,
      helpText: `Value for :${param} in the URL path.`,
      defaultValue: '',
      exampleValue: `${param}-123`,
      friendlyLabel: humanizeParamName(param),
    });
  }

  // Try to extract body fields from handler destructuring
  const bodyKeys = handler ? extractHandlerBodyKeys(handler) : [];

  if (hasBody && bodyKeys.length > 0) {
    // Structured body fields inferred from handler
    for (const key of bodyKeys) {
      fields.push({
        key: `body.${key}`,
        label: humanizeParamName(key),
        type: 'json',
        location: 'body',
        required: true,
        helpText: `Value for "${key}" in the request body.`,
        defaultValue: undefined,
        friendlyLabel: humanizeParamName(key),
      });
    }
  } else if (hasBody) {
    // Fallback: single JSON body textarea
    fields.push({
      key: 'body',
      label: `${method} ${routePath} body`,
      type: 'json',
      location: 'body',
      required: true,
      helpText: 'Request body payload. Use JSON for objects and arrays.',
      defaultValue: {},
      friendlyLabel: 'Request data',
    });
  }

  // Query params — always available but optional
  fields.push({
    key: 'query',
    label: 'Query parameters',
    type: 'json',
    location: 'query',
    required: false,
    helpText: 'Optional query string values as JSON.',
    defaultValue: {},
    friendlyLabel: 'Search & filter options',
    hidden: true,
  });

  // Headers — hidden by default, auto-injected
  fields.push({
    key: 'headers',
    label: 'Headers',
    type: 'json',
    location: 'headers',
    required: false,
    helpText: 'Optional request headers as JSON. Content-Type is set automatically.',
    defaultValue: {},
    friendlyLabel: 'Request headers',
    hidden: true,
  });

  return fields;
}

function buildRouteExampleSets(method: string, routePath: string, bodyKeys: string[]): ExampleSet[] {
  if (method === 'GET' || method === 'DELETE') {
    return [];
  }

  const routeParams = parseRouteParams(routePath);
  const paramValues: Record<string, unknown> = {};
  for (const param of routeParams) {
    paramValues[`params.${param}`] = `${param}-123`;
  }

  // Generate a basic example with plausible values
  const bodyValues: Record<string, unknown> = {};
  if (bodyKeys.length > 0) {
    for (const key of bodyKeys) {
      bodyValues[`body.${key}`] = guessExampleForKey(key);
    }
  } else {
    bodyValues.body = {};
  }

  return [{
    id: 'default-example',
    label: 'Quick start example',
    description: `A minimal ${method} request with sample values.`,
    values: { ...paramValues, ...bodyValues },
  }];
}

function guessExampleForKey(key: string): unknown {
  const lower = key.toLowerCase();
  if (lower === 'items' || lower === 'products' || lower === 'list') {
    return [{ name: 'Widget', price: 25, quantity: 1 }];
  }
  if (lower === 'notify' || lower === 'enabled' || lower === 'active' || lower.startsWith('is') || lower.startsWith('has')) {
    return false;
  }
  if (lower === 'name' || lower === 'title' || lower === 'label') return 'Example';
  if (lower === 'email') return 'user@example.com';
  if (lower === 'id') return 'item-123';
  if (lower === 'count' || lower === 'quantity' || lower === 'amount' || lower === 'price' || lower === 'total') return 1;
  if (lower === 'description' || lower === 'message' || lower === 'text') return 'Sample text';
  return 'value';
}

function createRunSupport(type: EntryPointType): EntryPoint['runSupport'] {
  if (type === 'exported-function' || type === 'http-route') {
    return { status: 'supported' };
  }

  return {
    status: 'preview-only',
    reason: 'This entry point is available for static exploration in v1, but direct execution is not supported yet.',
  };
}

function createEntryPointBase(
  type: EntryPointType,
  parameters: EntryPointParameter[],
): Pick<EntryPoint, 'parameters' | 'invocationKind' | 'runSupport' | 'inputFields' | 'exampleSets' | 'unfinishedWork'> {
  const invocationKind = type === 'http-route'
    ? 'http-route'
    : type === 'exported-function'
      ? 'function'
      : 'preview';

  return {
    parameters,
    invocationKind,
    runSupport: createRunSupport(type),
    inputFields: type === 'exported-function' ? buildFunctionInputFields(parameters) : [],
    exampleSets: [],
    unfinishedWork: [],
  };
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
          let typedHandler: t.ArrowFunctionExpression | t.FunctionExpression | undefined;

          if (t.isFunctionExpression(handler) || t.isArrowFunctionExpression(handler)) {
            params = extractParams(handler.params as t.Identifier[]);
            typedHandler = handler;
          }

          const inputFields = buildRouteInputFields(method, routePath, typedHandler);
          const bodyKeys = typedHandler ? extractHandlerBodyKeys(typedHandler) : [];
          const exampleSets = buildRouteExampleSets(method, routePath, bodyKeys);

          // For GET with no params, mark as "no input needed"
          const isSimpleGet = method === 'GET' && parseRouteParams(routePath).length === 0;

          routes.push({
            id: nextId(),
            name: `${method} ${routePath}`,
            type: 'http-route',
            file: filePath,
            line: node.loc?.start.line ?? 0,
            column: node.loc?.start.column,
            description: isSimpleGet
              ? `HTTP ${method} route — no input required, just run it.`
              : `HTTP ${method} route handler for ${routePath}`,
            ...createEntryPointBase('http-route', params),
            httpMethod: method,
            httpPath: routePath,
            inputFields,
            exampleSets,
            routeRequestShape: {
              method,
              path: routePath,
              fields: inputFields,
            },
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
          ...createEntryPointBase('exported-function', extractParams(fn.params as t.Identifier[])),
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
              ...createEntryPointBase('exported-function', extractParams(decl.init.params as t.Identifier[])),
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
          ...createEntryPointBase('exported-function', extractParams(node.declaration.params as t.Identifier[])),
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
          routeRequestShape: undefined,
          ...createEntryPointBase('main-function', extractParams(nodePath.node.params as t.Identifier[])),
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
          description: `Server startup via listen() in ${baseName}. This boots up the application.`,
          routeRequestShape: undefined,
          ...createEntryPointBase('main-function', []),
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
    ignore: ANALYZER_IGNORE_GLOBS,
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
