import type { PluginObj, PluginPass } from '@babel/core';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';

interface PluginState extends PluginPass {
  rsdImportAdded?: boolean;
  filename: string;
}

/**
 * Babel plugin that instruments JavaScript/TypeScript source code for runtime tracing.
 *
 * Transforms:
 * - Function declarations/expressions → wraps body with __rsd.enter() / __rsd.exit()
 * - If statements → captures condition value via __rsd.branch()
 * - Await expressions → wraps with __rsd.awaitStart() / __rsd.awaitEnd()
 * - Known side-effect calls → tags via __rsd.sideEffect()
 */
export default function rsdBabelPlugin(): PluginObj<PluginState> {
  return {
    name: 'runtime-storyboard-debugger',
    visitor: {
      Program: {
        enter(path, state) {
          if (state.rsdImportAdded) return;
          state.rsdImportAdded = true;

          const rsdDecl = t.functionDeclaration(
            t.identifier('__rsd'),
            [],
            t.blockStatement([
              t.returnStatement(
                t.conditionalExpression(
                  t.binaryExpression(
                    '===',
                    t.unaryExpression(
                      'typeof',
                      t.memberExpression(t.identifier('global'), t.identifier('__rsd_runtime')),
                    ),
                    t.stringLiteral('function'),
                  ),
                  t.callExpression(
                    t.memberExpression(t.identifier('global'), t.identifier('__rsd_runtime')),
                    [],
                  ),
                  t.objectExpression([
                    createNoopMethod('enter'),
                    createNoopMethod('exit'),
                    createNoopMethod('branch'),
                    createNoopMethod('awaitStart'),
                    createNoopMethod('awaitEnd'),
                    createNoopMethod('sideEffect'),
                  ]),
                ),
              ),
            ]),
          );
          (rsdDecl as any)._rsdInstrumented = true;

          path.unshiftContainer('body', rsdDecl);
        },
      },

      FunctionDeclaration(path, state) {
        instrumentFunction(path, state);
      },

      FunctionExpression(path, state) {
        instrumentFunction(path, state);
      },

      ArrowFunctionExpression(path, state) {
        instrumentArrowFunction(path, state);
      },

      IfStatement(path, state) {
        instrumentBranch(path, state);
      },

      AwaitExpression(path, state) {
        instrumentAwait(path, state);
      },

      CallExpression(path, state) {
        instrumentSideEffect(path, state);
      },
    },
  };
}

function createNoopMethod(name: string): t.ObjectProperty {
  const arrow = t.arrowFunctionExpression([], t.identifier('undefined'));
  (arrow as any)._rsdInstrumented = true;
  return t.objectProperty(t.identifier(name), arrow);
}

function buildRuntimeMethodCall(methodName: string, args: t.Expression[]): t.CallExpression {
  return t.callExpression(
    t.memberExpression(
      t.callExpression(t.identifier('__rsd'), []),
      t.identifier(methodName),
    ),
    args,
  );
}

function getFilename(state: PluginState): string {
  return state.filename || 'unknown';
}

function getFunctionName(
  path: NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression>
): string {
  const node = path.node;
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (t.isFunctionExpression(node) && node.id) return node.id.name;

  // Check parent for variable assignment
  const parent = path.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
    return parent.node.id.name;
  }
  // Check object property
  if (parent?.isObjectProperty() && t.isIdentifier(parent.node.key)) {
    return parent.node.key.name;
  }
  // Check class method
  if (parent?.isClassProperty() && t.isIdentifier(parent.node.key)) {
    return parent.node.key.name;
  }

  return '<anonymous>';
}

function buildArgsObject(params: (t.Identifier | t.Pattern | t.RestElement | t.TSParameterProperty)[]): t.ObjectExpression {
  const properties = params
    .filter((p): p is t.Identifier => t.isIdentifier(p))
    .map((p) =>
      t.objectProperty(t.identifier(p.name), t.identifier(p.name), false, true)
    );
  return t.objectExpression(properties);
}

