# Validation Guide

## Automated Checks
- Run the focused GitHub intake regression suite:

```bash
env PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm test -- tests/unit/server/workspaces.test.ts
```

- Run the broader test suite:

```bash
env PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm test
```

- Run typechecking for both packages:

```bash
env PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm run lint
```

## GitHub Intake Smoke Tests
- Create a workspace from `https://github.com/owner/repo`.
  Expect the workspace to ingest successfully and display `owner/repo`.
- Create a workspace from `https://github.com/owner/repo.git`.
  Expect the same repo normalization as the root URL.
- Create a workspace from `https://github.com/owner/repo/tree/main`.
  Expect the workspace label to show `owner/repo@main`.
- Create a workspace from `https://github.com/owner/repo/blob/main/path/to/file.ts`.
  Expect the workspace label to show `owner/repo@main (focus: path/to/file.ts)`.
- Use a repo whose source is not under the old sparse allowlist.
  Expect entry points and startup hints to still appear because the checkout is no longer path-pruned.

## Regression Expectations
- No GitHub intake path should invoke sparse-checkout commands.
- Cached root clones should reuse the checkout without extra Git commands.
- Cached ref-based clones should refresh with `fetch` plus `checkout FETCH_HEAD`.
- Local-path workspace creation should still produce entry points, scripts, and likely journeys.

## Known Limits In This Increment
- Public `github.com` URLs only.
- `focusPath` is a stored UI hint, not an analysis scope limiter.
- `tree/blob` refs are intentionally parsed conservatively as the first segment after `tree/` or `blob/`.
