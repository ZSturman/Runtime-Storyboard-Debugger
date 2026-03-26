// Scenario 2: Conditional branch — discount applied
// Order total exceeds $100, triggering the discount branch.
// Proves the tool can explain why one branch was taken over another.

import { createOrder, resetOrderCounter } from '../src/services/order-service';
import { resetStock } from '../src/services/inventory';

export function run() {
  resetOrderCounter();
  resetStock();

  const result = createOrder([
    { name: 'Premium Widget', price: 75, quantity: 2 },
  ]);

  return result;
}