function buildSnapshotObject(nodes: Array<t.Node | null | undefined>): t.ObjectExpression {
  const properties: t.ObjectProperty[] = [];
  const seen = new Set<string>();

  function pushProperty(key: string, value: t.Expression) {
    if (seen.has(key)) return;
    seen.add(key);
    properties.push(t.objectProperty(t.stringLiteral(key), t.cloneNode(value)));
  }

  function collect(node: t.Node | null | undefined) {
    if (!node) return;

    if (t.isIdentifier(node)) {
      pushProperty(node.name, node);
      return;
    }

    if (t.isMemberExpression(node)) {
      pushProperty(exprToString(node), node as t.Expression);
      return;
    }

    if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) {
      collect(node.left);
      collect(node.right);
      return;
    }

    if (t.isUnaryExpression(node)) {
      collect(node.argument);
      return;
    }

    if (t.isCallExpression(node)) {
      collect(node.callee);
      for (const arg of node.arguments) {
        if (t.isExpression(arg)) {
          collect(arg);
        }
      }
      return;
    }

    if (t.isArrayExpression(node)) {
      for (const element of node.elements) {
        if (element && t.isExpression(element)) {
          collect(element);
        }
      }
      return;
    }

    if (t.isObjectExpression(node)) {
      for (const property of node.properties) {
        if (t.isObjectProperty(property) && t.isExpression(property.value)) {
          collect(property.value);
        }
      }
      return;
    }

    if (t.isConditionalExpression(node)) {
      collect(node.test);
      collect(node.consequent);
      collect(node.alternate);
    }
  }

  for (const node of nodes) {
    collect(node);
  }

  return t.objectExpression(properties);
}

function buildArgumentSnapshot(args: ReadonlyArray<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>): t.ObjectExpression {
  const properties: t.ObjectProperty[] = [];
  args.forEach((arg, index) => {
    if (t.isExpression(arg)) {
      properties.push(
        t.objectProperty(
          t.stringLiteral(`arg${index + 1}`),
          t.cloneNode(arg),
        ),
      );
    }
  });
  return t.objectExpression(properties);
}

function instrumentFunction(
  path: NodePath<t.FunctionDeclaration | t.FunctionExpression>,
  state: PluginState
) {
  if ((path.node as any)._rsdInstrumented) return;
  (path.node as any)._rsdInstrumented = true;

  const body = path.node.body;
  if (!t.isBlockStatement(body)) return;

  const fnName = getFunctionName(path);
  const file = getFilename(state);
  const line = path.node.loc?.start.line ?? 0;

  const enterCall = t.expressionStatement(
    buildRuntimeMethodCall('enter', [
      t.stringLiteral(fnName),
      buildArgsObject(path.node.params),
      t.stringLiteral(file),
      t.numericLiteral(line),
    ])
  );

  const exitCall = t.expressionStatement(
    buildRuntimeMethodCall('exit', [
      t.stringLiteral(fnName),
      t.identifier('undefined'),
      buildSnapshotObject(path.node.params),
      t.stringLiteral(file),
      t.numericLiteral(line),
    ])
  );

  // Wrap return statements to capture return value
  path.traverse({
    ReturnStatement(retPath) {
      if ((retPath.node as any)._rsdReturnInstrumented) return;
      if (retPath.getFunctionParent() !== path) return;
      const retVal = retPath.node.argument || t.identifier('undefined');
      const tempId = path.scope.generateUidIdentifier('retVal');

      const newReturn = t.returnStatement(t.cloneNode(tempId));
      (newReturn as any)._rsdReturnInstrumented = true;

      retPath.replaceWithMultiple([
        t.variableDeclaration('const', [t.variableDeclarator(tempId, retVal)]),
        t.expressionStatement(
          buildRuntimeMethodCall('exit', [
            t.stringLiteral(fnName),
            t.cloneNode(tempId),
            buildSnapshotObject([...path.node.params, retVal]),
            t.stringLiteral(file),
            t.numericLiteral(retPath.node.loc?.start.line ?? line),
          ])
        ),
        newReturn,
      ]);
    },
  });

  body.body.unshift(enterCall);
  body.body.push(exitCall);
}

