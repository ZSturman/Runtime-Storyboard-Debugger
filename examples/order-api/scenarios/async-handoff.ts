// Scenario 4: Async handoff — notification sent
// A valid order with notify=true triggers an async email notification.
// Proves the tool can express causality across an async boundary.

import { createOrder, resetOrderCounter } from '../src/services/order-service';
import { resetStock } from '../src/services/inventory';

export function run() {
  resetOrderCounter();
  resetStock();

  const result = createOrder(
    [{ name: 'Gadget', price: 30, quantity: 1 }],
    true  // notify = true → triggers async notification
  );

  return result;
}
