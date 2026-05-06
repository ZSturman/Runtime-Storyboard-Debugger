# Runtime Storyboard Debugger Architecture

> The UI is editor-first: a VS Code-style shell with an Activity Bar, Sidebar, Editor, Inspector and Bottom Panel. Runtime tracing is one capability among many — surfaced inline in the editor and as a Bottom Panel tab, not the whole app.

## Backend Modules (`packages/core/src/server`)

The HTTP/SSE server (`server/index.ts`) keeps its existing analyzer + instrumenter pipeline and adds editor-shaped endpoints:

- `GET  /api/workspaces/:id/tree` — depth-limited file tree (hides `node_modules`, `.git`, `dist`, `.next`, `.cache`, etc.)
- `GET  /api/workspaces/:id/file?path=` — UTF-8 file contents (2 MB cap, NUL-byte detection rejects binaries)
- `GET  /api/workspaces/:id/readme` — first README discovered at the workspace root
- `GET  /api/workspaces/:id/findings` — TODO/FIXME/HACK/stub/analysis-gap markers
- `GET  /api/workspaces/:id/search?q=` — case-insensitive grep across allowlisted extensions, capped at 500 hits
- `GET  /api/workspaces/:id/entry-points-on-file?path=` — entry points whose source resolves to this file

All filesystem access goes through `server/files.ts::resolveWorkspacePath`, which canonicalizes the workspace root with `fs.realpathSync` and rejects any path that escapes that root.

The existing endpoints (`/workspaces`, `/workspaces/:id/stream`, `/workspaces/:id/executions`, `/storyboards`) are unchanged and continue to drive workspace lifecycle, runtime instrumentation, and storyboard capture.

## Source Normalization

A workspace source is normalized before ingestion.
- Local: `{ type: 'local-path', path }`
- GitHub: `{ type: 'github-url', owner, repo, ref?, focusPath?, url }`

Rules:
- Repo-root URLs produce `owner`/`repo`. `.git` suffixes are stripped.
- `tree/<ref>` stores `ref`. `tree/<ref>/<path>` and `blob/<ref>/<path>` store both `ref` and `focusPath`.
- Analysis runs against the full checkout. `focusPath` is currently a navigation hint.

## GitHub Ingestion

Shallow partial clone:
- `git clone --depth 1 --filter=blob:none --single-branch`
- optional `--branch <ref>` when a ref is supplied

Cached refs refresh with `git fetch --depth 1 origin <ref>` + `git checkout --force FETCH_HEAD`.

## Story Model

Deterministic analysis produces: entry points, startup files, package scripts, flow graphs, unfinished-work findings, runtime blockers.

Runtime capture produces: function entry/return frames, branch frames, state snapshots, side effects, waits and async continuations, stdout/stderr log frames, fallback summaries.

## Frontend Architecture (`packages/ui/src`)

```
main.tsx → App.tsx
            ├── WorkspacePicker     (when no workspace open)
            └── Shell               (allotment-based layout)
                ├── TitleBar
                ├── ActivityBar     (Explorer / Search / Findings / EntryPts / Storyboards)
                ├── Sidebar         (router across the 5 sub-views)
                ├── EditorArea      (tab strip + Monaco / Markdown / StoryboardView)
                ├── Inspector       (file metadata, run form, frame variables)
                ├── BottomPanel     (Storyboard timeline · Trace · Output · Problems)
                └── CommandPalette  (⌘K)
```

State is centralized in a tiny custom store (`tinyStore.ts`, `store.ts`) backed by `useSyncExternalStore`. Module-level subscribers in `controller.ts` own the workspace and execution SSE streams; components only read state, never own streams.

Decorations on the Monaco editor come from three sources:
1. Entry point glyphs (▶ in the gutter, hoverable name)
2. Findings (TODO/FIXME/stub line markers with hover detail)
3. Runtime frames (active line highlight + per-kind glyph; clicking the line jumps the active frame)

UI state (panel open/closed, active activity, bottom tab) is persisted to `localStorage` via `persistence.ts`.

## Current Evidence Direction

The runtime evidence model still distinguishes:
- confirmed runtime transitions
- inferred next transitions
- speculative possibilities

Target concepts to formalize next: `EntryPointNode`, `ExecutionNode`, `StateSnapshot`, `BranchCondition`, `NavigationEdge`, `EvidenceRecord`, `ConfidenceLevel`. Edges should carry `{source, destination, label, reason, evidenceType, confidence}` with evidence types `confirmed-runtime`, `deterministic-static`, `heuristic-inference`, `llm-assisted`.

LLM or agent assistance remains additive and explicitly labeled — never replacing the deterministic baseline.