function instrumentArrowFunction(
  path: NodePath<t.ArrowFunctionExpression>,
  state: PluginState
) {
  if ((path.node as any)._rsdInstrumented) return;
  (path.node as any)._rsdInstrumented = true;

  const fnName = getFunctionName(path);
  const file = getFilename(state);
  const line = path.node.loc?.start.line ?? 0;

  // Convert expression-body arrows to block bodies
  if (!t.isBlockStatement(path.node.body)) {
    const expr = path.node.body;
    const tempId = path.scope.generateUidIdentifier('retVal');
    path.node.body = t.blockStatement([
      t.expressionStatement(
        buildRuntimeMethodCall('enter', [
          t.stringLiteral(fnName),
          buildArgsObject(path.node.params),
          t.stringLiteral(file),
          t.numericLiteral(line),
        ])
      ),
      t.variableDeclaration('const', [t.variableDeclarator(tempId, expr)]),
      t.expressionStatement(
        buildRuntimeMethodCall('exit', [
          t.stringLiteral(fnName),
          t.cloneNode(tempId),
          buildSnapshotObject([...path.node.params, expr]),
          t.stringLiteral(file),
          t.numericLiteral(line),
        ])
      ),
      t.returnStatement(t.cloneNode(tempId)),
    ]);
  } else {
    instrumentFunction(path as any, state);
  }
}

function instrumentBranch(path: NodePath<t.IfStatement>, state: PluginState) {
  if ((path.node as any)._rsdBranchInstrumented) return;
  (path.node as any)._rsdBranchInstrumented = true;

  const file = getFilename(state);
  const line = path.node.loc?.start.line ?? 0;

  // Extract condition source
  const condSource = extractConditionSource(path.node.test);

  // Extract condition parts for debugging
  const condParts = extractConditionParts(path.node.test);

  // Save original condition
  const originalTest = path.node.test;

  // Replace condition with: (__rsd.branch(condSource, (originalTest), condParts, file, line))
  const tempId = path.scope.generateUidIdentifier('cond');

  // Insert before: const _cond = originalTest; __rsd.branch(...)
  const condDecl = t.variableDeclaration('const', [
    t.variableDeclarator(tempId, t.cloneNode(originalTest)),
  ]);

  const branchCall = t.expressionStatement(
    buildRuntimeMethodCall('branch', [
      t.stringLiteral(condSource),
      t.cloneNode(tempId),
      condParts,
      t.stringLiteral(file),
      t.numericLiteral(line),
    ])
  );

  // Replace the test with the temp variable
  path.node.test = t.cloneNode(tempId);

  // Insert declarations before the if statement
  path.insertBefore(condDecl);
  path.insertBefore(branchCall);
}

function extractConditionSource(test: t.Expression): string {
  if (t.isBinaryExpression(test)) {
    return `${exprToString(test.left)} ${test.operator} ${exprToString(test.right)}`;
  }
  if (t.isUnaryExpression(test)) {
    return `${test.operator}${exprToString(test.argument)}`;
  }
  if (t.isLogicalExpression(test)) {
    return `${exprToString(test.left)} ${test.operator} ${exprToString(test.right)}`;
  }
  return exprToString(test);
}

function exprToString(node: t.Node): string {
  if (t.isIdentifier(node)) return node.name;
  if (t.isMemberExpression(node)) {
    const obj = exprToString(node.object);
    const prop = t.isIdentifier(node.property) ? node.property.name : '?';
    return `${obj}.${prop}`;
  }
  if (t.isCallExpression(node)) return `${exprToString(node.callee)}()`;
  if (t.isStringLiteral(node)) return `"${node.value}"`;
  if (t.isNumericLiteral(node)) return String(node.value);
  if (t.isBooleanLiteral(node)) return String(node.value);
  if (t.isNullLiteral(node)) return 'null';
  return node.type;
}

function extractConditionParts(test: t.Expression): t.ObjectExpression {
  const parts: t.ObjectProperty[] = [];

  function collect(node: t.Expression) {
    if (t.isIdentifier(node)) {
      parts.push(t.objectProperty(t.stringLiteral(node.name), node, false, false));
    } else if (t.isMemberExpression(node)) {
      const key = exprToString(node);
      parts.push(t.objectProperty(t.stringLiteral(key), t.cloneNode(node)));
    } else if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) {
      collect(node.left as t.Expression);
      collect(node.right as t.Expression);
    } else if (t.isUnaryExpression(node)) {
      collect(node.argument as t.Expression);
    }
  }

  collect(test);
  return t.objectExpression(parts);
}

