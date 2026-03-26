# Walkthrough: Async Handoff — Notification Sent

## Scenario

A valid order with `notify=true` triggers an asynchronous email notification. This proves the tool can express causality across an async boundary.

## Input

```typescript
createOrder(
  [{ name: 'Gadget', price: 30, quantity: 1 }],
  true  // notify = true
);
```

## Expected Storyboard Flow

```
1. Entering createOrder           → items=[{Gadget, $30, qty:1}], notify=true
2. Entering validateOrder         → Validates items
3. validateOrder returns          → { valid: true }
4. Decision: total > 100          → total=30 → false (no discount)
5. Entering calculateDiscount     → total=30
6. calculateDiscount returns      → { applied: false, discountAmount: 0 }
7. Entering updateInventory       → Updates stock
8. updateInventory returns        → Records
9. Decision: notify               → notify=true → TRUE
   "Why This Path?": The notify flag was set, triggering notification scheduling.
10. Entering scheduleNotification → Async: scheduling email
11. Await boundary                → Pausing for async setTimeout
12. Async continuation            → setTimeout resolved, email "sent"
13. Side Effect: Notification     → Email notification scheduled for order
14. createOrder returns           → { success: true, order: {...} }
```

## What This Proves

- **Async boundary visibility**: Frames 11-12 show the pause point and continuation
- **Cross-boundary linking**: The await-boundary frame links to its async-handoff frame via `asyncContinuationId`
- **Fire-and-forget tracking**: Even though `scheduleNotification` uses setTimeout (not awaited by the caller), the trace captures what happened inside it
- **Conditional async**: The `notify` branch decision explains why the notification path was entered
