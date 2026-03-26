# Product Overview

## What is Runtime Storyboard Debugger?

Runtime Storyboard Debugger (RSD) is a developer tool that transforms software execution into navigable causal stories. Rather than reading logs, setting breakpoints, or mentally tracing code paths, developers get a structured narrative of what happened and why.

## The Problem

Understanding code behavior is hard:
- **New team members** spend weeks building mental models of unfamiliar codebases
- **Bug investigators** trace execution paths manually across dozens of files
- **Code reviewers** can't easily verify behavioral claims in PRs
- **Async operations** make causality invisible — you can't step through a setTimeout

## The Solution

RSD combines two approaches:

### Static Analysis (What *could* happen)
- Discovers entry points (HTTP routes, exported functions, main patterns)
- Builds control flow graphs showing possible execution paths
- Identifies branch points, async operations, and side effects

### Runtime Tracing (What *actually* happened)
- Instruments code with a Babel plugin — no source modifications needed
- Captures function calls, branch decisions, async boundaries, and side effects
- Records actual variable values at decision points

### Storyboard Generation (The narrative)
- Converts trace events into linked narrative frames
- Generates human-readable descriptions explaining each step
- Links async continuations to show causality across boundaries
- Explains *why* each branch was taken using real runtime values

## Key Design Decisions

1. **No LLM dependency** — All narration uses deterministic templates. The tool works offline, is fast, and produces consistent output.

2. **Babel-based instrumentation** — Code transformation happens at the AST level, supporting complex patterns like async/await, arrow functions, and conditional expressions.

3. **AsyncLocalStorage for context** — Node.js native async context propagation ensures trace events are properly scoped even across async boundaries.

4. **Scenario-driven execution** — Rather than intercepting arbitrary HTTP requests, scenarios are explicit functions that exercise specific code paths. This makes results reproducible and deterministic.

5. **Separation of static and dynamic** — The flow graph (static) shows what's possible; the storyboard (dynamic) shows what happened. Comparing them reveals untested paths.
