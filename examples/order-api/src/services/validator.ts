import type { OrderItem } from '../types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateOrder(items: OrderItem[]): ValidationResult {
  if (!items || !Array.isArray(items)) {
    return { valid: false, error: 'Order items must be an array' };
  }

  if (items.length === 0) {
    return { valid: false, error: 'Order must contain at least one item' };
  }

  for (const item of items) {
    if (!item.name || typeof item.name !== 'string') {
      return { valid: false, error: `Item name is required and must be a string` };
    }

    if (typeof item.price !== 'number' || item.price <= 0) {
      return { valid: false, error: `Item "${item.name}" has an invalid price: ${item.price}` };
    }

    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      return { valid: false, error: `Item "${item.name}" has an invalid quantity: ${item.quantity}` };
    }
  }

  return { valid: true };
}
