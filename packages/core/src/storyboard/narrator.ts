import type { StoryboardFrame } from './types';

/**
 * Generate human-readable title and description for a StoryboardFrame.
 * Uses template-based descriptions — no LLM dependency.
 */
export function narrate(frame: StoryboardFrame): StoryboardFrame {
  const result = { ...frame };

  switch (frame.type) {
    case 'function-entry':
      result.title = `Entering ${frame.functionName}`;
      result.description = buildEntryDescription(frame);
      break;

    case 'return':
      result.title = `${frame.functionName} returns`;
      result.description = buildReturnDescription(frame);
      break;

    case 'branch':
      result.title = `Decision point`;
      result.description = buildBranchDescription(frame);
      break;

    case 'await-boundary':
      result.title = `Awaiting async operation`;
      result.description = `Pausing execution to await ${frame.functionName || 'an async operation'}. Control is yielded until the operation completes.`;
      break;

    case 'async-handoff':
      result.title = `Async continuation`;
      result.description = `Async operation "${frame.functionName || 'unknown'}" has completed. Execution resumes from where it was paused.`;
      break;

    case 'side-effect':
      result.title = buildSideEffectTitle(frame);
      result.description = buildSideEffectDescription(frame);
      break;

    case 'error':
      result.title = `Error occurred`;
      result.description = frame.errorMessage
        ? `Execution stopped due to an error: ${frame.errorMessage}`
        : 'An unexpected error halted execution.';
      break;

    default:
      result.title = frame.type;
      result.description = '';
  }

  // Narrate branch explanation if present
  if (result.branch) {
    result.branch = {
      ...result.branch,
      explanation: buildBranchExplanation(result.branch.conditionSource, result.branch.conditionValues, result.branch.taken),
    };
  }

  return result;
}

function buildEntryDescription(frame: StoryboardFrame): string {
  const inputKeys = Object.keys(frame.inputs);
  if (inputKeys.length === 0) {
    return `Called ${frame.functionName}() with no arguments.`;
  }

  const inputSummary = inputKeys
    .map((key) => `${key}: ${formatValue(frame.inputs[key])}`)
    .join(', ');

  return `Called ${frame.functionName}() with ${inputSummary}.`;
}

function buildReturnDescription(frame: StoryboardFrame): string {
  if (frame.returnValue === undefined) {
    return `${frame.functionName}() completed with no return value.`;
  }
  return `${frame.functionName}() returned ${formatValue(frame.returnValue)}.`;
}

function buildBranchDescription(frame: StoryboardFrame): string {
  if (!frame.branch) return 'A conditional branch was evaluated.';

  const { conditionSource, conditionValues, taken } = frame.branch;
  const explanation = buildBranchExplanation(conditionSource, conditionValues, taken);
  return explanation;
}

function buildBranchExplanation(
  conditionSource: string,
  conditionValues: Record<string, unknown>,
  taken: boolean
): string {
  // Build human-readable explanation from condition source and values
  let explanation = `Evaluated: ${conditionSource}`;

  const valueEntries = Object.entries(conditionValues);
  if (valueEntries.length > 0) {
    const valueParts = valueEntries
      .map(([key, val]) => `${key} = ${formatValue(val)}`)
      .join(', ');
    explanation += ` (where ${valueParts})`;
  }

  explanation += ` → ${taken ? 'true' : 'false'}`;

  if (taken) {
    explanation += '. The condition was met, so the primary branch was taken.';
  } else {
    explanation += '. The condition was not met, so the alternate (else) branch was taken.';
  }

  return explanation;
}

function buildSideEffectTitle(frame: StoryboardFrame): string {
  if (frame.sideEffects.length === 0) return 'Side effect';
  const se = frame.sideEffects[0];
  switch (se.type) {
    case 'db-write': return 'Database write';
    case 'db-read': return 'Database read';
    case 'http-call': return 'HTTP request';
    case 'file-write': return 'File write';
    case 'file-read': return 'File read';
    case 'event-emit': return 'Event emitted';
    case 'log': return 'Console output';
    case 'state-mutation': return 'State mutation';
    case 'notification': return 'Notification sent';
    default: return 'Side effect';
  }
}

function buildSideEffectDescription(frame: StoryboardFrame): string {
  if (frame.sideEffects.length === 0) return 'A side effect occurred.';
  if (frame.sideEffects.length === 1) return frame.sideEffects[0].description;

  return `Multiple side effects occurred:\n${frame.sideEffects.map((se, i) => `${i + 1}. ${se.description}`).join('\n')}`;
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.length > 80) return `"${value.slice(0, 77)}..."`;
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) return `[${value.map(formatValue).join(', ')}]`;
    return `[${value.slice(0, 2).map(formatValue).join(', ')}, ... (${value.length} items)]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return '{}';
    if (keys.length <= 3) {
      const pairs = keys.map((k) => `${k}: ${formatValue((value as Record<string, unknown>)[k])}`);
      return `{ ${pairs.join(', ')} }`;
    }
    return `{ ${keys.slice(0, 2).join(', ')}, ... (${keys.length} keys) }`;
  }
  return String(value);
}
