# RSD v1.0 Public Release Plan

> Authoritative source of truth for what we're shipping and why.
> Updated as phases complete.

**Target.** Local OSS developer tool, distributed via `npx runtime-storyboard-debugger <path>` (alias `npx rsd <path>`), MIT-licensed, free, no auth.
**Primary audience.** New engineers onboarding to an unfamiliar JS/TS or Python codebase.
**Out of v1.0.** LLM assistance, VS Code extension, private GitHub auth, frame annotations, scenario presets feature, languages beyond JS/TS + Python, hosted/SaaS, monetization.
**Quality bar.** Demo-quality. Rough edges documented. Iterate publicly.
**Calibration.** ~6 months solo full-time. Public GitHub repo from day one.

See [v1-scope.md](v1-scope.md) for the one-page in/out cheatsheet.

---

## TL;DR

Take the current prototype (workspace intake → static analysis → live JS/TS execution) and ship a polished, single-command, locally-persistent code-explanation tool that works on JS/TS *and* Python. Cut LLM, scenario presets, private repos, and auth from v1.0. Replace the text-indented "flow map" with a real graph view. Add run history, run diff, keyboard navigation, onboarding tour, opt-in telemetry. Land it as `npx rsd <path>` with a public GitHub repo, CI, and a launch demo video.

---

## Phase 0 — Foundation Cleanup & Repo Alignment

**Goal.** Stop the current code/docs/scope drift before adding anything new. Get the repo into a public-grade baseline.

