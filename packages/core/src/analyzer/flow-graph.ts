import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import type { FlowGraph, FlowNode, FlowNodeType } from '../storyboard/types';

let nodeCounter = 0;

function nextNodeId(): string {
  return `fn_${++nodeCounter}`;
}

function createNode(type: FlowNodeType, label: string, file: string, line: number): FlowNode {
  return {
    id: nextNodeId(),
    type,
    label,
    file,
    line,
    children: [],
    findings: [],
  };
}

/**
 * Build a simplified control flow graph from a function body.
 * This is a static analysis pass — it shows what *could* happen.
 */
function buildFlowFromBody(
  body: t.Statement[],
  file: string,
  parentNode: FlowNode,
  nodes: Record<string, FlowNode>
): void {
  for (const stmt of body) {
    if (t.isIfStatement(stmt)) {
      const condText = stmt.test.type === 'BinaryExpression'
        ? `${formatExpression(stmt.test.left)} ${stmt.test.operator} ${formatExpression(stmt.test.right)}`
        : formatExpression(stmt.test);

      const branchNode = createNode('branch', condText, file, stmt.loc?.start.line ?? 0);
      branchNode.condition = condText;
      nodes[branchNode.id] = branchNode;
      parentNode.children.push(branchNode.id);

      // True branch
      const trueNode = createNode('function-call', 'then', file, stmt.consequent.loc?.start.line ?? 0);
      nodes[trueNode.id] = trueNode;
      branchNode.branchTrue = trueNode.id;
      branchNode.children.push(trueNode.id);
      const trueBody = t.isBlockStatement(stmt.consequent) ? stmt.consequent.body : [stmt.consequent];
      buildFlowFromBody(trueBody, file, trueNode, nodes);

      // False branch
      if (stmt.alternate) {
        const falseNode = createNode('function-call', 'else', file, stmt.alternate.loc?.start.line ?? 0);
        nodes[falseNode.id] = falseNode;
        branchNode.branchFalse = falseNode.id;
        branchNode.children.push(falseNode.id);
        const falseBody = t.isBlockStatement(stmt.alternate) ? stmt.alternate.body : [stmt.alternate];
        buildFlowFromBody(falseBody, file, falseNode, nodes);
      }

      parentNode = branchNode;
    } else if (t.isReturnStatement(stmt)) {
      const retNode = createNode('return', 'return', file, stmt.loc?.start.line ?? 0);
      nodes[retNode.id] = retNode;
      parentNode.children.push(retNode.id);
    } else if (t.isThrowStatement(stmt)) {
      const throwNode = createNode('throw', 'throw', file, stmt.loc?.start.line ?? 0);
      nodes[throwNode.id] = throwNode;
      parentNode.children.push(throwNode.id);
    } else if (t.isExpressionStatement(stmt)) {
      if (t.isAwaitExpression(stmt.expression)) {
        const awaitNode = createNode('await', `await ${formatExpression(stmt.expression.argument)}`, file, stmt.loc?.start.line ?? 0);
        nodes[awaitNode.id] = awaitNode;
        parentNode.children.push(awaitNode.id);
        parentNode = awaitNode;
      } else if (t.isCallExpression(stmt.expression)) {
        const callLabel = formatExpression(stmt.expression.callee);
        const callNode = createNode('function-call', callLabel, file, stmt.loc?.start.line ?? 0);
        nodes[callNode.id] = callNode;
        parentNode.children.push(callNode.id);
        parentNode = callNode;
      }
    } else if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (decl.init && t.isAwaitExpression(decl.init)) {
          const label = `await ${formatExpression(decl.init.argument)}`;
          const awaitNode = createNode('await', label, file, stmt.loc?.start.line ?? 0);
          nodes[awaitNode.id] = awaitNode;
          parentNode.children.push(awaitNode.id);
          parentNode = awaitNode;
        } else if (decl.init && t.isCallExpression(decl.init)) {
          const callLabel = formatExpression(decl.init.callee);
          const callNode = createNode('function-call', callLabel, file, stmt.loc?.start.line ?? 0);
          nodes[callNode.id] = callNode;
          parentNode.children.push(callNode.id);
          parentNode = callNode;
        }
      }
    } else if (t.isTryStatement(stmt)) {
      const tryNode = createNode('function-call', 'try', file, stmt.loc?.start.line ?? 0);
      nodes[tryNode.id] = tryNode;
      parentNode.children.push(tryNode.id);
      buildFlowFromBody(stmt.block.body, file, tryNode, nodes);

      if (stmt.handler) {
        const catchNode = createNode('function-call', 'catch', file, stmt.handler.loc?.start.line ?? 0);
        nodes[catchNode.id] = catchNode;
        parentNode.children.push(catchNode.id);
        buildFlowFromBody(stmt.handler.body.body, file, catchNode, nodes);
      }
      parentNode = tryNode;
    } else if (t.isForStatement(stmt) || t.isForOfStatement(stmt) || t.isForInStatement(stmt) || t.isWhileStatement(stmt)) {
      const loopNode = createNode('loop', 'loop', file, stmt.loc?.start.line ?? 0);
      nodes[loopNode.id] = loopNode;
      parentNode.children.push(loopNode.id);
      if (t.isBlockStatement(stmt.body)) {
        buildFlowFromBody(stmt.body.body, file, loopNode, nodes);
      }
      parentNode = loopNode;
    }
  }
}

