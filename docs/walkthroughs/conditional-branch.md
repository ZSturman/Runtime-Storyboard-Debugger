# Walkthrough: Conditional Branch — Discount Applied

## Scenario

An order with total exceeding $100 triggers the discount branch. This proves the tool can explain why one branch was taken over another, showing actual variable values.

## Input

```typescript
createOrder([
  { name: 'Premium Widget', price: 75, quantity: 2 }
]);
```

## Expected Storyboard Flow

```
1. Entering createOrder         → items=[{Premium Widget, $75, qty:2}]
2. Entering validateOrder       → Validates items
3. validateOrder returns        → { valid: true }
4. Decision: total > 100        → total=150 → TRUE
   "Why This Path?": Evaluated: total > 100 (where total = 150) → true.
   The condition was met, so the primary branch was taken.
5. Entering calculateDiscount   → total=150
6. calculateDiscount returns    → { applied: true, discountAmount: 15, rate: 0.1 }
7. Entering updateInventory     → Updates stock
8. Side Effect: Console output  → "Updated inventory for Premium Widget: -2"
9. updateInventory returns      → Inventory records
10. createOrder returns         → { success: true, order: { finalTotal: 135, ... } }
```

## What This Proves

- **Branch explanation**: The "Why This Path?" section shows the condition (`total > 100`), the runtime value (`total = 150`), the result (`true`), and a plain-English explanation
- **Variable capture**: The actual value of `total` at decision time is recorded and displayed
- **Alternative path visibility**: The narrative notes that the alternate (no-discount) path was not taken
- **Downstream impact**: The discount of $15 is visible in the final order total ($135 instead of $150)
