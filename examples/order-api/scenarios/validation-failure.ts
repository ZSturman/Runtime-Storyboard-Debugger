// Scenario 3: Validation failure — early exit
// An empty order is submitted, triggering validation failure.
// Proves the tool can show shortened causal stories and explain why execution stopped.

import { createOrder, resetOrderCounter } from '../src/services/order-service';

export function run() {
  resetOrderCounter();

  const result = createOrder([]);

  return result;
}
