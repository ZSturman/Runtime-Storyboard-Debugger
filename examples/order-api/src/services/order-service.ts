import type { OrderItem, Order, OrderResult } from '../types';
import { validateOrder } from './validator';
import { calculateDiscount } from './discount';
import { updateInventory } from './inventory';
import { scheduleNotification } from './notifications';

let orderCounter = 0;

function generateOrderId(): string {
  return `ORD-${++orderCounter}`;
}

/**
 * Core order processing function.
 * This is the main orchestrator that all scenarios exercise.
 */
export function createOrder(items: OrderItem[], notify: boolean = false): OrderResult {
  // Step 1: Validate the order
  const validation = validateOrder(items);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Step 2: Calculate the total
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Step 3: Apply discount if applicable
  const discountResult = calculateDiscount(total);
  const finalTotal = total - discountResult.discountAmount;

  // Step 4: Update inventory (side effect)
  const inventoryUpdates = updateInventory(items);

  // Step 5: Build the order
  const order: Order = {
    id: generateOrderId(),
    items,
    total,
    discount: discountResult.discountAmount,
    finalTotal,
    status: 'confirmed',
    notify,
    timestamp: Date.now(),
  };

  // Step 6: Schedule notification if requested (async handoff)
  if (notify) {
    scheduleNotification(order);
  }

  console.log(`Order ${order.id} created: $${finalTotal} (${items.length} items)`);

  return {
    success: true,
    order,
  };
}

export function resetOrderCounter(): void {
  orderCounter = 0;
}
