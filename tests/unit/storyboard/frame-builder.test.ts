import { describe, it, expect } from 'vitest';
import { buildFrames } from '../../../packages/core/src/storyboard/frame-builder';
import { narrate } from '../../../packages/core/src/storyboard/narrator';
import type { TraceEvent } from '../../../packages/core/src/storyboard/types';

function makeEvent(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    id: `te_${Math.random().toString(36).slice(2)}`,
    type: 'function-enter',
    timestamp: Date.now(),
    functionName: 'testFn',
    file: 'test.ts',
    line: 1,
    depth: 0,
    asyncContextId: 'ctx_test',
    ...overrides,
  };
}

describe('Frame Builder', () => {
  it('creates frames from function enter events', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'createOrder', args: { items: [] } }),
      makeEvent({ type: 'function-exit', functionName: 'createOrder', returnValue: { success: true } }),
    ];

    const frames = buildFrames(events);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0].type).toBe('function-entry');
    expect(frames[0].functionName).toBe('createOrder');
  });

  it('creates return frames with return values', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'calc' }),
      makeEvent({ type: 'function-exit', functionName: 'calc', returnValue: 42 }),
    ];

    const frames = buildFrames(events);
    const returnFrame = frames.find((f) => f.type === 'return');
    expect(returnFrame).toBeDefined();
    expect(returnFrame!.returnValue).toBe(42);
  });

  it('creates branch frames with condition info', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'decide' }),
      makeEvent({
        type: 'branch',
        conditionSource: 'total > 100',
        conditionResult: true,
        conditionParts: { total: 150 },
      }),
      makeEvent({ type: 'function-exit', functionName: 'decide' }),
    ];

    const frames = buildFrames(events);
    const branchFrame = frames.find((f) => f.type === 'branch');
    expect(branchFrame).toBeDefined();
    expect(branchFrame!.branch).toBeDefined();
    expect(branchFrame!.branch!.conditionSource).toBe('total > 100');
    expect(branchFrame!.branch!.taken).toBe(true);
    expect(branchFrame!.branch!.conditionValues).toEqual({ total: 150 });
  });

  it('creates side-effect frames', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'process' }),
      makeEvent({
        type: 'side-effect',
        sideEffectType: 'db-write',
        sideEffectDescription: 'Updated inventory',
      }),
      makeEvent({ type: 'function-exit', functionName: 'process' }),
    ];

    const frames = buildFrames(events);
    const seFrame = frames.find((f) => f.type === 'side-effect');
    expect(seFrame).toBeDefined();
    expect(seFrame!.sideEffects).toHaveLength(1);
    expect(seFrame!.sideEffects[0].type).toBe('db-write');
  });

  it('creates error frames', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'risky' }),
      makeEvent({ type: 'error', errorMessage: 'something went wrong' }),
    ];

    const frames = buildFrames(events);
    const errFrame = frames.find((f) => f.type === 'error');
    expect(errFrame).toBeDefined();
    expect(errFrame!.errorMessage).toBe('something went wrong');
  });

  it('creates async boundary and handoff frames', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'fetchData' }),
      makeEvent({ type: 'await-start', functionName: 'fetch()' }),
      makeEvent({ type: 'await-end', functionName: 'fetch()' }),
      makeEvent({ type: 'function-exit', functionName: 'fetchData' }),
    ];

    const frames = buildFrames(events);
    const awaitFrame = frames.find((f) => f.type === 'await-boundary');
    expect(awaitFrame).toBeDefined();

    const handoffFrame = frames.find((f) => f.type === 'async-handoff');
    expect(handoffFrame).toBeDefined();
    expect(awaitFrame!.asyncContinuationId).toBe(handoffFrame!.id);
  });

  it('links frames with nextFrameId', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'a', timestamp: 1 }),
      makeEvent({ type: 'function-enter', functionName: 'b', timestamp: 2 }),
      makeEvent({ type: 'function-exit', functionName: 'b', timestamp: 3 }),
      makeEvent({ type: 'function-exit', functionName: 'a', timestamp: 4 }),
    ];

    const frames = buildFrames(events);
    expect(frames[0].nextFrameId).toBe(frames[1].id);
  });

  it('assigns sequential sequence numbers', () => {
    const events: TraceEvent[] = [
      makeEvent({ type: 'function-enter', functionName: 'a' }),
      makeEvent({ type: 'function-enter', functionName: 'b' }),
      makeEvent({ type: 'function-exit', functionName: 'b' }),
      makeEvent({ type: 'function-exit', functionName: 'a' }),
    ];

    const frames = buildFrames(events);
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].sequence).toBe(i);
    }
  });
});

describe('Narrator', () => {
  it('generates title for function entry frames', () => {
    const frames = buildFrames([
      makeEvent({ type: 'function-enter', functionName: 'processOrder', args: { items: [1] } }),
      makeEvent({ type: 'function-exit', functionName: 'processOrder' }),
    ]);

    const narrated = narrate(frames[0]);
    expect(narrated.title).toContain('processOrder');
    expect(narrated.description).toContain('processOrder');
  });

  it('generates branch explanations with values', () => {
    const frames = buildFrames([
      makeEvent({ type: 'function-enter', functionName: 'check' }),
      makeEvent({
        type: 'branch',
        conditionSource: 'total > 100',
        conditionResult: true,
        conditionParts: { total: 150 },
      }),
      makeEvent({ type: 'function-exit', functionName: 'check' }),
    ]);

    const branchFrame = frames.find((f) => f.type === 'branch')!;
    const narrated = narrate(branchFrame);
    expect(narrated.branch!.explanation).toContain('total');
    expect(narrated.branch!.explanation).toContain('150');
    expect(narrated.branch!.explanation).toContain('true');
  });

  it('generates error descriptions', () => {
    const frames = buildFrames([
      makeEvent({ type: 'error', errorMessage: 'validation failed' }),
    ]);

    const narrated = narrate(frames[0]);
    expect(narrated.title).toContain('Error');
    expect(narrated.description).toContain('validation failed');
  });

  it('generates return descriptions with value', () => {
    const frames = buildFrames([
      makeEvent({ type: 'function-enter', functionName: 'compute' }),
      makeEvent({ type: 'function-exit', functionName: 'compute', returnValue: 42 }),
    ]);

    const returnFrame = frames.find((f) => f.type === 'return')!;
    const narrated = narrate(returnFrame);
    expect(narrated.title).toContain('returns');
    expect(narrated.description).toContain('42');
  });

  it('generates side effect descriptions', () => {
    const frames = buildFrames([
      makeEvent({ type: 'function-enter', functionName: 'save' }),
      makeEvent({
        type: 'side-effect',
        sideEffectType: 'db-write',
        sideEffectDescription: 'Wrote order to database',
      }),
      makeEvent({ type: 'function-exit', functionName: 'save' }),
    ]);

    const seFrame = frames.find((f) => f.type === 'side-effect')!;
    const narrated = narrate(seFrame);
    expect(narrated.title).toContain('Database');
    expect(narrated.description).toContain('Wrote order to database');
  });
});
