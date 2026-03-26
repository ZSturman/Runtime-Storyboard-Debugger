import { AsyncLocalStorage } from 'async_hooks';
import type { TraceEvent, TraceEventType } from '../storyboard/types';

interface TraceContext {
  events: TraceEvent[];
  depth: number;
  asyncContextId: string;
  startTime: number;
}

let eventCounter = 0;
const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

function nextEventId(): string {
  return `te_${++eventCounter}`;
}

function generateContextId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getContext(): TraceContext | undefined {
  return asyncLocalStorage.getStore();
}

function addEvent(type: TraceEventType, data: Partial<TraceEvent>): void {
  const ctx = getContext();
  if (!ctx) return;

  const event: TraceEvent = {
    id: nextEventId(),
    type,
    timestamp: Date.now() - ctx.startTime,
    functionName: data.functionName || '',
    file: data.file || '',
    line: data.line || 0,
    column: data.column,
    depth: ctx.depth,
    asyncContextId: ctx.asyncContextId,
    args: data.args,
    returnValue: data.returnValue,
    errorMessage: data.errorMessage,
    conditionSource: data.conditionSource,
    conditionResult: data.conditionResult,
    conditionParts: data.conditionParts,
    sideEffectType: data.sideEffectType,
    sideEffectDescription: data.sideEffectDescription,
    sideEffectData: data.sideEffectData,
  };

  ctx.events.push(event);
}

// ─── Public API (injected into instrumented code as __rsd) ──────

function enter(functionName: string, args: Record<string, unknown>, file: string, line: number): void {
  const ctx = getContext();
  if (!ctx) return;
  ctx.depth++;
  addEvent('function-enter', { functionName, file, line, args });
}

function exit(functionName: string, returnValue: unknown, file: string, line: number): void {
  const ctx = getContext();
  if (!ctx) return;
  addEvent('function-exit', {
    functionName,
    file,
    line,
    returnValue: safeSerialize(returnValue),
  });
  ctx.depth--;
}

function branch(
  conditionSource: string,
  conditionResult: unknown,
  conditionParts: Record<string, unknown>,
  file: string,
  line: number
): void {
  addEvent('branch', {
    functionName: '',
    file,
    line,
    conditionSource,
    conditionResult: Boolean(conditionResult),
    conditionParts: safeSerializeParts(conditionParts),
  });
}

function awaitStart(description: string, file: string, line: number): void {
  addEvent('await-start', {
    functionName: description,
    file,
    line,
  });
}

function awaitEnd(description: string, file: string, line: number): void {
  addEvent('await-end', {
    functionName: description,
    file,
    line,
  });
}

function sideEffect(type: string, description: string, file: string, line: number): void {
  addEvent('side-effect', {
    functionName: '',
    file,
    line,
    sideEffectType: type as TraceEvent['sideEffectType'],
    sideEffectDescription: description,
  });
}

function safeSerialize(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'bigint') return value.toString();
  try {
    const str = JSON.stringify(value);
    // Limit serialized size
    if (str.length > 2048) return JSON.parse(str.slice(0, 2048) + '..."');
    return JSON.parse(str);
  } catch {
    return String(value);
  }
}

function safeSerializeParts(parts: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(parts)) {
    result[key] = safeSerialize(val);
  }
  return result;
}

// ─── Trace Execution API ────────────────────────────────────────

export interface TraceResult {
  events: TraceEvent[];
  duration: number;
  asyncContextId: string;
}

/**
 * Execute a function within a trace context, capturing all instrumented events.
 */
export function runWithTrace(fn: () => unknown | Promise<unknown>): Promise<TraceResult> {
  return new Promise((resolve, reject) => {
    eventCounter = 0;
    const context: TraceContext = {
      events: [],
      depth: 0,
      asyncContextId: generateContextId(),
      startTime: Date.now(),
    };

    asyncLocalStorage.run(context, async () => {
      try {
        await fn();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        addEvent('error', {
          functionName: '',
          file: '',
          line: 0,
          errorMessage: message,
        });
      }

      // Allow async continuations to settle
      await new Promise((r) => setTimeout(r, 100));

      resolve({
        events: context.events,
        duration: Date.now() - context.startTime,
        asyncContextId: context.asyncContextId,
      });
    });
  });
}

/**
 * Create the __rsd runtime object for injection into instrumented code.
 */
export function createRuntime() {
  return { enter, exit, branch, awaitStart, awaitEnd, sideEffect };
}

/**
 * Install the runtime globally so instrumented code can access it.
 */
export function installGlobalRuntime(): void {
  (global as any).__rsd_runtime = () => createRuntime();
  (global as any).__rsd = createRuntime();
}

/**
 * Uninstall the global runtime.
 */
export function uninstallGlobalRuntime(): void {
  delete (global as any).__rsd_runtime;
  delete (global as any).__rsd;
}
