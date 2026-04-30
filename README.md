# Runtime Storyboard Debugger

> **Status:** pre-1.0, public roadmap. See [docs/release-plan.md](docs/release-plan.md) and [docs/v1-scope.md](docs/v1-scope.md) for what's shipping and what's deferred.

Understand an unfamiliar codebase by turning repo structure and runtime behavior into a visible, navigable storyboard.

Runtime Storyboard Debugger helps two kinds of people quickly:

- Developers who need to debug or extend a repo they have never seen before
- Stakeholders who want a readable walkthrough of what an app is doing

Instead of hiding behind a loading spinner, RSD shows the pipeline in public:

- repo ingestion
- dependency discovery
- static analysis
- runtime instrumentation
- execution
- fallback analysis

Then, when you trace a route or exported function, RSD shows the current step, current function or route, branch reasons, variable snapshots, side effects, waits, logs, returns, and failures as the run unfolds.

## Why This Exists

Most code understanding tools force a tradeoff:

- static graphs show what could happen, but not what actually happened
- debuggers show what happened, but not in a repo-first, onboarding-friendly way
- LLM explanations can be helpful, but they often hide uncertainty or skip over the underlying evidence

RSD is built to make the evidence visible first and the interpretation optional.

## What It Does

- Open a local path or a public GitHub repository URL
- Detect routes, exported functions, startup files, package scripts, and likely user journeys automatically
- Build flow graphs and unfinished-work findings before any runtime execution starts
- Stream execution into a live timeline instead of waiting for one final result
- Let you scrub backward and forward through already-captured steps
- Fall back to the best available static analysis when runtime tracing stalls or fails
- Offer optional LLM assistance for path discovery, explanations, uncertainty callouts, and alternate traces

## How It Works

1. Create a workspace from a local directory or GitHub URL.
2. RSD ingests the repo and surfaces progress while it is happening.
3. Static analysis discovers entry points, routes, startup paths, scripts, blockers, and likely journeys.
4. You choose a route or exported function and provide inputs.
5. RSD streams execution events into a live storyboard.
6. If runtime tracing cannot complete, RSD keeps the experience useful by explaining the blocker and showing fallback analysis.

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
