# Runtime Storyboard Debugger

> **Status:** pre-1.0, public roadmap. See [docs/release-plan.md](docs/release-plan.md) and [docs/v1-scope.md](docs/v1-scope.md) for what's shipping and what's deferred.

Open an unfamiliar codebase in an editor that already knows where the entry points are, where the unfinished work is, and how the code actually behaves at runtime.

RSD is shaped like a code editor on purpose. Drop in a local folder or a public GitHub URL and you get:

- a familiar **Activity Bar / Sidebar / Editor / Inspector / Bottom Panel** layout
- a **file tree** that shows TODO/FIXME counts and which files contain entry points
- the project **README** opened in the editor on first load
- detected **entry points** with auto-generated input forms — one click runs them
- a **storyboard** of the run that decorates the source: gutter glyphs, active line highlights, frame-by-frame variables and side effects in the Inspector
- ⌘K **command palette** for jumping to any file, entry point, or finding

Runtime tracing is one tab, not the whole app. RSD is fully usable as a static explorer; the runtime storyboard is what you reach for when you want to know what actually happened, not just what could.

## Why This Exists

Most code-understanding tools force a tradeoff:

- static graphs show what could happen, but not what actually happened
- debuggers show what happened, but not in a repo-first, onboarding-friendly way
- LLM explanations can be helpful, but they often hide uncertainty or skip the underlying evidence

RSD makes the evidence visible first and the interpretation optional.

## What It Does

- Open a local path or a public GitHub repository URL.
- Browse files in a Monaco-based editor with TODO/FIXME and entry-point decorations rendered inline.
- Search the workspace with case-insensitive grep across allowlisted extensions.
- List unfinished-work findings (TODO/FIXME/HACK/stub/analysis-gap) grouped by kind.
- Run any detected entry point and watch frames stream into the Storyboard timeline.
- Click a runtime frame (in the editor gutter or the timeline) to see its captured variables and side effects in the Inspector.
- Fall back to deterministic static analysis when runtime tracing stalls or fails.
- Offer optional LLM assistance — additive, labeled, never replacing the deterministic baseline.

## How It Works

1. Create a workspace from a local directory or GitHub URL.
2. RSD ingests the repo, runs static analysis, and surfaces phase progress in the title bar.
3. The file tree, README, entry points and findings populate the editor as soon as the workspace is ready.
4. You pick an entry point, fill the auto-generated input form in the Inspector, and hit **▶ Run**.
5. RSD streams execution events into the storyboard tab and decorates the open source files as frames arrive.
6. If runtime tracing cannot complete, RSD shows the blocker and the best available fallback analysis without taking over the editor.

## Quick Start

Requires **Node.js 20+** and npm 10+.

```bash
git clone https://github.com/ZSturman/Runtime-Storyboard-Debugger.git
cd Runtime-Storyboard-Debugger
npm install
npm run dev
```

