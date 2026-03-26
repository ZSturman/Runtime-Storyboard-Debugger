// Scenario 1: Straight-through request flow
// A simple valid order with a single inexpensive item.
// Exercises the happy path with no branching, no async, no special handling.

import { createOrder, resetOrderCounter } from '../src/services/order-service';
import { resetStock } from '../src/services/inventory';

export function run() {
  resetOrderCounter();
  resetStock();

  const result = createOrder([
    { name: 'Widget', price: 25, quantity: 1 },
  ]);

  return result;
}
