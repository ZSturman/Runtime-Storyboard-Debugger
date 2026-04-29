# Runtime Storyboard Debugger Architecture

## Source Normalization
- A workspace source is normalized before ingestion.
- Local sources use:
  - `type: local-path`
  - `path`
- GitHub sources use:
  - `type: github-url`
  - `owner`
  - `repo`
  - `ref?`
  - `focusPath?`
  - `url`

### Current Rules
- Repo root URLs produce `owner` and `repo`.
- `.git` suffixes are stripped from the normalized repo name.
- `tree/<ref>` URLs store `ref`.
- `tree/<ref>/<path>` and `blob/<ref>/<path>` store both `ref` and `focusPath`.
- Analysis still runs against the full checkout. `focusPath` is preserved only as a navigation hint for now.

## GitHub Ingestion
- GitHub ingestion now uses a shallow partial clone:
  - `git clone --depth 1 --filter=blob:none --single-branch`
  - optional `--branch <ref>` when a ref is supplied
- The working tree is no longer pruned with sparse checkout.
- Cached ref workspaces refresh with:
  - `git fetch --depth 1 origin <ref>`
  - `git checkout --force FETCH_HEAD`

## Current Story Model
- Deterministic analysis currently produces:
  - entry points
  - startup files
  - package scripts
  - flow graphs
  - unfinished work findings
  - runtime blockers
- Runtime capture produces:
  - function entry and return steps
  - branch steps
  - state snapshots
  - side effects
  - waits and async continuations
  - stdout/stderr log steps
  - fallback summaries

## Next Model To Introduce
- The next increment should add a first-class navigation layer that distinguishes:
  - confirmed runtime transitions
  - inferred next transitions
  - speculative possibilities

### Target Concepts
- `EntryPointNode`
- `ExecutionNode`
- `StateSnapshot`
- `BranchCondition`
- `NavigationEdge`
- `EvidenceRecord`
- `ConfidenceLevel`

### Required Edge Semantics
- Every “what can happen next?” option should carry:
  - source node id
  - destination node id
  - label
  - reason
  - evidence type
  - confidence

### Evidence Types
- `confirmed-runtime`
- `deterministic-static`
- `heuristic-inference`
- `llm-assisted`

## UI Direction
- The UI should render runtime evidence and inferred options in the same navigable structure.
- Selecting a node or state should reveal:
  - what actually happened next
  - what else could happen next
  - why each option is available
  - which code and evidence support each option
- LLM or agent assistance should remain additive and explicitly labeled, never replacing the deterministic baseline.