function formatExpression(expr: t.Node): string {
  if (t.isIdentifier(expr)) return expr.name;
  if (t.isMemberExpression(expr)) {
    const obj = formatExpression(expr.object);
    const prop = t.isIdentifier(expr.property) ? expr.property.name : '?';
    return `${obj}.${prop}`;
  }
  if (t.isCallExpression(expr)) {
    return `${formatExpression(expr.callee)}()`;
  }
  if (t.isStringLiteral(expr)) return `"${expr.value}"`;
  if (t.isNumericLiteral(expr)) return String(expr.value);
  if (t.isBooleanLiteral(expr)) return String(expr.value);
  if (t.isUnaryExpression(expr)) return `${expr.operator}${formatExpression(expr.argument)}`;
  if (t.isBinaryExpression(expr)) {
    return `${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)}`;
  }
  if (t.isTemplateLiteral(expr)) return '`template`';
  return expr.type;
}

/**
 * Build a FlowGraph for a specific function in a file
 */
export function buildFlowGraph(filePath: string, functionName: string, targetDir: string): FlowGraph | null {
  nodeCounter = 0;
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(targetDir, filePath);

  if (!fs.existsSync(fullPath)) return null;

  const code = fs.readFileSync(fullPath, 'utf-8');
  let ast: t.File;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties'],
      sourceFilename: filePath,
    });
  } catch {
    return null;
  }

  const relFile = path.relative(targetDir, fullPath);
  const nodes: Record<string, FlowNode> = {};

  let foundBody: t.Statement[] | null = null;
  let foundLine = 0;

  traverse(ast, {
    FunctionDeclaration(nodePath) {
      if (nodePath.node.id?.name === functionName) {
        foundBody = nodePath.node.body.body;
        foundLine = nodePath.node.loc?.start.line ?? 0;
        nodePath.stop();
      }
    },
    VariableDeclarator(nodePath) {
      if (
        t.isIdentifier(nodePath.node.id) &&
        nodePath.node.id.name === functionName &&
        (t.isArrowFunctionExpression(nodePath.node.init) || t.isFunctionExpression(nodePath.node.init))
      ) {
        const fn = nodePath.node.init;
        if (t.isBlockStatement(fn.body)) {
          foundBody = fn.body.body;
          foundLine = fn.loc?.start.line ?? 0;
        }
        nodePath.stop();
      }
    },
  });

  if (!foundBody) return null;

  const entryNode = createNode('entry', functionName, relFile, foundLine);
  nodes[entryNode.id] = entryNode;
  buildFlowFromBody(foundBody, relFile, entryNode, nodes);

  return {
    entryPointId: '',
    nodes,
    rootNodeId: entryNode.id,
    findings: [],
  };
}

/**
 * Build a FlowGraph from source code string (for testing)
 */
export function buildFlowGraphFromSource(code: string, functionName: string, filename: string = 'test.ts'): FlowGraph | null {
  nodeCounter = 0;
  let ast: t.File;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      sourceFilename: filename,
    });
  } catch {
    return null;
  }

  const nodes: Record<string, FlowNode> = {};
  let foundBody: t.Statement[] | null = null;
  let foundLine = 0;

  traverse(ast, {
    FunctionDeclaration(nodePath) {
      if (nodePath.node.id?.name === functionName) {
        foundBody = nodePath.node.body.body;
        foundLine = nodePath.node.loc?.start.line ?? 0;
        nodePath.stop();
      }
    },
    VariableDeclarator(nodePath) {
      if (
        t.isIdentifier(nodePath.node.id) &&
        nodePath.node.id.name === functionName
      ) {
        const init = nodePath.node.init;
        if ((t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) && t.isBlockStatement(init.body)) {
          foundBody = init.body.body;
          foundLine = init.loc?.start.line ?? 0;
        }
        nodePath.stop();
      }
    },
  });

  if (!foundBody) return null;

  const entryNode = createNode('entry', functionName, filename, foundLine);
  nodes[entryNode.id] = entryNode;
  buildFlowFromBody(foundBody, filename, entryNode, nodes);

  return {
    entryPointId: '',
    nodes,
    rootNodeId: entryNode.id,
    findings: [],
  };
}
