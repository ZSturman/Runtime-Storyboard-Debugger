# Runtime Storyboard Debugger — Product Overview

Runtime Storyboard Debugger (RSD) helps developers understand an unfamiliar codebase. Open a local folder or a public GitHub URL and you get a familiar editor-style workspace with the file tree, README, and any TODO/FIXME findings already populated — no spinner, no marketing screen.

## What you see when you open a project

- **Activity Bar** (left edge) — switches the sidebar between Explorer, Search, Findings, Entry Points, and Storyboards.
- **Sidebar** — file tree (with TODO/FIXME counts and entry-point markers), full-text search, finding lists grouped by kind, the detected entry points, and any captured storyboards.
- **Editor** — Monaco code view with read-only source. Runtime evidence and unfinished-work markers render directly in the gutter and on the active line.
- **Inspector** (right) — context-sensitive: file metadata, the run form for a selected entry point, or the variables and side effects of the selected runtime frame.
- **Bottom Panel** — switchable tabs for Storyboard timeline, raw Trace events, Output, and Problems. Detachable into a floating overlay so it can sit beside the editor.
- **Command Palette** — ⌘K to jump to any file, entry point, or finding.

## Core flows

1. **Browse the repo.** Open the project, read the README in the editor, click around the tree. Findings and entry points are decorated inline.
2. **Hunt unfinished work.** Findings view groups TODO/FIXME/HACK/stub/analysis-gap markers; clicking jumps the editor to the right line.
3. **Run an entry point.** Pick one in the sidebar, fill the auto-generated input form in the Inspector, hit Run. The Bottom Panel switches to the Storyboard timeline as frames stream in.
4. **Inspect a frame.** Clicking a line in the editor (or a card in the timeline) selects that runtime frame; the Inspector shows the captured variables and side effects.
5. **Switch context.** ⌘K to jump to anything; storyboards are persisted in-memory while the server is running and reopen as editor tabs.

## What RSD captures

- **Static evidence** before any execution: routes, exported functions, startup files, package scripts, flow graphs, unfinished-work findings, runtime blockers.
- **Runtime evidence** when an entry point is run: function entry/return, branches with reasons, variable snapshots, side effects, async waits and continuations, stdout/stderr, errors, fallback summaries.

Runtime evidence is always optional — RSD is fully usable as a static explorer. Tracing is a tab, not the whole app.

## Non-goals (today)

- No write access to the workspace from the UI.
- No interactive terminal in the Bottom Panel — Output is the captured run log.
- No LLM-generated narration in the default view; LLM assistance is additive and labeled when used.