**Steps**
1. Delete dead UI code: `WelcomeScreen.tsx`, `ExploreScreen.tsx`, `hooks/useApi.ts`. Audit `App.tsx` so only the workspace-driven flow remains.
2. Cut the orphaned scenario-presets surface from the server (`POST /api/run`, `GET /api/scenarios`, `executeScenarioPreset`). Keep `examples/order-api/scenarios/*.ts` only as integration-test fixtures.
3. Replace `docs/mvp-scope.md` and `docs/roadmap.md` with: this file as `docs/release-plan.md`, the one-pager `docs/v1-scope.md`. Keep `docs/architecture.md` and `docs/walkthroughs/*` but sync to current code.
4. Single dev command: `npm run dev` starts core server + UI together (via `concurrently`). Document the legacy two-terminal flow as advanced fallback.
5. Repo metadata for public visibility: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/{bug,feature}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`. Update `package.json` with `repository`, `bugs`, `homepage`, `license`, `engines.node`, `keywords`.
6. CI: GitHub Actions running `npm ci && npm run lint && npm test && npm run build` on push and PR for Node 20 + 22.
7. Confirm npm package name `runtime-storyboard-debugger` (CLI bin: `rsd`).
8. Make repo public on GitHub.
9. Cut `v0.2.0` as the "pre-plan baseline" so the release-plan delta is visible.

**Acceptance**
- `git clone && npm install && npm run dev` opens the UI — no second terminal needed.
- `npm run lint && npm test && npm run build` all green in CI.
- Repo is public, has license + contributing + issue templates, README points at this plan.
- No references in the codebase to deleted screens/routes (grep clean).

---

## Phase 1 — JS/TS UX Polish to "Delightful"

**Goal.** A new engineer who clones a JS/TS repo, runs `npx rsd .`, and opens the browser must, within 60 seconds, understand what the app does and trace a real run with no docs.

**Steps**
1. **Terminology pass.** Replace internal vocabulary: "likely journeys" → "Suggested places to start"; "runtime blockers" → "Setup needed before tracing"; "fallback analysis" → "What we can show without running it"; hide or rename `phaseHistory`/`cacheState`. One-line tooltip on every section header.
2. **Replace the flow map.** Swap the text-indented `FlowMap.tsx` for `reactflow` with `dagre`/`elkjs` auto-layout. Nodes = function/branch/await/return; edges colored by confirmed-runtime vs static-only. Highlight current frame's node. Click → jump to the frame.
3. **Configure screen redesign.** One progressive-disclosure mechanism (kill the dual technical-mode + optional-fields-fold combo). Default: required fields only; "Show advanced" reveals optional + execution flags.
4. **Step inspector polish (`StepCard.tsx`).** Tighten: title → narrative → primary evidence (state / return / error / branch) → side effects → source. "Explore alternate path" actually triggers a one-click rerun with the branch flipped.
5. **Keyboard navigation.** `←`/`→` step frames, `↑`/`↓` jump up/down call stack, `f` flow map, `c` reconfigure, `?` shortcut sheet, `/` filter timeline. Visible hint footer.
6. **Onboarding tour.** First-run-only 4-step overlay (intake → overview → configure → execute). Stored in `localStorage`.
7. **Error messaging audit.** Every server error path returns human-readable cause + suggested action; UI surfaces both.
8. **Performance pass.** Test on `expressjs/express` and `realworld-example-app`. Profile entry-point discovery + flow-graph construction. Cap files scanned, ignore `node_modules`/`dist`/`.next`/`build`. Stream UI render for >200 entry points.
9. **Empty / zero states.** No entry points found, no journeys inferred, runtime blocked — each gets a designed empty state with one clear next action.

**Acceptance**
- 5 informal testers each trace a demo JS/TS repo with no help.
- Lighthouse a11y ≥ 85 on main screens.
- 60s task completion on `examples/order-api` from clean clone.
- Flow map renders correctly for a 50+ node graph.
- Keyboard shortcut sheet documented in-app and in README.

**Dependencies.** Phase 0.

---

## Phase 2 — Local Persistence & Run History

**Goal.** Refreshing the page does not lose work. Past runs are browsable. Workspaces survive restarts.

**Steps**
1. SQLite via `better-sqlite3` at `~/.rsd/store.db`.
2. Schema: `workspaces`, `entry_points` (cached), `flow_graphs` (cached), `runs` (one per executed storyboard), `frames` as a JSON blob per run (start simple).
3. Wire `WorkspaceManager` and execution session to persist via the store. Replace the in-memory `Map<id, Storyboard>`. Hydrate on server start.
4. **Runs** tab on workspace overview. List past runs with entry point, timestamp, status, duration, frame count. Click → reopen storyboard read-only. Filter by entry point and status.
5. Background pruning: configurable cap (default 100 runs/workspace, 30 days). `rsd prune` CLI command.
6. **`.rsd` export / import**: versioned zip (or single JSON) containing workspace metadata, cached entry points, runs with frames, source snippets used. UI: "Export run" button on a storyboard; "Import .rsd" on intake.
7. Schema-version row + idempotent up-migrations.
8. Document storage location, how to clear it, privacy implications.

**Acceptance**
- Run, restart server, reopen UI: run is still there.
- Export `.rsd`, import on fresh `~/.rsd/`, view storyboard identically.
- Delete workspace via UI → all rows removed.
- DB file < 50MB after 50 runs of `examples/order-api`.

**Dependencies.** Phase 0. Independent of Phase 1.

---

## Phase 3 — Run Diff

**Goal.** Compare two runs of the same entry point. See what changed.

**Steps**
1. Multi-select two runs of same entry point → "Compare" → diff screen.
2. Diff algorithm: align frames by `(functionName, file, line, sequence-position)`. Surface divergent branches, divergent returns, side effects only in one run, errors only in one run, duration deltas.
3. Visual: side-by-side timeline + unified flow map color-coded (run A red, run B blue, shared purple).
4. Frame inspector: both runs' state side-by-side at the chosen alignment.
5. CLI: `rsd diff <runIdA> <runIdB>` prints text summary.

**Acceptance**
- Diff `validation-failure` vs `straight-through` on `examples/order-api` produces a flow map highlighting the divergent branch.
- Diff handles different frame counts without crashing.

**Dependencies.** Phase 2.

---

## Phase 4 — Python Support (Full Parity)

**Goal.** Same UX as JS/TS for Python codebases. Trace function enter/exit, branches, awaits, side effects.

**Steps**
1. Node spawns a Python child that imports a small `rsd_runtime` package and emits TraceEvents over stdout JSON-lines. Node server is the single coordinator.
2. **`rsd_runtime`** Python package (vendored; later published to PyPI). Implements `enter`/`exit`/`branch`/`await_start`/`await_end`/`side_effect` matching the `__rsd` runtime. Captures via AST rewriting at import time using `importlib.abc.MetaPathFinder`. Async via `contextvars.ContextVar`.
3. **Python analyzer**: Flask routes (`@app.route`, `@app.get/post`), FastAPI routes (`@app.get(...)`, `APIRouter`), Django URL patterns (basic), exported functions, `if __name__ == '__main__'` entry points, TODO/FIXME/HACK comments, flow graph via Python `ast`.
4. **Environment setup.** Detect `pyproject.toml`, `requirements.txt`, `setup.py`, virtualenvs. Surface "Setup needed before tracing" blockers if `rsd_runtime` can't install.
5. **Run support.** Spawn Python with the import hook preloaded. For Flask/FastAPI routes, use `app.test_client()`.
6. **Side effect tagging.** `print` → log; `requests.get/post` → http-call; SQLAlchemy `session.add/commit` → db-write; `open(..., 'w')` → file-write; `logger.*` → log.
7. **UI**: language-aware copy. Detect language and label accordingly.

**Acceptance**
- Trace Flask + FastAPI demo apps: enter/exit, if/else, await, `requests.get` side effect, return all show as frames.
- Python script with no entry points traces `__main__`.
- Server is robust to Python child crashing.
- Time-to-first-frame ≤ 5s on demo Python repos.

**Dependencies.** Phase 0. Recommended after Phase 1.

---

## Phase 5 — Distribution: `npx rsd <path>`

**Goal.** Single-command install + run.

**Steps**
1. Consolidate CLI in `packages/core/src/cli/index.ts` into a real `bin` entry. Flags: `rsd <path> [--port N] [--host H] [--no-open] [--verbose]`. Walk up from `cwd` to find a project marker (`package.json`, `pyproject.toml`); else `cwd`.
2. Bundle built UI inside published package. `prepublishOnly` runs the build.
3. Auto-open browser via `open` once server is listening.
4. Port-already-in-use: try `port`, `port+1...port+9`, log the chosen port.
5. `npm publish` workflow — GitHub Actions on tag push, `NPM_TOKEN` secret. `changesets` or manual semver.
6. Smoke-test published package end-to-end on a clean machine.

**Acceptance**
- Fresh machine with Node 20+: `npx <name>@latest <path>` boots UI in ≤ 10s including download.
- `--help` lists every flag with examples.
- Works from any subdirectory of a project.

**Dependencies.** Phase 0 (CI). Finalize after Phase 1.

---

## Phase 6 — Quality, Telemetry, Security, Performance

**Goal.** Hit demo-quality launch bar. No critical bugs. Every advertised feature works on the 6 demo repos. Helpful errors. Opt-in telemetry. Defensible security posture.

**Steps**
1. **Demo-repo regression suite.** `tests/e2e/` runs full pipeline (intake → analyze → run → storyboard → diff) headlessly against: `examples/order-api`, `mjgs/minimal-express-typescript`, `expressjs/express` (preview-only OK), `gothinkster/node-express-realworld-example-app`, plus 2 Python repos.
2. **Error message audit.** Every `throw` / `res.status(...).json({error})` / UI error: code, human cause, suggested action.
3. **Telemetry (anonymous, opt-in).** First-run prompt, default off. If on: anonymous machine ID hash, version, language detected, entry-point count buckets, run count, success/failure, error categories. Document in `docs/telemetry.md`. `rsd telemetry off` flag.
4. **Crash reports.** Sentry (free tier) gated by same opt-in.
5. **Security pass.** Path-traversal tests on `/api/source` (`..`, symlinks, URL-encoded). Server binds `127.0.0.1` only by default. Document threat model. `npm audit --production` clean.
6. **Performance budgets.** Time to first entry point ≤ 3s on `examples/order-api`, ≤ 15s on `expressjs/express`. Time to first frame after Run ≤ 2s. Memory < 500MB during a 100-frame run.
7. **Accessibility.** Focus rings, ARIA labels on icon-only buttons, color-contrast audit, prefers-reduced-motion respect.
8. **Logging.** `--verbose` produces structured pino log; default UI shows phase status only.

**Acceptance**
- Demo-repo e2e suite passes in CI.
- `npm audit --production` clean.
- Path-traversal cases for `/api/source` all return 400.
- Lighthouse a11y ≥ 90 on every screen.
- Telemetry doc lists every field; opt-out demonstrably stops emission.

**Dependencies.** Phases 1, 2, 4 feature-complete.

---

## Phase 7 — Docs, Site, Launch Assets

**Goal.** First-time visitor lands on the README/site, understands what RSD does in <30s, runs it in <2 min.

**Steps**
1. **README rewrite.** Hero GIF (10s), one-paragraph pitch, single install/run command, 3-screenshot tour, link to docs.
2. **Docs site.** Static (Docusaurus or Vitepress) at `/docs/` covering: install, first run, language support matrix, entry-point detection rules, `.rsd` files, telemetry, troubleshooting, FAQ.
3. **Demo video.** 90-second screencast, voiced over, ending on `npx rsd <path>`. Embed in README.
4. **Landing page** (optional): single-page site with GIF, CTA to GitHub, install command. Cloudflare Pages or GH Pages.
5. **Pre-written launch artifacts.** Show HN draft, /r/programming + /r/node + /r/Python posts, Twitter/X + Bluesky + Mastodon threads, Dev.to article (reuse `ARTICLE/` material).
6. **Versioning policy** in `docs/versioning.md`: semver, breaking changes only at major bumps until 1.0.

**Acceptance**
- Brand-new tester reaches "I see a traced run" in ≤ 2 minutes from README.
- Docs site builds in CI and deploys on tag.

**Dependencies.** Phases 1–6 user-visible work locked.

---

## Phase 8 — Soft Launch & Iteration

**Goal.** Catch embarrassing bugs before public launch. Lock v1.0.

**Steps**
1. Tag `v0.9.0-rc.1`. Publish to npm under `next` dist-tag.
2. Recruit 8–15 testers, give them a structured task list and bug-report template.
3. Triage daily. Hard cap: only fix critical "blocks the demo task list" bugs in this window. Defer everything else.
4. Cut `v1.0.0` once cap-list is clean and CI green.
5. Final pre-launch checklist: README, docs, demo video, npm publish, telemetry opt-out verified, crash reporting verified, GitHub Issues triage labels ready.

**Acceptance**
- ≥ 5 testers complete canonical task list end-to-end without a bug.
- Zero open `critical` issues at v1.0 cut.

**Dependencies.** Phase 7.

---

## Phase 9 — Public Launch

**Steps**
1. Publish `1.0.0` to npm.
2. Show HN. Twitter/Bluesky thread.
3. Post to /r/programming, /r/node, /r/Python, /r/javascript, lobste.rs (if invited), Dev.to (longform).
4. Monitor: HN comments, GitHub Issues, telemetry dashboard, Sentry.
5. Hotfix policy: ship `1.0.x` patches within 24h for crashers; weekly batch otherwise.
6. Public roadmap (`ROADMAP.md` derived from Phase 10).

**Acceptance**
- Repo is publicly discoverable, `npx <name>` works, posts are live.
- Hotfix path verified by deliberately publishing a `1.0.1` patch within launch week.

**Dependencies.** Phase 8.

---

## Phase 10 — Post-Launch (sequenced; not v1.0)

In priority order:

1. **VS Code extension** — embed the storyboard panel in the editor.
2. **LLM assist (re-introduced)** — bring back `LlmAssistPanel`, second-class layer over evidence.
3. **Frame annotations / saved notes** — share-friendly comments persisted with the run.
4. **Private GitHub repo support** — OAuth device flow, never store tokens server-side.
5. **Multi-language** — Go, Java, Ruby, Rust (each ≈ Phase 4-sized).
6. **Hosted "publish run"** — share `.rsd` via a short URL on a tiny hosted backend.
7. **Annotations / collaboration** — per-frame comments, threaded.
8. **Diff-on-PR GitHub Action** — RSD against base/head, posts a PR comment.

---

## Cross-cutting (handled inside the relevant phase)

- **Testing.** Phase 0 sets up CI; Phase 1 adds Playwright UI smoke tests; Phase 4 adds Python integration tests; Phase 6 adds demo-repo e2e suite.
- **Security.** Threat model in Phase 0 `SECURITY.md`; path-traversal + dependency-audit tests in Phase 6.
- **Performance.** Budgets defined in Phase 0, measured in Phase 1, enforced in Phase 6.
- **Telemetry.** Stub in Phase 0 (no-op), real implementation in Phase 6, dashboard reviewed in Phase 9.
- **Error handling.** Audited and rewritten in Phase 1 (UI) and Phase 6 (server).