`npm run dev` starts the API server (with `examples/order-api` preloaded) and the Vite UI together. Open [http://localhost:3000](http://localhost:3000).

### Advanced: run the pieces separately

If you need to target a different repo or port, run the two halves directly.

Terminal 1 — API server:

```bash
npx ts-node packages/core/src/cli/index.ts analyze <path-to-target> --port 3001
```

Terminal 2 — UI:

```bash
cd packages/ui
RSD_API_URL=http://localhost:3001 npx vite
```

> **Path format**: the `analyze` argument must be an **absolute path** (e.g., `/Users/you/my-project`).
> Relative paths are resolved from the directory where npm was originally invoked, not from `packages/core`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Local path not found: …` on startup | The path passed to `analyze` doesn't exist or is relative and resolved from the wrong directory | Use an absolute path: `analyze /abs/path/to/project` |
| `git: command not found` during GitHub ingestion | `git` is not on your PATH | Install git and re-run |
| GitHub workspace fails with permission error | Private repository — not supported yet | Clone the repo locally and use a local-path workspace |
| `No entry points detected` after analysis | Target is not a Node.js/Express app, or source files are in an unexpected location | Ensure the project has a `src/` folder with exported functions or Express route handlers |
| Port already in use | Another process is listening on port 3001 | Pass `--port <other>` to the `analyze` command |
| UI connects but shows a stale workspace | A previous `npm run dev` left the server running | Kill the old process and restart |

## Recommended Demo Targets

- Local: `examples/order-api`
- GitHub: `mjgs/minimal-express-typescript`
- GitHub: `expressjs/express`
- GitHub: `gothinkster/node-express-realworld-example-app`

The last two are especially useful for testing graceful fallback when runtime setup is incomplete or expensive.

## UI Flow

### Workspace Intake

- Choose `Local path` or `GitHub URL`
- Create a workspace
- Watch ingestion and analysis progress instead of waiting on a blank state

### Workspace Overview

- Review likely journeys
- Inspect detected entry points
- Check runtime blockers and detected scripts
- Optionally configure LLM assistance

### Live Execution

- Start an explicit trace for a supported route or exported function
- Watch the timeline fill with status updates, calls, branches, waits, logs, snapshots, side effects, returns, and failures
- Scrub through captured steps while the run is still active
- Click any branch you didn't take to re-run with inputs aimed at it

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | Previous / next step |
| `↑` / `↓` | Jump back / forward 5 steps |
| `F` | Focus the flow map |
| `/` | Filter the timeline |
| `C` | Re-run with different inputs |
| `B` | Back to workspace overview |
| `?` | Open the keyboard shortcut sheet |
| `Esc` | Close overlays / clear filter |

### Fallback Analysis

- If execution fails or stalls, RSD shows the blocker clearly
- The flow graph, unfinished work, and other static artifacts stay visible so the workspace still feels trustworthy

## Optional LLM Assistance

> **Note for v1.0:** the LLM panel is being removed from the v1.0 launch and reintroduced post-launch. The code still exists in the current build but is not part of the supported flow. See [docs/release-plan.md](docs/release-plan.md).

LLM help is opt-in and session-only.

- Providers: OpenAI, Anthropic, Gemini, OpenRouter
- API keys are kept in memory only
- Model lists are fetched when the provider supports it, otherwise curated defaults are shown
- The LLM layer is used for explanation and prioritization, not for baseline repo ingestion or core tracing

## Architecture

```text
packages/
  core/
    analyzer/        entry points, unfinished work, flow graphs
    instrumenter/    runtime tracing + Babel instrumentation
    server/          workspace sessions, GitHub ingestion, SSE streams, execution sessions, LLM endpoints
    storyboard/      frame building + narration
  ui/
    src/components/  intake, loading, overview, live execution, step inspection
examples/
  order-api/         sample local app for end-to-end exploration
tests/
  unit/              analyzer, instrumenter, storyboard, server helpers
```

## Screenshots And Diagrams

For a stronger GitHub presentation, add these assets near the top of the README:

- A hero screenshot of the live execution workspace while a trace is actively streaming
- A screenshot of the workspace overview showing journeys, entry points, blockers, and scripts
- A short GIF of a run progressing from analysis to live execution to fallback
- A simple architecture diagram showing `Ingest -> Analyze -> Trace -> Explain`

If you add screenshots, place them directly under `What It Does` and keep captions short and outcome-oriented.

## Current Scope

Included now:

- local path ingestion
- public GitHub repo ingestion
- automatic entry-point and journey discovery
- live execution streaming with inspectable steps
- workspace-level fallback states
- optional multi-provider LLM assist flow

Not included yet:

- private GitHub repo auth
- automatic remote runtime execution without explicit user action
- persistent LLM credential storage
- multi-language analysis beyond JS/TS
- IDE integration
- collaborative annotations and sharing

## Validation

```bash
npm run lint
npm test
npm run build
```

## License

[MIT](LICENSE) © Zachary Sturman

## Design Principles

- Fast repo understanding beats hidden magic
- Live progress beats vague loading states
- Trustworthy fallback beats broken execution
- Static evidence comes before LLM interpretation
- Technical detail stays available without overwhelming non-developers
