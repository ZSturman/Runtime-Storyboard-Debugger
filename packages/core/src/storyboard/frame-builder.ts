import type {
  TraceEvent,
  StoryboardFrame,
  Storyboard,
  EntryPoint,
  FrameType,
  SideEffect,
  SideEffectType,
  BranchInfo,
} from './types';

let frameCounter = 0;

function nextFrameId(): string {
  return `sf_${++frameCounter}`;
}

/**
 * Convert raw TraceEvent[] into a linked sequence of StoryboardFrame[].
 *
 * Strategy:
 * - function-enter events create new frames
 * - branch events attach BranchInfo to the most recent frame
 * - side-effect events attach SideEffect to the most recent frame
 * - await events create async-boundary frames
 * - function-exit events close the current frame and record return value
 * - error events create error frames
 */
export function buildFrames(events: TraceEvent[]): StoryboardFrame[] {
  frameCounter = 0;
  const frames: StoryboardFrame[] = [];
  const frameStack: StoryboardFrame[] = [];
  let sequence = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    switch (event.type) {
      case 'function-enter': {
        const frame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'function-entry',
          title: '',
          description: '',
          functionName: event.functionName,
          file: event.file,
          line: event.line,
          column: event.column,
          inputs: event.args || {},
          state: {},
          sideEffects: [],
          depth: event.depth,
          timestampMs: event.timestamp,
          variables: event.args || {},
          rawEventIds: [event.id],
        };
        frames.push(frame);

        // Link previous frame to this one
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = frame.id;
        }

        frameStack.push(frame);
        break;
      }

      case 'function-exit': {
        const currentFrame = frameStack.pop();
        if (currentFrame) {
          // If exit has a return value, create a return frame
          if (event.returnValue !== undefined) {
            const retFrame: StoryboardFrame = {
              id: nextFrameId(),
              sequence: sequence++,
              type: 'return',
              title: '',
              description: '',
              functionName: event.functionName,
              file: event.file,
              line: event.line,
              inputs: {},
              state: {},
              sideEffects: [],
              returnValue: event.returnValue,
              depth: event.depth,
              timestampMs: event.timestamp,
              rawEventIds: [event.id],
            };
            frames.push(retFrame);
            currentFrame.nextFrameId = retFrame.id;
          }
        }
        break;
      }

      case 'status': {
        const statusFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'status',
          title: '',
          description: '',
          functionName: event.functionName || 'execution',
          file: event.file,
          line: event.line,
          inputs: {},
          state: {},
          sideEffects: [],
          depth: event.depth,
          timestampMs: event.timestamp,
          statusLabel: event.statusLabel,
          rawEventIds: [event.id],
        };
        frames.push(statusFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = statusFrame.id;
        }
        break;
      }

      case 'branch': {
        const branchFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'branch',
          title: '',
          description: '',
          functionName: event.functionName || lastFunctionName(frameStack),
          file: event.file,
          line: event.line,
          inputs: {},
          state: event.conditionParts || {},
          sideEffects: [],
          depth: event.depth,
          timestampMs: event.timestamp,
          variables: event.conditionParts || {},
          rawEventIds: [event.id],
          branch: {
            conditionSource: event.conditionSource || '',
            conditionValues: event.conditionParts || {},
            taken: event.conditionResult ?? true,
            explanation: '',
            options: [
              {
                id: `${event.id}_taken`,
                label: 'Taken path',
                description: 'This was the branch chosen in the current run.',
                taken: true,
              },
              {
                id: `${event.id}_alternate`,
                label: 'Alternate path',
                description: 'Preview the other possible route from this decision.',
                taken: false,
              },
            ],
          },
        };

        frames.push(branchFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = branchFrame.id;
        }
        break;
      }

      case 'await-start': {
        const awaitFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'await-boundary',
          title: '',
          description: '',
          functionName: event.functionName,
          file: event.file,
          line: event.line,
          inputs: {},
          state: {},
          sideEffects: [],
          depth: event.depth,
          timestampMs: event.timestamp,
          waitInfo: {
            description: event.functionName,
            status: 'started',
          },
          rawEventIds: [event.id],
        };
        frames.push(awaitFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = awaitFrame.id;
        }
        break;
      }

      case 'await-end': {
        // Find the matching await-start and link as continuation
        for (let j = frames.length - 1; j >= 0; j--) {
          if (frames[j].type === 'await-boundary' && !frames[j].asyncContinuationId) {
            const contFrame: StoryboardFrame = {
              id: nextFrameId(),
              sequence: sequence++,
              type: 'async-handoff',
              title: '',
              description: '',
              functionName: event.functionName,
              file: event.file,
              line: event.line,
              inputs: {},
              state: {},
              sideEffects: [],
              depth: event.depth,
              timestampMs: event.timestamp,
              waitInfo: {
                description: event.functionName,
                status: 'completed',
              },
              rawEventIds: [event.id],
            };
            frames.push(contFrame);
            frames[j].asyncContinuationId = contFrame.id;
            if (frames.length > 1) {
              frames[frames.length - 2].nextFrameId = contFrame.id;
            }
            break;
          }
        }
        break;
      }

      case 'side-effect': {
        const se: SideEffect = {
          type: (event.sideEffectType as SideEffectType) || 'unknown',
          description: event.sideEffectDescription || 'Unknown side effect',
          data: event.sideEffectData,
        };

        // Attach to current frame if exists, otherwise create standalone
        const currentFrame = frameStack.length > 0 ? frameStack[frameStack.length - 1] : null;
        if (currentFrame) {
          currentFrame.sideEffects.push(se);
        }

        const seFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'side-effect',
          title: '',
          description: '',
          functionName: lastFunctionName(frameStack),
          file: event.file,
          line: event.line,
          inputs: {},
          state: {},
          sideEffects: [se],
          depth: event.depth,
          timestampMs: event.timestamp,
          variables: typeof event.sideEffectData === 'object' && event.sideEffectData !== null
            ? event.sideEffectData as Record<string, unknown>
            : undefined,
          rawEventIds: [event.id],
        };
        frames.push(seFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = seFrame.id;
        }
        break;
      }

      case 'state-snapshot': {
        const snapshotFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'state-snapshot',
          title: '',
          description: '',
          functionName: event.functionName || lastFunctionName(frameStack),
          file: event.file,
          line: event.line,
          inputs: {},
          state: event.snapshotValues || {},
          sideEffects: [],
          depth: event.depth,
          timestampMs: event.timestamp,
          snapshotLabel: event.snapshotLabel,
          variables: event.snapshotValues || {},
          rawEventIds: [event.id],
        };
        frames.push(snapshotFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = snapshotFrame.id;
        }
        break;
      }

      case 'stdout':
      case 'stderr': {
        const logFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'log',
          title: '',
          description: '',
          functionName: event.functionName || 'console',
          file: event.file,
          line: event.line,
          inputs: {},
          state: event.message ? { message: event.message } : {},
          sideEffects: [],
          depth: event.depth,
          timestampMs: event.timestamp,
          statusLabel: event.type === 'stderr' ? 'stderr' : 'stdout',
          rawEventIds: [event.id],
        };
        frames.push(logFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = logFrame.id;
        }
        break;
      }

      case 'error': {
        const errFrame: StoryboardFrame = {
          id: nextFrameId(),
          sequence: sequence++,
          type: 'error',
          title: '',
          description: '',
          functionName: lastFunctionName(frameStack),
          file: event.file,
          line: event.line,
          inputs: {},
          state: {},
          sideEffects: [],
          errorMessage: event.errorMessage,
          depth: event.depth,
          timestampMs: event.timestamp,
          rawEventIds: [event.id],
        };
        frames.push(errFrame);
        if (frames.length > 1) {
          frames[frames.length - 2].nextFrameId = errFrame.id;
        }
        break;
      }
    }
  }

  return frames.map((frame, index) => ({
    ...frame,
    previousFrameId: index > 0 ? frames[index - 1].id : undefined,
  }));
}

function lastFunctionName(stack: StoryboardFrame[]): string {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].functionName) return stack[i].functionName;
  }
  return '<unknown>';
}

/**
 * Build a complete Storyboard from trace events and an entry point.
 */
export function buildStoryboard(
  events: TraceEvent[],
  entryPoint: EntryPoint,
  scenarioName?: string
): Storyboard {
  const { narrate } = require('./narrator');

  const frames = buildFrames(events);
  const narratedFrames = frames.map((f) => narrate(f));

  const startTime = events.length > 0 ? events[0].timestamp : 0;
  const endTime = events.length > 0 ? events[events.length - 1].timestamp : 0;

  return {
    id: `sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryPoint,
    frames: narratedFrames,
    metadata: {
      startTime,
      endTime,
      totalFrames: narratedFrames.length,
      scenarioName,
      entryPointId: entryPoint.id,
    },
  };
}
