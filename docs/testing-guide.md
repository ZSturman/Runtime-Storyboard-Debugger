# Testing Guide

## Running Tests

```bash
# Run all tests
npm test

# Run with verbose output
npx vitest run --reporter=verbose

# Run specific test file
npx vitest run tests/unit/storyboard/frame-builder.test.ts

# Run in watch mode
npx vitest
```

## Test Structure

```
tests/
  unit/
    analyzer/
      entry-points.test.ts      # AST-based entry point discovery
    instrumenter/
      babel-plugin.test.ts       # Babel transform correctness
    storyboard/
      frame-builder.test.ts      # Trace → frame conversion + narrator
  scenarios/
    integration.test.ts          # Full pipeline: instrument → trace → storyboard
```

## Unit Tests

### Entry Point Discovery (`entry-points.test.ts`)
Tests that the analyzer correctly identifies:
- Express route handlers (`app.get`, `app.post`, etc.)
- Named exported functions
- Default exported functions
- Main function patterns
- Function parameters with types
- Unique ID assignment

### Babel Plugin (`babel-plugin.test.ts`)
Tests that the instrumenter correctly:
- Injects the `__rsd` runtime declaration
- Wraps function declarations with `enter`/`exit` calls
- Instruments arrow functions
- Captures if-statement conditions with `branch` calls
- Extracts condition variable values
- Detects side-effect patterns (console.log, etc.)
- Preserves original code semantics
- Handles edge cases (no params, complex async code)

### Frame Builder + Narrator (`frame-builder.test.ts`)
Tests that the storyboard engine:
- Creates function-entry frames from enter events
- Creates return frames with captured values
- Creates branch frames with BranchInfo
- Creates side-effect frames
- Creates error frames
- Creates async boundary and handoff frames with continuation links
- Links frames via nextFrameId
- Assigns sequential sequence numbers
- Generates readable titles and descriptions
- Explains branches with variable values
- Describes side effects by type

## Integration Tests

### Full Pipeline (`integration.test.ts`)
Tests the complete instrument → trace → build pipeline:
- Instruments plain JavaScript code with the Babel plugin
- Executes instrumented code inside a trace context
- Builds storyboard frames from collected events
- Verifies frame types, function names, branch decisions
- Verifies return values are captured
- Verifies branch taken/not-taken with narration
- Verifies side effects from console calls
- Verifies frame linking integrity
- Tests entry point discovery against the example app source

## Test Scenarios

The five example scenarios exercise specific capabilities:

| Scenario | File | Core Capability |
|---|---|---|
| Straight-through | `straight-through.ts` | Clean causal chain, no branching |
| Conditional branch | `conditional-branch.ts` | Branch explanation with runtime values |
| Validation failure | `validation-failure.ts` | Early exit, error framing |
| Async handoff | `async-handoff.ts` | Cross-async-boundary causality |
| Side effects | `side-effects.ts` | State change visibility |
