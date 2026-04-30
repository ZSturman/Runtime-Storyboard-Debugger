import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createWorkspace,
  fetchWorkspaces,
  startExecutionSession,
  subscribeToExecution,
  subscribeToWorkspace,
  ApiError,
  type BranchPathOption,
  type EntryPointInputField,
  type ExecutionSession,
  type StoryboardFrame,
  type WorkspaceSession,
} from './api';
import { PhaseContainer } from './components/PhaseContainer';
import { ConfigureScreen } from './components/ConfigureScreen';
import { KeyboardShortcutSheet } from './components/KeyboardShortcutSheet';
import { OnboardingTour, shouldShowTour } from './components/OnboardingTour';
import { WorkspaceIntakeScreen } from './components/WorkspaceIntakeScreen';
import { WorkspaceLoadingScreen } from './components/WorkspaceLoadingScreen';
import { WorkspaceOverviewScreen } from './components/WorkspaceOverviewScreen';
import { LiveExecutionScreen } from './components/LiveExecutionScreen';

type Phase = 'intake' | 'loading' | 'overview' | 'configure' | 'execute';
type SourceType = 'local-path' | 'github-url';

export default function App() {
  const [phase, setPhase] = useState<Phase>('intake');
  const [technicalDetails, setTechnicalDetails] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('local-path');
  const [sourceValue, setSourceValue] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceSession | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [selectedEntryPointId, setSelectedEntryPointId] = useState<string | null>(null);
  const [draftInputs, setDraftInputs] = useState<Record<string, string | boolean>>({});
  const [flagsText, setFlagsText] = useState('{}');
  const [execution, setExecution] = useState<ExecutionSession | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [rerunContext, setRerunContext] = useState<{ storyboardId?: string; frameId?: string; label: string } | null>(null);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const workspaceUnsubscribeRef = useRef<(() => void) | null>(null);
  const executionUnsubscribeRef = useRef<(() => void) | null>(null);

  const entryPoints = workspace?.entryPoints || [];
  const selectedEntryPoint = useMemo(
    () => entryPoints.find((entryPoint) => entryPoint.id === selectedEntryPointId) || null,
    [entryPoints, selectedEntryPointId],
  );
  const activeFlowGraph = selectedEntryPoint ? workspace?.flowGraphs?.[selectedEntryPoint.id] || null : null;

  useEffect(() => {
    let cancelled = false;

    fetchWorkspaces()
      .then((workspaces) => {
        if (cancelled || workspaces.length === 0) return;
        const next = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setWorkspace(next);
        if (next.status === 'ready') {
          setPhase('overview');
        } else if (next.status === 'running') {
          setPhase('loading');
        }
      })
      .catch(() => {
        // best-effort initial bootstrap
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    workspaceUnsubscribeRef.current?.();
    if (!workspace) return;

    workspaceUnsubscribeRef.current = subscribeToWorkspace(workspace.id, {
      onEvent: (event) => {
        if (event.workspace) {
          setWorkspace(event.workspace);
          if (event.workspace.status === 'ready') {
            setPhase((current) => current === 'loading' ? 'overview' : current);
          }
          if (event.workspace.status === 'failed') {
            setWorkspaceError(event.workspace.errors.at(-1) || 'Workspace analysis failed.');
            setPhase('loading');
          }
        }
        if (event.type === 'error') {
          setWorkspaceError(event.message || 'Workspace analysis failed.');
        }
      },
    });

    return () => {
      workspaceUnsubscribeRef.current?.();
      workspaceUnsubscribeRef.current = null;
    };
  }, [workspace?.id]);

  useEffect(() => {
    if (selectedEntryPoint) {
      setDraftInputs(createDraftInputs(selectedEntryPoint.inputFields));
      setFlagsText('{}');
    }
  }, [selectedEntryPoint?.id]);

  useEffect(() => {
    if (!workspace || !selectedEntryPointId) return;
    if (!workspace.entryPoints.some((entryPoint) => entryPoint.id === selectedEntryPointId)) {
      setSelectedEntryPointId(null);
      setPhase('overview');
    }
  }, [workspace?.updatedAt, selectedEntryPointId]);

  useEffect(() => {
    return () => {
      workspaceUnsubscribeRef.current?.();
      executionUnsubscribeRef.current?.();
    };
  }, []);

  // Global '?' opens shortcut sheet (ignored while typing in inputs).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setShortcutSheetOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Open onboarding tour on first time the user reaches Overview.
  useEffect(() => {
    if (phase === 'overview' && shouldShowTour()) {
      setTourOpen(true);
    }
  }, [phase]);

  async function handleCreateWorkspace() {
    if (!sourceValue.trim()) {
      setWorkspaceError(
        sourceType === 'local-path'
          ? 'Enter a local directory path.'
          : 'Enter a GitHub repository URL such as https://github.com/owner/repo or https://github.com/owner/repo/tree/main.',
      );
      return;
    }

    setWorkspaceError(null);
    setExecution(null);
    setExecutionError(null);
    setSelectedEntryPointId(null);
    setPhase('loading');

    try {
      const nextWorkspace = await createWorkspace(
        sourceType === 'local-path'
          ? { type: 'local-path', path: sourceValue.trim() }
          : { type: 'github-url', url: sourceValue.trim() },
      );

      setWorkspace(nextWorkspace);
    } catch (error) {
      setWorkspaceError(formatApiError(error));
      setPhase('intake');
    }
  }

  function handleOpenWorkspace(entryPointId: string) {
    setSelectedEntryPointId(entryPointId);
    setExecution(null);
    setExecutionError(null);
    setPhase('configure');
  }

  async function handleRunSelected() {
    if (!workspace || !selectedEntryPoint) return;

    setExecutionError(null);

    try {
      const inputs = materializeInputs(selectedEntryPoint.inputFields, draftInputs);
      const flags = parseJsonObject(flagsText, 'Flags');
      const nextExecution = await startExecutionSession(
        workspace.id,
        selectedEntryPoint.id,
        inputs,
        flags,
        rerunContext ? { storyboardId: rerunContext.storyboardId, frameId: rerunContext.frameId } : undefined,
      );

      setExecution(nextExecution);
      setCurrentFrameIndex(0);
      setRerunContext(null);
      setPhase('execute');
      subscribeExecutionSession(workspace.id, nextExecution.id);
    } catch (error) {
      setExecutionError(formatApiError(error));
    }
  }

  function subscribeExecutionSession(workspaceId: string, executionId: string) {
    executionUnsubscribeRef.current?.();
    executionUnsubscribeRef.current = subscribeToExecution(workspaceId, executionId, {
      onEvent: (event) => {
        setExecution((current) => {
          if (!current || current.id !== executionId) return current;

          if (event.type === 'status') {
            return { ...current, status: event.status || current.status };
          }

          if (event.type === 'trace-event' && event.traceEvent) {
            return {
              ...current,
              events: [...current.events, event.traceEvent],
            };
          }

          if (event.type === 'frames' && event.frames) {
            setCurrentFrameIndex((index) => {
              const wasAtEnd = index >= Math.max(0, current.frames.length - 1);
              return wasAtEnd ? Math.max(0, event.frames!.length - 1) : Math.min(index, Math.max(0, event.frames!.length - 1));
            });
            return {
              ...current,
              status: event.status || current.status,
              frames: event.frames,
              currentStepId: event.frames[event.frames.length - 1]?.id,
            };
          }

          if (event.type === 'storyboard' && event.storyboard) {
            setCurrentFrameIndex(Math.max(0, event.storyboard.frames.length - 1));
            return {
              ...current,
              status: 'completed',
              storyboard: event.storyboard,
              storyboardId: event.storyboard.id,
              frames: event.storyboard.frames,
              fallback: event.storyboard.fallback || current.fallback,
              currentStepId: event.storyboard.frames[event.storyboard.frames.length - 1]?.id,
            };
          }

          if (event.type === 'fallback') {
            return {
              ...current,
              status: 'fallback-ready',
              fallback: event.fallback || current.fallback,
            };
          }

          if (event.type === 'error') {
            setExecutionError(event.error || 'Execution failed.');
            return {
              ...current,
              error: event.error,
            };
          }

          return current;
        });
      },
      onError: () => {
        setExecutionError('The live execution stream disconnected.');
      },
    });
  }

  function handlePrepareRerun(frame: StoryboardFrame, branchOption?: BranchPathOption) {
    const baseLabel = `Re-running from "${frame.title}".`;
    const label = branchOption
      ? `${baseLabel} Adjust inputs to take the “${branchOption.label}” path, then Run.`
      : `${baseLabel} Adjust inputs, then run again to inspect a different outcome.`;
    setRerunContext({
      storyboardId: execution?.storyboardId,
      frameId: frame.id,
      label,
    });
    setPhase('configure');
  }

  function handleBackToWorkspace() {
    setPhase('overview');
    setExecution(null);
    setExecutionError(null);
    executionUnsubscribeRef.current?.();
    executionUnsubscribeRef.current = null;
  }

  function handleResetWorkspace() {
    setWorkspace(null);
    setExecution(null);
    setExecutionError(null);
    setWorkspaceError(null);
    setSelectedEntryPointId(null);
    setRerunContext(null);
    setPhase('intake');
    workspaceUnsubscribeRef.current?.();
    workspaceUnsubscribeRef.current = null;
    executionUnsubscribeRef.current?.();
    executionUnsubscribeRef.current = null;
  }

  const executionFrames = execution?.storyboard?.frames || execution?.frames || [];
  const currentFrame = executionFrames[currentFrameIndex] || null;

  return (
    <PhaseContainer
      technicalDetails={technicalDetails}
      onToggleTechnicalDetails={() => setTechnicalDetails((value) => !value)}
      showTechnicalToggle={phase !== 'loading'}
    >
      {phase === 'intake' && (
        <WorkspaceIntakeScreen
          sourceType={sourceType}
          sourceValue={sourceValue}
          error={workspaceError}
          onChangeSourceType={setSourceType}
          onChangeSourceValue={setSourceValue}
          onCreateWorkspace={handleCreateWorkspace}
        />
      )}

      {phase === 'loading' && workspace && (
        <WorkspaceLoadingScreen
          workspace={workspace}
          error={workspaceError}
          onCreateAnother={handleResetWorkspace}
        />
      )}

      {phase === 'overview' && workspace && (
        <WorkspaceOverviewScreen
          workspace={workspace}
          selectedEntryPointId={selectedEntryPointId}
          technicalDetails={technicalDetails}
          onCreateAnother={handleResetWorkspace}
          onSelectEntryPoint={handleOpenWorkspace}
          onShowTour={() => setTourOpen(true)}
        />
      )}

      {phase === 'configure' && workspace && selectedEntryPoint && (
        <ConfigureScreen
          entryPoint={selectedEntryPoint}
          flowGraph={activeFlowGraph}
          flowLoading={workspace.status !== 'ready'}
          unfinishedWork={selectedEntryPoint.unfinishedWork.length > 0 ? selectedEntryPoint.unfinishedWork : workspace.unfinishedWork}
          draftInputs={draftInputs}
          flagsText={flagsText}
          technicalDetails={technicalDetails}
          error={executionError}
          rerunLabel={rerunContext?.label || null}
          onChangeInput={(key, value) => setDraftInputs((prev) => ({ ...prev, [key]: value }))}
          onChangeFlagsText={setFlagsText}
          onRun={handleRunSelected}
          onLoadExampleSet={(exampleSet) => {
            setDraftInputs((prev) => {
              const next = { ...prev };
              for (const [key, value] of Object.entries(exampleSet.values)) {
                if (typeof value === 'boolean') {
                  next[key] = value;
                } else if (typeof value === 'object' && value !== null) {
                  next[key] = JSON.stringify(value, null, 2);
                } else {
                  next[key] = value === undefined ? '' : String(value);
                }
              }
              return next;
            });
          }}
          onClearRerunContext={() => setRerunContext(null)}
          onBack={() => setPhase('overview')}
        />
      )}

      {phase === 'execute' && workspace && selectedEntryPoint && execution && (
        <LiveExecutionScreen
          workspace={workspace}
          entryPoint={selectedEntryPoint}
          execution={execution}
          currentFrame={currentFrame}
          currentFrameIndex={currentFrameIndex}
          technicalDetails={technicalDetails}
          onSelectFrameIndex={setCurrentFrameIndex}
          onBackToWorkspace={handleBackToWorkspace}
          onReconfigure={() => setPhase('configure')}
          onPrepareRerun={handlePrepareRerun}
          onOpenShortcutSheet={() => setShortcutSheetOpen(true)}
        />
      )}

      <KeyboardShortcutSheet
        open={shortcutSheetOpen}
        onClose={() => setShortcutSheetOpen(false)}
      />

      <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </PhaseContainer>
  );
}

function createDraftInputs(fields: EntryPointInputField[]): Record<string, string | boolean> {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === 'boolean') return [field.key, Boolean(field.defaultValue)];
      if (field.type === 'json') return [field.key, JSON.stringify(field.defaultValue ?? {}, null, 2)];
      return [field.key, field.defaultValue === undefined ? '' : String(field.defaultValue)];
    }),
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const parts = [error.message];
    if (error.cause && error.cause !== error.message) parts.push(`Cause: ${error.cause}`);
    if (error.suggestedAction) parts.push(`What to try: ${error.suggestedAction}`);
    return parts.join('\n\n');
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function materializeInputs(
  fields: EntryPointInputField[],
  draftInputs: Record<string, string | boolean>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};

  for (const field of fields) {
    const rawValue = draftInputs[field.key];
    if (field.type === 'boolean') {
      inputs[field.key] = Boolean(rawValue);
      continue;
    }

    const textValue = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
    if (!textValue) {
      if (field.defaultValue !== undefined) inputs[field.key] = field.defaultValue;
      continue;
    }

    if (field.type === 'number') {
      const parsed = Number(textValue);
      if (Number.isNaN(parsed)) throw new Error(`"${field.label}" must be a number.`);
      inputs[field.key] = parsed;
      continue;
    }

    if (field.type === 'json') {
      inputs[field.key] = parseJsonValue(textValue, field.label);
      continue;
    }

    inputs[field.key] = textValue;
  }

  return inputs;
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = parseJsonValue(value, label);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonValue(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}
