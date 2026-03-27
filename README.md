# Runtime Storyboard Debugger

**Turn software behavior into navigable causal stories.**

Runtime Storyboard Debugger (RSD) is a developer tool that combines static code analysis with runtime tracing to produce human-readable storyboards of how code actually executes. Instead of stepping through breakpoints, you get a narrative: which functions ran, why each branch was taken, what side effects occurred, and how async operations handed off.

---

## Key Features

- **Entry Point Discovery** — Automatically finds HTTP routes, exported functions, and main entry patterns via AST analysis
- **Flow Graph Construction** — Builds static control flow graphs showing possible paths through functions
- **Runtime Instrumentation** — Babel plugin transforms code to emit trace events without modifying source files
- **Storyboard Generation** — Converts raw trace events into linked narrative frames with human-readable descriptions
- **Branch Explanation** — Shows *why* each conditional was taken, with actual runtime variable values
- **Side Effect Visibility** — Surfaces database writes, HTTP calls, notifications, and other impactful operations
- **Async Causality** — Tracks execution across async boundaries with continuation linking
- **Template-Based Narration** — No LLM dependency; deterministic, offline-capable descriptions

## Architecture

```
packages/
  core/           # Analysis engine, instrumenter, runtime, server, CLI
    src/
      analyzer/     # Entry point discovery + flow graph builder
      instrumenter/ # Babel plugin + AsyncLocalStorage runtime
      storyboard/   # Types, frame builder, narrator
      server/       # Express API
      cli/          # Commander CLI
  ui/             # React + Vite + Tailwind web interface
examples/
  order-api/      # Example application with 5 test scenarios
tests/
  unit/           # Unit tests (analyzer, instrumenter, storyboard)
  scenarios/      # Integration tests (full pipeline)
```

## Quick Start

### Install

```bash
npm install
```

### Run Tests

```bash
npm test
```

### Analyze an Application

```bash
# Discover entry points and start the API server
npx ts-node packages/core/src/cli/index.ts analyze examples/order-api

# If port 3001 is already in use
npx ts-node packages/core/src/cli/index.ts analyze examples/order-api --port 3002

# Run a specific scenario
npx ts-node packages/core/src/cli/index.ts run examples/order-api --scenario examples/order-api/scenarios/straight-through.ts
```

### Start the Web UI

```bash
# Terminal 1: Start the API server
npx ts-node packages/core/src/cli/index.ts analyze examples/order-api

# Terminal 2: Start the React dev server
cd packages/ui && npx vite

# If the API is running on a different port
cd packages/ui && RSD_API_URL=http://localhost:3002 npx vite
```

Open http://localhost:3000 to explore storyboards.

## Example Scenarios

The included `examples/order-api` application exercises all core capabilities:

| Scenario | What It Tests |
|---|---|
| **Straight-Through** | Happy path, no branching — clean causal chain |
| **Conditional Branch** | Order > $100 triggers discount — branch explanation with values |
| **Validation Failure** | Empty order → early exit — shortened story, error frame |
| **Async Handoff** | `notify=true` → async email — cross-boundary causality |
| **Side Effects** | Multiple items → inventory updates — visible state changes |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/entry-points` | List discovered entry points |
| `GET` | `/api/entry-points/:id/flow` | Get flow graph for an entry point |
| `POST` | `/api/run` | Execute a scenario and get its storyboard |
| `GET` | `/api/storyboards` | List all recorded storyboards |
| `GET` | `/api/storyboards/:id` | Get a specific storyboard |
| `GET` | `/api/source` | Get source code snippet with context |
| `GET` | `/api/scenarios` | List available scenario files |

## How It Works

1. **Static Analysis** — Babel parser reads the target codebase AST, finding entry points and building flow graphs
2. **Instrumentation** — A Babel plugin transforms scenario files (and their imports) to inject tracing calls at function boundaries, branch points, await expressions, and known side-effect patterns
3. **Execution** — The scenario runs inside an `AsyncLocalStorage` context that collects `TraceEvent` objects
4. **Frame Building** — Raw events are converted into linked `StoryboardFrame` objects with proper sequencing and async continuation links
5. **Narration** — Template-based narrator generates human-readable titles and descriptions for each frame

## Tech Stack

- **TypeScript** — Strict mode, monorepo with npm workspaces
- **Babel** — AST parsing, traversal, code generation, and plugin system
- **Node.js AsyncLocalStorage** — Trace context propagation across async boundaries
- **Express** — API server
- **React 18 + Vite 5 + Tailwind CSS 3** — Web interface
- **Vitest** — Testing framework
- **Commander** — CLI argument parsing

## Project Status

This is an MVP demonstrating the core concept. See [docs/mvp-scope.md](docs/mvp-scope.md) for scope details and [docs/testing-guide.md](docs/testing-guide.md) for the test plan.
