# Contributing to Runtime Storyboard Debugger

Thanks for considering a contribution. RSD is a solo-maintained, public OSS project working toward its first stable release. This document covers how to file issues, set up the project, and submit changes.

## Project status

RSD is **pre-1.0**. Expect breaking changes between minor versions until 1.0. The current focus is everything tracked in [docs/release-plan.md](docs/release-plan.md).

## Filing issues

- **Bug reports** — use the bug template. Include the OS, Node version, target repo language (JS/TS or Python), and exact CLI / steps you ran.
- **Feature requests** — use the feature template. Tell us the *user problem* first, then the proposed shape.
- **Security issues** — see [SECURITY.md](SECURITY.md). Don't open a public issue for sensitive disclosures.

Before filing, please search existing issues. Duplicate reports will be closed with a link to the original.

## Local development

Requirements: Node.js **20+**, npm 10+. Python support arrives in a later phase and isn't required for general work.

```bash
git clone https://github.com/ZSturman/Runtime-Storyboard-Debugger.git
cd Runtime-Storyboard-Debugger
npm install
npm run dev          # starts core server + UI together
```

The UI opens at http://localhost:3000 and proxies to the API server on port 3001.

### Useful commands

```bash
npm test             # vitest run
npm run test:watch   # vitest in watch mode
npm run lint         # tsc --noEmit on core + ui
npm run build        # build core then ui
```

## Pull requests

1. Fork and create a topic branch off `main`.
2. Make focused commits — one logical change per commit.
3. Run `npm run lint && npm test && npm run build` locally; CI will re-run them.
4. Open a PR using the template. Link the issue it closes (`Closes #N`).
5. Be patient — this is solo-maintained. PRs that don't fit the current phase may be deferred or declined; please discuss large changes in an issue first.

### Coding conventions

- TypeScript strict mode, no `any` without justification.
- React function components + hooks. No class components.
- Tailwind utility classes for UI; reuse `rsd-*` design tokens.
- New analyzer/instrumenter behavior must come with unit tests under `tests/unit/`.
- Don't add docstrings, comments, or refactors beyond the change at hand.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## License

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