function instrumentAwait(path: NodePath<t.AwaitExpression>, state: PluginState) {
  if ((path.node as any)._rsdAwaitInstrumented) return;
  (path.node as any)._rsdAwaitInstrumented = true;

  const file = getFilename(state);
  const line = path.node.loc?.start.line ?? 0;
  const argSource = exprToString(path.node.argument);

  // Replace: await expr
  // With: (__rsd.awaitStart(desc, file, line), await expr.then(r => (__rsd.awaitEnd(desc, file, line), r)))
  // Simplified: keep original await, wrap with start/end

  const startCall = t.callExpression(
    t.memberExpression(t.callExpression(t.identifier('__rsd'), []), t.identifier('awaitStart')),
    [t.stringLiteral(argSource), buildSnapshotObject([path.node.argument]), t.stringLiteral(file), t.numericLiteral(line)]
  );

  const endCall = t.callExpression(
    t.memberExpression(t.callExpression(t.identifier('__rsd'), []), t.identifier('awaitEnd')),
    [t.stringLiteral(argSource), buildSnapshotObject([path.node.argument]), t.stringLiteral(file), t.numericLiteral(line)]
  );

  // Wrap: (startCall, await expr) then endCall
  const awaitResult = path.scope.generateUidIdentifier('awaitResult');

  // We need to handle this at the statement level
  const stmtParent = path.getStatementParent();
  if (!stmtParent) return;

  stmtParent.insertBefore(t.expressionStatement(startCall));

  // Insert end call after the statement
  // This is tricky with await — use a simpler approach:
  // Just add awaitEnd after the containing statement
  stmtParent.insertAfter(t.expressionStatement(endCall));
}

const SIDE_EFFECT_PATTERNS: Record<string, { type: string; descFn: (callee: string) => string }> = {
  'console.log': { type: 'log', descFn: (c) => `Logged to console` },
  'console.warn': { type: 'log', descFn: (c) => `Warning logged to console` },
  'console.error': { type: 'log', descFn: (c) => `Error logged to console` },
  'fetch': { type: 'http-call', descFn: (c) => `HTTP request via fetch` },
  'emit': { type: 'event-emit', descFn: (c) => `Event emitted` },
};

function instrumentSideEffect(path: NodePath<t.CallExpression>, state: PluginState) {
  if ((path.node as any)._rsdSideEffectInstrumented) return;

  const callee = path.node.callee;
  let calleeName = '';

  if (t.isIdentifier(callee)) {
    calleeName = callee.name;
  } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
    if (t.isIdentifier(callee.object)) {
      calleeName = `${callee.object.name}.${callee.property.name}`;
    } else {
      calleeName = callee.property.name;
    }
  }

  // Check if it matches known side-effect patterns
  const pattern = SIDE_EFFECT_PATTERNS[calleeName];
  if (!pattern) {
    // Also check common patterns: *.save(), *.update(), *.delete(), *.write(), *.send(), *.emit()
    const methodName = t.isMemberExpression(callee) && t.isIdentifier(callee.property) ? callee.property.name : '';
    const sideEffectMethods: Record<string, string> = {
      save: 'db-write',
      update: 'db-write',
      delete: 'db-write',
      insert: 'db-write',
      create: 'db-write',
      write: 'file-write',
      writeFile: 'file-write',
      send: 'notification',
      sendEmail: 'notification',
      emit: 'event-emit',
      dispatch: 'event-emit',
      publish: 'event-emit',
      fetch: 'http-call',
      request: 'http-call',
    };

    if (sideEffectMethods[methodName]) {
      (path.node as any)._rsdSideEffectInstrumented = true;
      const file = getFilename(state);
      const line = path.node.loc?.start.line ?? 0;

      const stmtParent = path.getStatementParent();
  if (stmtParent) {
    stmtParent.insertBefore(
          t.expressionStatement(
            buildRuntimeMethodCall('sideEffect', [
              t.stringLiteral(sideEffectMethods[methodName]),
              t.stringLiteral(`${calleeName || methodName}() called`),
              buildArgumentSnapshot(path.node.arguments),
              t.stringLiteral(file),
              t.numericLiteral(line),
            ])
          )
        );
      }
    }
    return;
  }

  (path.node as any)._rsdSideEffectInstrumented = true;
  const file = getFilename(state);
  const line = path.node.loc?.start.line ?? 0;

  const stmtParent = path.getStatementParent();
  if (stmtParent) {
    stmtParent.insertBefore(
      t.expressionStatement(
          buildRuntimeMethodCall('sideEffect', [
            t.stringLiteral(pattern.type),
            t.stringLiteral(pattern.descFn(calleeName)),
            buildArgumentSnapshot(path.node.arguments),
            t.stringLiteral(file),
            t.numericLiteral(line),
          ])
        )
    );
  }
}

export { rsdBabelPlugin };
