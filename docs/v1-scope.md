# RSD v1.0 — In / Out

One page. If it's not on this list, it's not in v1.0.

## In v1.0

### Languages
- JavaScript / TypeScript (Node + Express targets)
- Python (Flask + FastAPI; basic script `__main__`)

### Core capability
- Workspace intake from local path or public GitHub URL
- Static analysis: entry points, flow graph, unfinished-work findings
- Runtime tracing of a chosen entry point with inputs you supply
- Storyboard view: ordered frames with state, branches, side effects, returns, errors
- Real graph-based flow map (`reactflow`) replacing text-indented map
- Click an alternate branch → one-click rerun with that branch flipped

### Persistence
- Local SQLite store at `~/.rsd/store.db`
- Run history per workspace
- `.rsd` export / import

### Comparison
- Run diff: pick two runs of the same entry point → side-by-side timeline + flow map

### Distribution
- `npx runtime-storyboard-debugger <path>` (alias: `npx rsd <path>`)
- Auto-opens browser, picks free port if 3001 is taken
- Bundled UI; no separate UI install

### Quality / safety
- Onboarding tour (first run only)
- Keyboard shortcuts: arrows, `f`, `c`, `?`, `/`
- Demo-repo e2e suite (6 repos) green in CI
- `npm audit --production` clean
- Path-traversal hardening on `/api/source`
- Opt-in anonymous telemetry; opt-in crash reports

### Distribution
- Public GitHub repo, MIT license
- Issue + PR templates, Code of Conduct, Security policy
- GitHub Actions CI (Node 20, 22)
- Docs site
- 90-second demo video, README hero GIF

## Out of v1.0 (deferred)

- LLM assistance (was `LlmAssistPanel`) — back in Phase 10
- Scenario presets feature
- VS Code extension
- Private GitHub repo OAuth
- Frame annotations / saved notes
- Multi-language beyond JS/TS + Python
- Hosted "publish run" service
- PR-comment GitHub Action

## Hard cuts (not coming back without a strong reason)

- Authenticated multi-user mode
- Cloud / SaaS hosting
- Paid tiers
