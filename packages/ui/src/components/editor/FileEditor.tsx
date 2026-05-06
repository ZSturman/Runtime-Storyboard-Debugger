import { useEffect, useMemo, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { OpenTab } from '../../store';
import type { StoryboardFrame, UnfinishedWorkFinding, EntryPoint } from '../../api';
import { selectFrame } from '../../controller';

interface FileEditorProps {
  tab: OpenTab;
  findings: UnfinishedWorkFinding[];
  entryPoints: EntryPoint[];
  frames: StoryboardFrame[];
  selectedFrameId: string | null;
}

export function FileEditor({ tab, findings, entryPoints, frames, selectedFrameId }: FileEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null);

  const onMount: OnMount = (e) => {
    editorRef.current = e;
    decorationCollectionRef.current = e.createDecorationsCollection([]);
    e.onMouseDown((evt) => {
      const line = evt.target?.position?.lineNumber;
      if (!line) return;
      const frame = fileFrames.find((fr) => fr.line === line);
      if (frame) selectFrame(frame.id);
    });
    applyDecorations();
    applyReveal();
  };

  const fileFindings = useMemo(
    () => findings.filter((f) => f.file === tab.ref),
    [findings, tab.ref],
  );
  const fileEps = useMemo(
    () => entryPoints.filter((e) => e.file === tab.ref),
    [entryPoints, tab.ref],
  );
  const fileFrames = useMemo(
    () => frames.filter((f) => f.file === tab.ref),
    [frames, tab.ref],
  );

  function applyDecorations() {
    const ed = editorRef.current;
    const col = decorationCollectionRef.current;
    if (!ed || !col) return;
    const decos: editor.IModelDeltaDecoration[] = [];

    for (const ep of fileEps) {
      decos.push({
        range: { startLineNumber: ep.line, startColumn: 1, endLineNumber: ep.line, endColumn: 1 },
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'rsd-entry-glyph',
          glyphMarginHoverMessage: { value: `**Entry Point**: ${ep.name}` },
        },
      });
    }

    for (const f of fileFindings) {
      const cls = `rsd-finding-${f.kind === 'fixme' || f.kind === 'hack' ? 'fixme' : f.kind === 'todo' ? 'todo' : 'stub'}`;
      decos.push({
        range: { startLineNumber: f.line, startColumn: 1, endLineNumber: f.line, endColumn: 1 },
        options: {
          isWholeLine: false,
          linesDecorationsClassName: cls,
          glyphMarginHoverMessage: { value: `**${f.kind.toUpperCase()}**: ${f.title}\n\n${f.detail}` },
        },
      });
    }

    for (const fr of fileFrames) {
      const isSelected = fr.id === selectedFrameId;
      const t = fr.type;
      const glyphCls = `rsd-frame-glyph-${
        t === 'enter-route' || t === 'enter-function' ? 'enter' :
        t === 'branch' ? 'branch' :
        t === 'await' || t === 'async-wait' ? 'await' :
        t === 'side-effect' ? 'side' :
        t === 'error' ? 'error' : 'return'
      }`;
      decos.push({
        range: { startLineNumber: fr.line, startColumn: 1, endLineNumber: fr.line, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: isSelected ? 'rsd-frame-line-active' : 'rsd-frame-line',
          glyphMarginClassName: glyphCls,
          glyphMarginHoverMessage: { value: `**${fr.title}**\n\n${fr.description}` },
        },
      });
    }

    col.set(decos);
  }

  function applyReveal() {
    const ed = editorRef.current;
    if (!ed || !tab.reveal) return;
    ed.revealLineInCenter(tab.reveal.line);
    ed.setPosition({ lineNumber: tab.reveal.line, column: tab.reveal.column ?? 1 });
  }

  useEffect(() => {
    applyDecorations();
  }, [fileFindings, fileEps, fileFrames, selectedFrameId]);

  useEffect(() => {
    applyReveal();
  }, [tab.reveal?.line, tab.reveal?.column]);

  if (tab.loading) {
    return <div className="p-3 text-editor-sm text-editor-text-muted">Loading {tab.ref}…</div>;
  }
  if (tab.error) {
    return (
      <div className="p-3 text-editor-sm text-editor-error">
        Failed to load {tab.ref}: {tab.error}
      </div>
    );
  }

  return (
    <Editor
      theme="vs-dark"
      language={tab.language || 'plaintext'}
      value={tab.contents ?? ''}
      onMount={onMount}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontFamily: 'Menlo, Monaco, "Cascadia Code", Consolas, monospace',
        fontSize: 13,
        lineNumbers: 'on',
        glyphMargin: true,
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        wordWrap: 'off',
      }}
    />
  );
}
