# Walkthrough: Validation Failure — Early Exit

## Scenario

An empty order submissions triggers validation failure. This proves the tool can show shortened causal stories and explain why execution stopped early.

## Input

```typescript
createOrder([]);
```

## Expected Storyboard Flow

```
1. Entering createOrder      → items=[]
2. Entering validateOrder    → Validates items array
3. validateOrder returns     → { valid: false, error: "Order must contain at least one item" }
4. Decision: !validation.valid → true → early return branch taken
   "Why This Path?": Validation failed, triggering early exit.
5. createOrder returns       → { success: false, error: "Order must contain at least one item" }
```

## What This Proves

- **Shortened story**: The storyboard is only 5 frames instead of 12+ — the tool shows that most of the function was skipped
- **Early exit clarity**: The narrative explains why execution stopped (validation failure)
- **Error propagation**: The error message flows from validateOrder through to the final return
- **Missing frames are meaningful**: The absence of discount, inventory, and notification frames tells the story of what *didn't* happen
