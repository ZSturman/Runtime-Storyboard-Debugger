# MVP Scope

## What's Included

### Core Engine
- Entry point discovery (HTTP routes, exported functions, main patterns)
- Control flow graph construction from function ASTs
- Babel instrumentation plugin with guards against infinite loops
- AsyncLocalStorage-based runtime trace collector
- Frame builder converting trace events to linked storyboard frames
- Template-based narrator for human-readable descriptions

### Web Interface
- Three-panel layout (sidebar, timeline, detail)
- Scenario selection and execution
- Storyboard timeline with color-coded frame types
- Branch explanation with "Why This Path?" sections
- Side effect visibility
- Source code viewer with line highlighting

### API Server
- RESTful endpoints for all operations
- On-the-fly Babel transformation of scenario files
- Recursive module instrumentation for target app imports

### CLI
- `analyze` command for entry point discovery
- `run` command for scenario execution

### Example Application
- Express order processing API
- 5 scenarios covering all test cases

### Test Suite
- Unit tests for analyzer, instrumenter, and storyboard engine
- Integration tests exercising the full instrument → trace → storyboard pipeline

## What's Not Included (Future Work)

- **Multi-language support** — Currently JS/TS only
- **IDE integration** — VS Code extension with inline storyboards
- **Live debugging** — Real-time trace visualization during execution
- **Source map support** — Mapping instrumented code back to original source lines
- **Persistent storage** — Storyboards are in-memory only
- **Authentication** — No auth on the API server
- **Production instrumentation** — Designed for development/debugging use only
- **Custom narration templates** — Templates are hardcoded
- **Diff view** — Comparing storyboards across different scenarios
- **Team collaboration** — Sharing and annotating storyboards
