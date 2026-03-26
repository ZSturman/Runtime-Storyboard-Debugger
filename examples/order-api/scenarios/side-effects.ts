// Scenario 5: Side effect visibility — inventory updates
// An order with multiple quantities triggers visible inventory side effects.
// Proves the tool can surface state changes and impactful actions clearly.

import { createOrder, resetOrderCounter } from '../src/services/order-service';
import { resetStock } from '../src/services/inventory';

export function run() {
  resetOrderCounter();
  resetStock();

  const result = createOrder([
    { name: 'Widget', price: 25, quantity: 3 },
    { name: 'Gadget', price: 15, quantity: 2 },
  ]);

  return result;
}
