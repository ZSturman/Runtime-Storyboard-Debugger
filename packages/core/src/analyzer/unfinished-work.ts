import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { UnfinishedWorkFinding } from '../storyboard/types';

const COMMENT_MARKER_REGEX = /\b(TODO|FIXME|HACK|TBD|placeholder)\b[:\s-]*(.*)$/i;
const NOT_IMPLEMENTED_REGEX = /\b(not implemented|todo|stub|placeholder|pending)\b/i;

let findingCounter = 0;

function nextFindingId(): string {
  return `uw_${++findingCounter}`;
}

function parseFile(code: string, filename: string): t.File | null {
  try {
    return parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties'],
      sourceFilename: filename,
      attachComment: true,
    });
  } catch {
    return null;
  }
}

function markerSeverity(marker: string): UnfinishedWorkFinding['severity'] {
  const normalized = marker.toLowerCase();
  if (normalized === 'fixme' || normalized === 'hack') {
    return 'warning';
  }

  return 'info';
}

function markerKind(marker: string): UnfinishedWorkFinding['kind'] {
  const normalized = marker.toLowerCase();
  if (normalized === 'fixme') return 'fixme';
  if (normalized === 'hack') return 'hack';
  if (normalized === 'tbd') return 'tbd';
  if (normalized === 'placeholder') return 'placeholder';
  return 'todo';
}

function buildFinding(
  kind: UnfinishedWorkFinding['kind'],
  severity: UnfinishedWorkFinding['severity'],
  title: string,
  detail: string,
  file: string,
  line: number,
  symbolName?: string,
): UnfinishedWorkFinding {
  return {
    id: nextFindingId(),
    kind,
    severity,
    title,
    detail,
    file,
    line,
    symbolName,
  };
}

function analyzeComments(code: string, filename: string): UnfinishedWorkFinding[] {
  const findings: UnfinishedWorkFinding[] = [];
  const lines = code.split('\n');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(COMMENT_MARKER_REGEX);
    if (!match) continue;

    const marker = match[1];
    const detail = match[2]?.trim() || `${marker.toUpperCase()} marker`;
    findings.push(
      buildFinding(
        markerKind(marker),
        markerSeverity(marker),
        `${marker.toUpperCase()} noted`,
        detail,
        filename,
        index + 1,
      ),
    );
  }

  return findings;
}

function analyzeAst(code: string, filename: string): UnfinishedWorkFinding[] {
  const ast = parseFile(code, filename);
  if (!ast) {
    return [];
  }

  const findings: UnfinishedWorkFinding[] = [];

  function recordStub(line: number, symbolName: string | undefined, detail: string) {
    findings.push(
      buildFinding(
        'stub',
        'warning',
        symbolName ? `Stubbed function: ${symbolName}` : 'Stubbed function body',
        detail,
        filename,
        line,
        symbolName,
      ),
    );
  }

  function checkFunctionBody(node: t.Function | t.ArrowFunctionExpression, symbolName?: string) {
    if (!t.isBlockStatement(node.body)) {
      return;
    }

    const line = node.loc?.start.line ?? 1;
    if (node.body.body.length === 0) {
      recordStub(line, symbolName, 'Function body is empty and may still need implementation.');
      return;
    }

    if (node.body.body.length !== 1) {
      return;
    }

    const onlyStatement = node.body.body[0];
    if (
      t.isThrowStatement(onlyStatement) &&
      t.isNewExpression(onlyStatement.argument) &&
      t.isIdentifier(onlyStatement.argument.callee) &&
      onlyStatement.argument.callee.name === 'Error'
    ) {
      const [firstArg] = onlyStatement.argument.arguments;
      if (t.isStringLiteral(firstArg) && NOT_IMPLEMENTED_REGEX.test(firstArg.value)) {
        findings.push(
          buildFinding(
            'not-implemented',
            'critical',
            symbolName ? `Not implemented: ${symbolName}` : 'Not implemented',
            firstArg.value,
            filename,
            line,
            symbolName,
          ),
        );
      }
    }
  }

  traverse(ast, {
    FunctionDeclaration(nodePath) {
      checkFunctionBody(nodePath.node, nodePath.node.id?.name);
    },
    VariableDeclarator(nodePath) {
      if (!t.isIdentifier(nodePath.node.id)) {
        return;
      }

      const symbolName = nodePath.node.id.name;
      const init = nodePath.node.init;
      if (init && (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init))) {
        checkFunctionBody(init, symbolName);
      }
    },
    ObjectMethod(nodePath) {
      checkFunctionBody(nodePath.node, t.isIdentifier(nodePath.node.key) ? nodePath.node.key.name : undefined);
    },
  });

  return findings;
}

export function analyzeUnfinishedWorkFromSource(code: string, filename: string = 'test.ts'): UnfinishedWorkFinding[] {
  findingCounter = 0;
  return [...analyzeComments(code, filename), ...analyzeAst(code, filename)];
}

export async function analyzeUnfinishedWork(targetDir: string): Promise<UnfinishedWorkFinding[]> {
  findingCounter = 0;
  const files = await glob('**/*.{ts,js,tsx,jsx}', {
    cwd: targetDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
  });

  const findings: UnfinishedWorkFinding[] = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    const relativeFile = path.relative(targetDir, file);
    findings.push(...analyzeComments(code, relativeFile));
    findings.push(...analyzeAst(code, relativeFile));
  }

  return findings;
}
