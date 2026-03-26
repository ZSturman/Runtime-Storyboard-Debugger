# Walkthrough: Side Effect Visibility — Inventory Updates

## Scenario

An order with multiple items and quantities triggers visible inventory side effects. This proves the tool can surface state changes and impactful actions clearly.

## Input

```typescript
createOrder([
  { name: 'Widget', price: 25, quantity: 3 },
  { name: 'Gadget', price: 15, quantity: 2 }
]);
```

## Expected Storyboard Flow

```
1. Entering createOrder            → items=[{Widget, $25, qty:3}, {Gadget, $15, qty:2}]
2. Entering validateOrder          → Validates items
3. validateOrder returns           → { valid: true }
4. Decision: total > 100           → total=105 → TRUE (discount triggered!)
5. Entering calculateDiscount      → total=105
6. calculateDiscount returns       → { applied: true, discountAmount: 10.5 }
7. Entering updateInventory        → Processing 2 items
8. Side Effect: Console output     → "Updated inventory for Widget: -3"
9. Side Effect: Console output     → "Updated inventory for Gadget: -2"
10. updateInventory returns        → [{Widget, -3}, {Gadget, -2}]
11. Side Effect: Console output    → "Order ORD-1 created: $94.5 (2 items)"
12. createOrder returns            → { success: true, order: { finalTotal: 94.5, ... } }
```

## What This Proves

- **Side effect surfacing**: Each `console.log` call in `updateInventory` appears as an explicit frame
- **Multiple side effects**: Both inventory updates are individually visible (Widget: -3, Gadget: -2)
- **Side effect context**: Each effect shows which function produced it and on which line
- **Cumulative impact**: The storyboard shows the combined effect of all operations on the final order total
- **Unexpected branch**: With total=$105, this scenario also triggers the discount branch — the storyboard captures this emergent behavior
