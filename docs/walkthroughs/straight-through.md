# Walkthrough: Straight-Through Request Flow

## Scenario

A simple valid order with a single inexpensive item. This exercises the happy path with no branching, no async notifications, and no special handling.

## Input

```typescript
createOrder([
  { name: 'Widget', price: 25, quantity: 1 }
]);
```

## Expected Storyboard Flow

```
1. Entering createOrder        → Called with items=[{Widget, $25, qty:1}]
2. Entering validateOrder      → Checks items array is non-empty and valid
3. validateOrder returns       → { valid: true }
4. Decision: total > 100       → total=25, condition false → no discount branch
5. Entering calculateDiscount  → total=25
6. calculateDiscount returns   → { applied: false, discountAmount: 0 }
7. Entering updateInventory    → Updates stock for Widget
8. Side Effect: Console output → "Updated inventory for Widget: -1"
9. updateInventory returns     → Inventory update records
10. Decision: notify           → notify=false → skip notification
11. Side Effect: Console output → "Order ORD-1 created: $25 (1 items)"
12. createOrder returns        → { success: true, order: {...} }
```

## What This Proves

- **Clean causal chain**: Every function call links to the next without gaps
- **Narrative readability**: Each frame describes what happened in plain English
- **Return value capture**: The storyboard shows what each function produced
- **Side effect surfacing**: Console logs appear as explicit frames
- **Branch visibility**: Even non-taken branches (discount, notification) are visible
