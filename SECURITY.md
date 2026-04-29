# Security Policy

## Threat model

Runtime Storyboard Debugger is a **local developer tool** that:

- Reads source code from a directory you point it at.
- **Executes that source code** in the same Node.js process to capture runtime traces.
- Serves a UI on `127.0.0.1` (loopback only) by default.

This means:

- **Do not run RSD against code you do not trust.** Tracing arbitrary code is equivalent to running it.
- **Do not bind the server to a public interface.** The default `127.0.0.1` binding is intentional. The `--host` flag (when added) is opt-in for LAN sharing only.
- **Storyboards may contain real data.** Captured frames include runtime variable values, HTTP request bodies, and side-effect payloads (DB writes, log output) from the code being traced. Treat `.rsd` exports as you would treat a memory dump of the process.
- **LLM credentials**, when used, live in server process memory only. They are not persisted. Don't run RSD as a long-lived daemon if this matters to you.

## Supported versions

While the project is pre-1.0, only the latest published version receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | yes       |
| < latest | no       |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email **zacharysturman@gmail.com** with:

- A description of the issue.
- Steps to reproduce.
- The version / commit affected.
- Any suggested fix.

You'll get an acknowledgment within 5 business days. Coordinated disclosure is appreciated; expect a fix or mitigation timeline in the first response.

## Out of scope

The following are known design properties, not vulnerabilities:

- The server runs untrusted code from the targeted workspace. That's the whole point.
- The server binds to localhost without authentication. Localhost is the trust boundary.
- `/api/source` reads files inside the configured `targetDir`. Path-traversal *outside* `targetDir` would be a vulnerability; reads inside it are intended.
